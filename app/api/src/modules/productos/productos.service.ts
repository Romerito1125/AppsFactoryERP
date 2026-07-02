import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, UnitType } from '@prisma/client';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { R2StorageService } from '../../shared/storage/r2-storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
  ) {}

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

  async create(
    createProductDto: CreateProductDto,
    image?: Express.Multer.File,
  ) {
    const { tagIds, prices, warehouses, ...productData } = createProductDto;
    const uploadedImage = image
      ? await this.storage.uploadProductImage(image)
      : undefined;

    try {
      // El producto depende de catálogos activos; no se crean relaciones inválidas.
      await this.ensureProductTypeExists(productData.productTypeId);
      await this.ensureProviderExists(productData.providerId);
      await this.ensureTagsExist(tagIds);
      await this.ensureWarehousesExist(
        warehouses?.map((item) => item.warehouseId),
      );
      const normalizedPrices = this.normalizeInitialPrices(
        prices,
        productData.unit ?? UnitType.UND,
      );

      const product = await this.prisma.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({
          data: {
            ...productData,
            imageUrl: uploadedImage?.url,
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
    } catch (error) {
      await this.safeDeleteImage(uploadedImage?.url);
      throw error;
    }
  }

  async update(
    id: number,
    updateProductDto: UpdateProductDto,
    image?: Express.Multer.File,
  ) {
    this.ensurePositiveId(id);
    const currentProduct = await this.getExistingProduct(id);

    const { tagIds, ...productData } = updateProductDto;
    const uploadedImage = image
      ? await this.storage.uploadProductImage(image, id)
      : undefined;

    try {
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
            imageUrl: uploadedImage?.url,
            tags: tagIds
              ? { create: tagIds.map((tagId) => ({ tagId })) }
              : undefined,
          },
          include: this.productInclude,
        });
      });

      if (uploadedImage?.url && currentProduct.imageUrl) {
        await this.safeDeleteImage(currentProduct.imageUrl);
      }

      return this.formatProduct(product);
    } catch (error) {
      await this.safeDeleteImage(uploadedImage?.url);
      throw error;
    }
  }

  async updateImage(id: number, image?: Express.Multer.File) {
    this.ensurePositiveId(id);
    if (!image) {
      throw new BadRequestException('Debe enviar una imagen');
    }

    const currentProduct = await this.getExistingProduct(id);
    const uploadedImage = await this.storage.uploadProductImage(image, id);

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: { imageUrl: uploadedImage.url },
        include: this.productInclude,
      });

      if (currentProduct.imageUrl) {
        await this.safeDeleteImage(currentProduct.imageUrl);
      }

      return this.formatProduct(product);
    } catch (error) {
      await this.safeDeleteImage(uploadedImage.url);
      throw error;
    }
  }

  async removeImage(id: number) {
    this.ensurePositiveId(id);
    const currentProduct = await this.getExistingProduct(id);

    if (currentProduct.imageUrl) {
      await this.storage.deleteFile(currentProduct.imageUrl);
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { imageUrl: null },
      include: this.productInclude,
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

  private async getExistingProduct(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.productInclude,
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  private async safeDeleteImage(imageUrl?: string | null) {
    try {
      await this.storage.deleteFile(imageUrl);
    } catch {
      return;
    }
  }

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

  private normalizeInitialPrices(
    prices?: CreateProductDto['prices'],
    defaultUnit: UnitType = UnitType.UND,
  ) {
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
        unit: price.unit ?? defaultUnit,
        quantity: price.quantity ?? 1,
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
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new BadRequestException(
        'warehouses debe enviarse como JSON válido: [{"warehouseId":1,"quantity":5}]',
      );
    }

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
