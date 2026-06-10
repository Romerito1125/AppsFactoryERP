import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filter: FilterProductsDto) {
    return this.prisma.product.findMany({
      where: this.getStatusWhere(filter.estado),
      include: { warehouse: true },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { warehouse: true },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async create(createProductDto: CreateProductDto) {
    await this.ensureWarehouseExists(createProductDto.warehouseId);

    return this.prisma.product.create({ data: createProductDto });
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateProductDto.warehouseId) {
      await this.ensureWarehouseExists(updateProductDto.warehouseId);
    }

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.product.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.product.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
  }

  private async ensureWarehouseExists(id: number) {
    this.ensurePositiveId(id);

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });

    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }
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
