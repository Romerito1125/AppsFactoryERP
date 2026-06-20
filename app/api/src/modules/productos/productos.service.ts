import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filter: FilterProductsDto) {
    return this.prisma.product
      .findMany({
        where: this.getStatusWhere(filter.estado),
        include: this.productInclude,
        orderBy: { id: 'asc' },
      })
      .then((products) =>
        products.map((product) => this.formatProduct(product)),
      );
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.productInclude,
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.formatProduct(product);
  }

  async create(createProductDto: CreateProductDto) {
    const { tagIds, prices, warehouses, ...productData } = createProductDto;

    // El producto depende de catálogos activos; no se crean relaciones inválidas.
    await this.ensureProductTypeExists(productData.productTypeId);
    await this.ensureProviderExists(productData.providerId);
    await this.ensureTagsExist(tagIds);
    await this.ensureWarehousesExist(
      warehouses?.map((item) => item.warehouseId),
    );
    const normalizedPrices = this.normalizeInitialPrices(prices);

    const product = await this.prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({
        data: {
          ...productData,
          tags: tagIds?.length
            ? { create: tagIds.map((tagId) => ({ tagId })) }
            : undefined,
          prices: normalizedPrices.length
            ? { create: normalizedPrices }
            : undefined,
        },
        include: this.productInclude,
      });

      for (const warehouse of warehouses ?? []) {
        await tx.productWarehouse.create({
          data: {
            productId: createdProduct.id,
            warehouseId: warehouse.warehouseId,
            quantity: warehouse.quantity,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: createdProduct.id,
            toWarehouseId: warehouse.warehouseId,
            quantity: warehouse.quantity,
            movementType: InventoryMovementType.ENTRADA,
            reason: 'Stock inicial de producto',
          },
        });
      }

      return tx.product.findUniqueOrThrow({
        where: { id: createdProduct.id },
        include: this.productInclude,
      });
    });

    return this.formatProduct(product);
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    const { tagIds, ...productData } = updateProductDto;

    if (productData.productTypeId) {
      await this.ensureProductTypeExists(productData.productTypeId);
    }

    if (productData.providerId) {
      await this.ensureProviderExists(productData.providerId);
    }

    await this.ensureTagsExist(tagIds);

    const product = await this.prisma.$transaction(async (tx) => {
      // Si el frontend envía tagIds, se interpreta como reemplazo completo de etiquetas.
      if (tagIds) {
        await tx.productTag.deleteMany({ where: { productId: id } });
      }

      return tx.product.update({
        where: { id },
        data: {
          ...productData,
          tags: tagIds
            ? { create: tagIds.map((tagId) => ({ tagId })) }
            : undefined,
        },
        include: this.productInclude,
      });
    });

    return this.formatProduct(product);
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: this.productInclude,
    });

    return this.formatProduct(product);
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
      include: this.productInclude,
    });

    return this.formatProduct(product);
  }

  private readonly productInclude = {
    productType: true,
    provider: true,
    tags: { include: { tag: true } },
    prices: { orderBy: { id: 'asc' } },
    warehouses: {
      include: { warehouse: true },
      orderBy: { warehouseId: 'asc' },
    },
  } as const;

  // La tabla pivote ProductTag es un detalle interno; la API responde tags planos.
  private formatProduct(product) {
    return {
      ...product,
      tags: product.tags.map((productTag) => productTag.tag),
      warehouses: product.warehouses.map((item) => ({
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        warehouse: item.warehouse,
      })),
    };
  }

  private normalizeInitialPrices(prices?: CreateProductDto['prices']) {
    if (!prices?.length) return [];

    const defaultCount = prices.filter((price) => price.isDefault).length;

    if (defaultCount > 1) {
      throw new BadRequestException(
        'Solo puede existir un precio default por producto',
      );
    }

    return prices.map((price, index) => {
      const startsAt = price.startsAt ? new Date(price.startsAt) : undefined;
      const endsAt = price.endsAt ? new Date(price.endsAt) : undefined;

      if (startsAt && endsAt && endsAt <= startsAt) {
        throw new BadRequestException(
          'La fecha final del precio debe ser mayor que la inicial',
        );
      }

      return {
        name: price.name,
        price: price.price,
        isActive: price.isActive ?? true,
        // Si no se envía default, se toma el primer precio para dejar uno activo por defecto.
        isDefault: price.isDefault ?? (defaultCount === 0 && index === 0),
        startsAt,
        endsAt,
      };
    });
  }

  private async ensureProductTypeExists(id: number) {
    this.ensurePositiveId(id);

    const productType = await this.prisma.productType.findUnique({
      where: { id },
    });

    if (!productType) {
      throw new NotFoundException('Tipo de producto no encontrado');
    }

    if (!productType.isActive) {
      throw new BadRequestException('El tipo de producto está inactivo');
    }
  }

  private async ensureProviderExists(id: number) {
    this.ensurePositiveId(id);

    const provider = await this.prisma.provider.findUnique({ where: { id } });

    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    if (!provider.isActive) {
      throw new BadRequestException('El proveedor está inactivo');
    }
  }

  private async ensureWarehousesExist(ids?: number[]) {
    if (!ids?.length) return;
    const uniqueIds = [...new Set(ids)];
    const count = await this.prisma.warehouse.count({
      where: { id: { in: uniqueIds }, isActive: true },
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException(
        'Una o más bodegas no existen o están inactivas',
      );
    }
  }

  private async ensureTagsExist(tagIds?: number[]) {
    if (!tagIds) return;

    const tags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds }, isActive: true },
    });

    if (tags.length !== tagIds.length) {
      throw new BadRequestException(
        'Una o más etiquetas no existen o están inactivas',
      );
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
