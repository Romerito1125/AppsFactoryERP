import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { FilterWarehousesDto } from './dto/filter-warehouses.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class BodegasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FilterWarehousesDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.warehouse.count({ where }),
      this.prisma.warehouse.findMany({ where, orderBy: { id: 'asc' }, skip, take }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { products: true },
    });

    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }

    return warehouse;
  }

  create(createWarehouseDto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: createWarehouseDto });
  }

  async update(id: number, updateWarehouseDto: UpdateWarehouseDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.warehouse.update({
      where: { id },
      data: updateWarehouseDto,
    });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) return undefined;
    if (status === RecordStatusQuery.INACTIVOS) return { isActive: false };
    return { isActive: true };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return { location: { contains: q, mode: 'insensitive' as const } };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
