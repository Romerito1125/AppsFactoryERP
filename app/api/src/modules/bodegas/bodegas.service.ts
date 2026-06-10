import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { FilterWarehousesDto } from './dto/filter-warehouses.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class BodegasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filter: FilterWarehousesDto) {
    return this.prisma.warehouse.findMany({
      where: this.getStatusWhere(filter.estado),
      orderBy: { id: 'asc' },
    });
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

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
