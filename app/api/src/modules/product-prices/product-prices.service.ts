import {
  BadRequestException,
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
import { CreateProductPriceDto } from './dto/create-product-price.dto';
import { FilterProductPricesDto } from './dto/filter-product-prices.dto';
import { UpdateProductPriceDto } from './dto/update-product-price.dto';

@Injectable()
export class ProductPricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: FilterProductPricesDto) {
    const where = {
      ...this.getStatusWhere(query.estado),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.productPrice.count({ where }),
      this.prisma.productPrice.findMany({
        where,
        include: { product: true },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const productPrice = await this.prisma.productPrice.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!productPrice) {
      throw new NotFoundException('Precio de producto no encontrado');
    }

    return productPrice;
  }

  async findByProduct(productId: number) {
    this.ensurePositiveId(productId);
    await this.ensureProductExists(productId);

    return this.prisma.productPrice.findMany({
      where: { productId },
      include: { product: true },
      orderBy: { id: 'asc' },
    });
  }

  async create(
    productId: number,
    createProductPriceDto: CreateProductPriceDto,
    actor: AuthUser,
  ) {
    this.ensurePositiveId(productId);
    await this.ensureProductExists(productId);

    const data = this.normalizeDates(createProductPriceDto);

    if (data.isDefault && data.isActive === false) {
      throw new BadRequestException(
        'Un precio inactivo no puede ser marcado como default',
      );
    }

    const price = await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.productPrice.updateMany({
          where: { productId },
          data: { isDefault: false },
        });
      }

      return tx.productPrice.create({
        data: {
          name: createProductPriceDto.name,
          price: createProductPriceDto.price,
          unit: createProductPriceDto.unit,
          quantity: createProductPriceDto.quantity ?? 1,
          productId,
          isActive: data.isActive ?? true,
          isDefault: data.isDefault ?? false,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
        },
        include: { product: true },
      });

    });

    await this.auditLogService.log({
      actor,
      module: 'PRECIOS_PRODUCTO',
      action: 'CREATE_PRICE',
      entityType: 'ProductPrice',
      entityId: price.id,
      entityLabel: `${price.product.name} · ${price.name}`,
      description: `Creo un precio para ${price.product.name}`,
      metadata: {
        productId,
        priceId: price.id,
        price: Number(price.price),
        isDefault: price.isDefault,
      },
    });

    return price;
  }

  async update(
    id: number,
    updateProductPriceDto: UpdateProductPriceDto,
    actor: AuthUser,
  ) {
    const current = await this.findOne(id);
    const { reason, ...updateData } = updateProductPriceDto;
    const data = this.normalizeDates(updateData, current);

    if (data.isDefault && data.isActive === false) {
      throw new BadRequestException(
        'Un precio inactivo no puede ser marcado como default',
      );
    }

    if (data.isActive === false) {
      data.isDefault = false;
    }

    const price = await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.productPrice.updateMany({
          where: { productId: current.productId, id: { not: id } },
          data: { isDefault: false },
        });
      }

      if (
        data.price !== undefined &&
        Number(data.price) !== Number(current.price)
      ) {
        await tx.productPriceHistory.create({
          data: {
            productPriceId: id,
            oldPrice: current.price,
            newPrice: data.price,
            reason,
          },
        });
      }

      return tx.productPrice.update({
        where: { id },
        data,
        include: { product: true },
      });
    });

    await this.auditLogService.log({
      actor,
      module: 'PRECIOS_PRODUCTO',
      action:
        updateProductPriceDto.price !== undefined &&
        Number(updateProductPriceDto.price) !== Number(current.price)
          ? 'CHANGE_PRICE'
          : 'UPDATE_PRICE',
      entityType: 'ProductPrice',
      entityId: price.id,
      entityLabel: `${price.product.name} · ${price.name}`,
      description: `Actualizo el precio ${price.name} de ${price.product.name}`,
      metadata: {
        priceId: price.id,
        productId: price.productId,
        previousPrice: Number(current.price),
        nextPrice: Number(price.price),
        changedFields: Object.keys(updateProductPriceDto),
        reason,
      },
    });

    return price;
  }

  async remove(id: number, actor: AuthUser) {
    const current = await this.findOne(id);

    const price = await this.prisma.productPrice.update({
      where: { id },
      data: { isActive: false, isDefault: false },
      include: { product: true },
    });
    await this.auditLogService.log({
      actor,
      module: 'PRECIOS_PRODUCTO',
      action: 'DEACTIVATE_PRICE',
      entityType: 'ProductPrice',
      entityId: price.id,
      entityLabel: `${price.product.name} · ${price.name}`,
      description: `Desactivo el precio ${price.name} de ${price.product.name}`,
      metadata: { priceId: price.id, previousStatus: current.isActive },
    });
    return price;
  }

  async markDefault(id: number, actor: AuthUser) {
    const productPrice = await this.findOne(id);

    if (!productPrice.isActive) {
      throw new BadRequestException(
        'No se puede marcar como default un precio inactivo',
      );
    }

    const price = await this.prisma.$transaction(async (tx) => {
      await tx.productPrice.updateMany({
        where: { productId: productPrice.productId, id: { not: id } },
        data: { isDefault: false },
      });

      return tx.productPrice.update({
        where: { id },
        data: { isDefault: true },
        include: { product: true },
      });
    });

    await this.auditLogService.log({
      actor,
      module: 'PRECIOS_PRODUCTO',
      action: 'SET_DEFAULT_PRICE',
      entityType: 'ProductPrice',
      entityId: price.id,
      entityLabel: `${price.product.name} · ${price.name}`,
      description: `Marco como principal el precio ${price.name} de ${price.product.name}`,
      metadata: { priceId: price.id, productId: price.productId },
    });

    return price;
  }

  async history(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);
    return this.prisma.productPriceHistory.findMany({
      where: { productPriceId: id },
      orderBy: { id: 'desc' },
    });
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
    dto: CreateProductPriceDto | UpdateProductPriceDto,
    current?: { startsAt: Date | null; endsAt: Date | null },
  ) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;
    const finalStartsAt = startsAt ?? current?.startsAt ?? undefined;
    const finalEndsAt = endsAt ?? current?.endsAt ?? undefined;

    if (finalStartsAt && finalEndsAt && finalEndsAt <= finalStartsAt) {
      throw new BadRequestException(
        'La fecha final del precio debe ser mayor que la inicial',
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

  private getStatusWhere(status?: FilterProductPricesDto['estado']) {
    if (!status || status === 'TODOS') return undefined;
    if (status === 'ACTIVOS') return { isActive: true };
    if (status === 'INACTIVOS') return { isActive: false };
    return { isDefault: true };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { product: { name: { contains: q, mode: 'insensitive' as const } } },
        { product: { brand: { contains: q, mode: 'insensitive' as const } } },
      ],
    };
  }
}
