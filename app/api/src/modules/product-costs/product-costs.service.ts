import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateProductCostDto } from './dto/create-product-cost.dto';
import { UpdateProductCostDto } from './dto/update-product-cost.dto';

@Injectable()
export class ProductCostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProduct(productId: number) {
    this.ensurePositiveId(productId);
    await this.ensureProductExists(productId);

    return this.prisma.productCost.findMany({
      where: { productId },
      orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }, { id: 'desc' }],
    });
  }

  async create(productId: number, createProductCostDto: CreateProductCostDto) {
    this.ensurePositiveId(productId);
    await this.ensureProductExists(productId);

    const data = this.normalizeDates(createProductCostDto);

    return this.prisma.$transaction(async (tx) => {
      if (data.isActive ?? true) {
        await tx.productCost.updateMany({
          where: { productId, isActive: true },
          data: { isActive: false, endsAt: data.startsAt ?? new Date() },
        });
      }

      return tx.productCost.create({
        data: {
          productId,
          cost: createProductCostDto.cost,
          unit: createProductCostDto.unit,
          quantity: createProductCostDto.quantity,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          isActive: data.isActive ?? true,
        },
        include: { product: true },
      });
    });
  }

  async update(id: number, updateProductCostDto: UpdateProductCostDto) {
    const current = await this.findOne(id);
    const data = this.normalizeDates(updateProductCostDto, current);

    if (data.isActive === false && data.endsAt === undefined) {
      data.endsAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.isActive === true) {
        await tx.productCost.updateMany({
          where: {
            productId: current.productId,
            id: { not: id },
            isActive: true,
          },
          data: { isActive: false, endsAt: data.startsAt ?? new Date() },
        });
      }

      return tx.productCost.update({
        where: { id },
        data,
        include: { product: true },
      });
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.productCost.update({
      where: { id },
      data: { isActive: false, endsAt: new Date() },
      include: { product: true },
    });
  }

  private async findOne(id: number) {
    this.ensurePositiveId(id);

    const productCost = await this.prisma.productCost.findUnique({
      where: { id },
    });

    if (!productCost) {
      throw new NotFoundException('Costo de producto no encontrado');
    }

    return productCost;
  }

  private async ensureProductExists(id: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (!product.isActive) {
      throw new BadRequestException('El producto está inactivo');
    }
  }

  private normalizeDates(
    dto: CreateProductCostDto | UpdateProductCostDto,
    current?: { startsAt: Date | null; endsAt: Date | null },
  ) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;
    const finalStartsAt = startsAt ?? current?.startsAt ?? undefined;
    const finalEndsAt = endsAt ?? current?.endsAt ?? undefined;

    if (finalStartsAt && finalEndsAt && finalEndsAt <= finalStartsAt) {
      throw new BadRequestException(
        'La fecha final del costo debe ser mayor que la inicial',
      );
    }

    return {
      ...dto,
      startsAt,
      endsAt,
    };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
