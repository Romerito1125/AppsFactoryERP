import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
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

  async create(createReferralDto: CreateReferralDto) {
    const { codeUsed, referrerClient, referredClient } =
      await this.validateReferralRules(createReferralDto);

    return this.prisma.referral.create({
      data: {
        referrerClientId: referrerClient.id,
        referredClientId: referredClient.id,
        codeUsed,
      },
      include: this.referralInclude,
    });
  }

  async validate(validateReferralDto: ValidateReferralDto) {
    const { referrerClient } =
      await this.validateReferralRules(validateReferralDto);

    return {
      valid: true,
      referrerClient: {
        id: referrerClient.id,
        firstName: referrerClient.firstName,
        lastName: referrerClient.lastName,
      },
    };
  }

  private async validateReferralRules(dto: ValidateReferralDto) {
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
            isActive: policy.isActive ?? true,
          },
          update: {
            percentage: policy.percentage,
            ...(policy.isActive === undefined
              ? {}
              : { isActive: policy.isActive }),
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
          },
          update: {},
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
}
