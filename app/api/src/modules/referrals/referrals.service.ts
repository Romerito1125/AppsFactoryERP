import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { Role } from '../../common/enums/role.enum';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { ListReferralsQueryDto } from './dto/list-referrals-query.dto';
import { ValidateReferralDto } from './dto/validate-referral.dto';
import { UpdateReferralProfitPolicyDto } from './dto/update-referral-profit-policy.dto';

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: ListReferralsQueryDto) {
    const where = this.getSearchWhere(query.q);
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.referral.count({ where }),
      this.prisma.referral.findMany({
        where,
        include: this.referralInclude,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async getProfitSummary() {
    const [benefits, socialContributions] = await Promise.all([
      this.prisma.referralBenefit.findMany({
        where: { status: { not: 'ANULADO' } },
        select: { generation: true, amount: true, remainingAmount: true },
      }),
      this.prisma.referralSocialContribution.findMany({
        where: { originInvoice: { status: 'ACTIVA' } },
        select: { generation: true, amount: true },
      }),
    ]);

    const byGeneration = new Map<
      number,
      { generated: number; available: number; used: number; socialWork: number }
    >();
    const ensureGeneration = (generation: number) => {
      const current = byGeneration.get(generation);
      if (current) return current;
      const created = { generated: 0, available: 0, used: 0, socialWork: 0 };
      byGeneration.set(generation, created);
      return created;
    };

    let generated = 0;
    let available = 0;
    let socialWork = 0;

    for (const benefit of benefits) {
      const amount = Number(benefit.amount);
      const remaining = Number(benefit.remainingAmount);
      const current = ensureGeneration(benefit.generation);
      generated += amount;
      available += remaining;
      current.generated += amount;
      current.available += remaining;
      current.used += Math.max(0, amount - remaining);
    }

    for (const contribution of socialContributions) {
      const amount = Number(contribution.amount);
      const current = ensureGeneration(contribution.generation);
      socialWork += amount;
      current.socialWork += amount;
    }

    const round = (value: number) => this.roundMoney(value);
    const totalGenerated = round(generated);
    const totalAvailable = round(available);
    const totalSocialWork = round(socialWork);

    return {
      porEntregar: totalAvailable,
      descuentoGenerado: totalGenerated,
      descuentoUtilizado: round(totalGenerated - totalAvailable),
      obraSocial: totalSocialWork,
      totalRepartido: round(totalGenerated + totalSocialWork),
      porGeneracion: [...byGeneration.entries()]
        .sort(([left], [right]) => left - right)
        .map(([generation, values]) => ({
          generation,
          ...Object.fromEntries(
            Object.entries(values).map(([key, value]) => [key, round(value)]),
          ),
        })),
    };
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const referral = await this.prisma.referral.findUnique({
      where: { id },
      include: this.referralInclude,
    });

    if (!referral) {
      throw new NotFoundException('Referido no encontrado');
    }

    return referral;
  }

  async create(createReferralDto: CreateReferralDto, actor?: AuthUser) {
    const { codeUsed, referrerClient, referredClient } =
      await this.validateReferralRules(createReferralDto, actor);

    try {
      return await this.prisma.referral.create({
        data: {
          referrerClientId: referrerClient.id,
          referredClientId: referredClient.id,
          codeUsed,
        },
        include: this.referralInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'El cliente ya fue registrado como referido',
        );
      }

      throw error;
    }
  }

  async validate(validateReferralDto: ValidateReferralDto, actor?: AuthUser) {
    const { referrerClient } = await this.validateReferralRules(
      validateReferralDto,
      actor,
    );

    return {
      valid: true,
      referrerClient: {
        id: referrerClient.id,
        firstName: referrerClient.firstName,
        lastName: referrerClient.lastName,
      },
    };
  }

  private async validateReferralRules(
    dto: ValidateReferralDto,
    actor?: AuthUser,
  ) {
    if (
      actor?.role === Role.CLIENTE &&
      actor.clientId !== dto.referredClientId
    ) {
      throw new ForbiddenException(
        'Solo puedes vincular un referido a tu propia cuenta',
      );
    }

    const codeUsed = dto.codeUsed.trim().toUpperCase();
    const referrerClient = await this.prisma.client.findUnique({
      where: { referralCode: codeUsed },
    });

    if (!referrerClient) {
      throw new NotFoundException('Código de referido inexistente');
    }

    if (!referrerClient.isActive) {
      throw new BadRequestException(
        'No se puede usar código de un cliente inactivo',
      );
    }

    const referredClient = await this.prisma.client.findUnique({
      where: { id: dto.referredClientId },
    });

    if (!referredClient) {
      throw new NotFoundException('Cliente referido no encontrado');
    }

    if (!referredClient.isActive) {
      throw new BadRequestException('El cliente referido está inactivo');
    }

    if (referrerClient.id === referredClient.id) {
      throw new BadRequestException('Un cliente no puede referirse a sí mismo');
    }

    const existingReferral = await this.prisma.referral.findUnique({
      where: { referredClientId: referredClient.id },
    });

    if (existingReferral) {
      throw new ConflictException('El cliente ya fue registrado como referido');
    }

    let ancestorId = referrerClient.id;
    const visited = new Set<number>();

    while (!visited.has(ancestorId)) {
      if (ancestorId === referredClient.id) {
        throw new BadRequestException(
          'La relación crearía un ciclo dentro de la red de referidos',
        );
      }

      visited.add(ancestorId);
      const parent = await this.prisma.referral.findUnique({
        where: { referredClientId: ancestorId },
        select: { referrerClientId: true },
      });
      if (!parent) break;
      ancestorId = parent.referrerClientId;
    }

    return { codeUsed, referrerClient, referredClient };
  }

  private readonly referralInclude = {
    referrerClient: {
      select: {
        id: true,
        identification: true,
        firstName: true,
        lastName: true,
        referralCode: true,
      },
    },
    referredClient: {
      select: {
        id: true,
        identification: true,
        firstName: true,
        lastName: true,
      },
    },
  } as const;

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }

  async findProfitPolicies() {
    await this.ensureDefaultProfitPolicies();
    return this.prisma.referralProfitPolicy.findMany({
      orderBy: { generation: 'asc' },
    });
  }

  async updateProfitPolicies(
    policies: UpdateReferralProfitPolicyDto[],
    actor: AuthUser,
  ) {
    if (!Array.isArray(policies) || !policies.length) {
      throw new BadRequestException('Debe enviar al menos una política');
    }

    if (policies.length !== 4) {
      throw new BadRequestException(
        'La politica de referidos debe definir exactamente 4 generaciones',
      );
    }

    const generations = new Set<number>();

    for (const policy of policies) {
      if (!policy || typeof policy !== 'object') {
        throw new BadRequestException('Cada política debe ser un objeto');
      }

      if (!Number.isInteger(policy.generation) || policy.generation <= 0) {
        throw new BadRequestException(
          'La generación debe ser un número entero positivo',
        );
      }

      if (
        typeof policy.percentage !== 'number' ||
        !Number.isFinite(policy.percentage) ||
        policy.percentage < 0 ||
        policy.percentage > 100 ||
        Math.abs(
          Math.round(policy.percentage * 100) / 100 - policy.percentage,
        ) > Number.EPSILON
      ) {
        throw new BadRequestException(
          'El porcentaje debe estar entre 0 y 100 y tener máximo dos decimales',
        );
      }

      if (
        policy.isActive !== undefined &&
        typeof policy.isActive !== 'boolean'
      ) {
        throw new BadRequestException('isActive debe ser booleano');
      }

      if (generations.has(policy.generation)) {
        throw new BadRequestException(
          `La generación ${policy.generation} está repetida`,
        );
      }

      generations.add(policy.generation);
    }

    await this.prisma.$transaction(
      policies.map((policy) =>
        this.prisma.referralProfitPolicy.upsert({
          where: { generation: policy.generation },
          create: {
            generation: policy.generation,
            percentage: policy.percentage,
            isActive:
              policy.generation === 4 ? true : (policy.isActive ?? true),
            isSocialWork: policy.generation === 4,
          },
          update: {
            percentage: policy.percentage,
            ...(policy.generation === 4 || policy.isActive === undefined
              ? {}
              : { isActive: policy.isActive }),
            ...(policy.generation === 4 ? { isActive: true } : {}),
            isSocialWork: policy.generation === 4,
          },
        }),
      ),
    );

    await this.prisma.referralProfitPolicy.updateMany({
      where: { generation: { gt: 4 } },
      data: { isActive: false },
    });

    const result = await this.findProfitPolicies();

    await this.auditLogService.log({
      actor,
      module: 'REFERIDOS',
      action: 'UPDATE_PROFIT_POLICY',
      entityType: 'ReferralProfitPolicy',
      description:
        'Actualizo la politica de utilidad de referidos a 4 generaciones',
      metadata: {
        policies: result.map((policy) => ({
          generation: policy.generation,
          percentage: Number(policy.percentage),
          isActive: policy.isActive,
        })),
      },
    });

    return result;
  }

  private async ensureDefaultProfitPolicies() {
    const defaultPolicies = [
      { generation: 1, percentage: 10 },
      { generation: 2, percentage: 10 },
      { generation: 3, percentage: 5 },
      { generation: 4, percentage: 5 },
    ];

    await this.prisma.$transaction(
      defaultPolicies.map((policy) =>
        this.prisma.referralProfitPolicy.upsert({
          where: { generation: policy.generation },
          create: {
            generation: policy.generation,
            percentage: policy.percentage,
            isActive: true,
            isSocialWork: policy.generation === 4,
          },
          update: {
            isSocialWork: policy.generation === 4,
            ...(policy.generation === 4 ? { isActive: true } : {}),
          },
        }),
      ),
    );
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { codeUsed: { contains: q, mode: 'insensitive' as const } },
        {
          referrerClient: {
            firstName: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          referrerClient: {
            lastName: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          referredClient: {
            firstName: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          referredClient: {
            lastName: { contains: q, mode: 'insensitive' as const },
          },
        },
      ],
    };
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
