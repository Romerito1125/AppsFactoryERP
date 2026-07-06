import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { FilterClientsDto } from './dto/filter-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FilterClientsDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({ where, orderBy: { id: 'asc' }, skip, take }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const client = await this.prisma.client.findUnique({ where: { id } });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return client;
  }

  async create(createClientDto: CreateClientDto) {
    const existingClient = await this.prisma.client.findUnique({
      where: { identification: createClientDto.identification },
    });

    if (existingClient) {
      throw new ConflictException('La identificación ya existe');
    }

    return this.prisma.client.create({ data: createClientDto });
  }

  async update(id: number, updateClientDto: UpdateClientDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateClientDto.identification) {
      const existingClient = await this.prisma.client.findUnique({
        where: { identification: updateClientDto.identification },
      });

      if (existingClient && existingClient.id !== id) {
        throw new ConflictException('La identificación ya existe');
      }
    }

    return this.prisma.client.update({ where: { id }, data: updateClientDto });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.client.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.client.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
  }

  async findReferrals(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.referral.findMany({
      where: { referrerClientId: id },
      include: {
        referredClient: {
          select: {
            id: true,
            identification: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }

  async generateReferralCode(id: number) {
    this.ensurePositiveId(id);

    const client = await this.prisma.client.findUnique({ where: { id } });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!client.isActive) {
      throw new BadRequestException(
        'No se puede generar código para un cliente inactivo',
      );
    }

    if (client.referralCode) {
      return client;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const referralCode = this.buildReferralCode(client.firstName, client.id);
      const existingClient = await this.prisma.client.findUnique({
        where: { referralCode },
      });

      if (!existingClient) {
        return this.prisma.client.update({
          where: { id },
          data: { referralCode },
        });
      }
    }

    throw new ConflictException('No fue posible generar un código único');
  }

  async updateReferralLevel(id: number, referralLevel: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.client.update({
      where: { id },
      data: { referralLevel },
    });
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) {
      return undefined;
    }

    if (status === RecordStatusQuery.INACTIVOS) {
      return { isActive: false };
    }

    return { isActive: true };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { identification: { contains: q, mode: 'insensitive' as const } },
        { firstName: { contains: q, mode: 'insensitive' as const } },
        { lastName: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q, mode: 'insensitive' as const } },
        { address: { contains: q, mode: 'insensitive' as const } },
        { referralCode: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }

  private buildReferralCode(firstName: string, id: number) {
    const prefix = firstName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(4, 'X');
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();

    return `${prefix}${id}${suffix}`;
  }
}
