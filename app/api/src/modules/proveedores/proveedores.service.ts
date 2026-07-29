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
import { CreateProviderDto } from './dto/create-provider.dto';
import { FilterProvidersDto } from './dto/filter-providers.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FilterProvidersDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.provider.count({ where }),
      this.prisma.provider.findMany({
        where,
        include: {
          _count: { select: { productLinks: true, purchaseOrders: true } },
        },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      include: {
        _count: { select: { productLinks: true, purchaseOrders: true } },
      },
    });
    if (!provider) throw new NotFoundException('Proveedor no encontrado');
    return provider;
  }

  async create(dto: CreateProviderDto) {
    await this.ensureUniqueName(dto.name);
    return this.prisma.provider.create({ data: dto });
  }

  async update(id: number, dto: UpdateProviderDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);
    if (dto.name) await this.ensureUniqueName(dto.name, id);
    return this.prisma.provider.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);
    const activeProducts = await this.prisma.productProvider.count({
      where: { providerId: id, product: { isActive: true } },
    });
    if (activeProducts > 0) {
      throw new BadRequestException(
        'No se puede desactivar un proveedor con productos activos asociados',
      );
    }
    return this.prisma.provider.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);
    return this.prisma.provider.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
  }

  private async ensureUniqueName(name: string, exceptId?: number) {
    const existing = await this.prisma.provider.findUnique({ where: { name } });
    if (existing && existing.id !== exceptId)
      throw new ConflictException('El nombre del proveedor ya existe');
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) return undefined;
    if (status === RecordStatusQuery.INACTIVOS) return { isActive: false };
    return { isActive: true };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0)
      throw new BadRequestException('El id debe ser un número positivo');
  }
}
