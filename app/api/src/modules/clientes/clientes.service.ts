import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { FilterClientsDto } from './dto/filter-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filter: FilterClientsDto) {
    return this.prisma.client.findMany({
      where: this.getStatusWhere(filter.estado),
      orderBy: { id: 'asc' },
    });
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

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) {
      return undefined;
    }

    if (status === RecordStatusQuery.INACTIVOS) {
      return { isActive: false };
    }

    return { isActive: true };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
