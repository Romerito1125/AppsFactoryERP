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
import { CreateReferralDto } from './dto/create-referral.dto';
import { ListReferralsQueryDto } from './dto/list-referrals-query.dto';
import { ValidateReferralDto } from './dto/validate-referral.dto';

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { codeUsed: { contains: q, mode: 'insensitive' as const } },
        { referrerClient: { firstName: { contains: q, mode: 'insensitive' as const } } },
        { referrerClient: { lastName: { contains: q, mode: 'insensitive' as const } } },
        { referredClient: { firstName: { contains: q, mode: 'insensitive' as const } } },
        { referredClient: { lastName: { contains: q, mode: 'insensitive' as const } } },
      ],
    };
  }
}
