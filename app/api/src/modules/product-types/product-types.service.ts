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
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { FilterProductTypesDto } from './dto/filter-product-types.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';

@Injectable()
export class ProductTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FilterProductTypesDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.productType.count({ where }),
      this.prisma.productType.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const productType = await this.prisma.productType.findUnique({
      where: { id },
    });

    if (!productType) {
      throw new NotFoundException('Tipo de producto no encontrado');
    }

    return productType;
  }

  async create(createProductTypeDto: CreateProductTypeDto) {
    await this.ensureUniqueName(createProductTypeDto.name);

    return this.prisma.productType.create({ data: createProductTypeDto });
  }

  async update(id: number, updateProductTypeDto: UpdateProductTypeDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateProductTypeDto.name) {
      await this.ensureUniqueName(updateProductTypeDto.name, id);
    }

    return this.prisma.productType.update({
      where: { id },
      data: updateProductTypeDto,
    });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    const activeProducts = await this.prisma.product.count({
      where: { productTypeId: id, isActive: true },
    });

    if (activeProducts > 0) {
      throw new BadRequestException(
        'No se puede desactivar un tipo de producto con productos activos asociados',
      );
    }

    return this.prisma.productType.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.productType.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
  }

  private async ensureUniqueName(name: string, currentId?: number) {
    const existingProductType = await this.prisma.productType.findUnique({
      where: { name },
    });

    if (existingProductType && existingProductType.id !== currentId) {
      throw new ConflictException('El nombre del tipo de producto ya existe');
    }
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
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
