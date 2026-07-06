import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, Prisma, UnitType } from '@prisma/client';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BarcodeFormatService } from '../../shared/products/barcode-format.service';
import { R2StorageService } from '../../shared/storage/r2-storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import {
  FilterProductsDto,
  ProductStockFilter,
} from './dto/filter-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
    private readonly barcodeFormat: BarcodeFormatService,
  ) {}

  async findAll(filter: FilterProductsDto) {
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, productIds] = await Promise.all([
      this.countFilteredProducts(filter),
      this.findFilteredProductIds(filter, skip, take),
    ]);

    if (!productIds.length) {
      return buildPaginatedResponse([], total, page, limit);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: this.productInclude,
    });
    const positionById = new Map(productIds.map((id, index) => [id, index]));
    const orderedProducts = products.sort(
      (left, right) =>
        (positionById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (positionById.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );

    return buildPaginatedResponse(
      orderedProducts.map((product) => this.formatProduct(product)),
      total,
      page,
      limit,
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
    const { tagIds, prices, warehouses, barcodes, ...productData } =
      createProductDto;
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
      const normalizedBarcodes = await this.normalizeBarcodes(barcodes);

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
            barcodes: normalizedBarcodes.length
              ? { create: normalizedBarcodes }
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

    const { tagIds, barcodes, ...productData } = updateProductDto;
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
      const normalizedBarcodes = await this.normalizeBarcodes(barcodes, id);

      const product = await this.prisma.$transaction(async (tx) => {
        // Si el frontend envía tagIds, se interpreta como reemplazo completo de etiquetas.
        if (tagIds) {
          await tx.productTag.deleteMany({ where: { productId: id } });
        }

        if (normalizedBarcodes.some((barcode) => barcode.isPrimary)) {
          await tx.productBarcode.updateMany({
            where: { productId: id },
            data: { isPrimary: false },
          });
        }

        for (const barcode of normalizedBarcodes) {
          if (barcode.id) {
            await tx.productBarcode.update({
              where: { id: barcode.id },
              data: {
                type: barcode.type,
                isPrimary: barcode.isPrimary,
              },
            });
          } else {
            await tx.productBarcode.create({
              data: {
                productId: id,
                code: barcode.code,
                type: barcode.type,
                isPrimary: barcode.isPrimary,
              },
            });
          }
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

  async findByBarcode(code: string) {
    const barcode = await this.prisma.productBarcode.findUnique({
      where: { code: code.trim() },
      include: { product: { include: this.productBarcodeLookupInclude } },
    });

    if (!barcode?.isActive || !barcode.product.isActive) {
      throw new NotFoundException(
        'Producto no encontrado para el código de barras',
      );
    }

    return this.formatProduct(barcode.product);
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
    barcodes: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] },
  } as const;

  private readonly productBarcodeLookupInclude = {
    ...this.productInclude,
    prices: {
      where: { isActive: true },
      orderBy: { id: 'asc' },
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

  private async normalizeBarcodes(
    barcodes?: CreateProductDto['barcodes'],
    productId?: number,
  ) {
    if (!barcodes?.length) return [];

    const codes = barcodes.map((barcode) =>
      this.barcodeFormat.validate(barcode.code, barcode.type),
    );
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException(
        'No se permiten códigos de barras duplicados',
      );
    }

    const primaryCount = barcodes.filter((barcode) => barcode.isPrimary).length;
    if (primaryCount > 1) {
      throw new BadRequestException(
        'Solo puede existir un código de barras principal por producto',
      );
    }

    const existingCodes = await this.prisma.productBarcode.findMany({
      where: { code: { in: codes } },
    });

    for (const existing of existingCodes) {
      if (existing.productId !== productId) {
        throw new BadRequestException(
          `El código de barras ${existing.code} ya existe en otro producto`,
        );
      }
    }

    const existingForProduct = new Map(
      existingCodes.map((item) => [item.code, item.id]),
    );

    return barcodes.map((barcode, index) => ({
      id: existingForProduct.get(codes[index]),
      code: codes[index],
      type: barcode.type,
      isPrimary: barcode.isPrimary ?? (primaryCount === 0 && index === 0),
    }));
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

  private async countFilteredProducts(filter: FilterProductsDto) {
    const [row] = await this.prisma.$queryRaw<Array<{ total: bigint | number }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM "Product" p
        INNER JOIN "ProductType" pt ON pt."id" = p."productTypeId"
        INNER JOIN "Provider" pr ON pr."id" = p."providerId"
        LEFT JOIN (
          SELECT "productId", COALESCE(SUM("quantity"), 0)::int AS "totalStock"
          FROM "ProductWarehouse"
          GROUP BY "productId"
        ) stock ON stock."productId" = p."id"
        ${this.buildFilteredProductsWhereSql(filter)}
      `,
    );

    return Number(row?.total ?? 0);
  }

  private async findFilteredProductIds(
    filter: FilterProductsDto,
    skip: number,
    take: number,
  ) {
    const rows = await this.prisma.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT p."id" AS id
        FROM "Product" p
        INNER JOIN "ProductType" pt ON pt."id" = p."productTypeId"
        INNER JOIN "Provider" pr ON pr."id" = p."providerId"
        LEFT JOIN (
          SELECT "productId", COALESCE(SUM("quantity"), 0)::int AS "totalStock"
          FROM "ProductWarehouse"
          GROUP BY "productId"
        ) stock ON stock."productId" = p."id"
        ${this.buildFilteredProductsWhereSql(filter)}
        ORDER BY p."id" ASC
        OFFSET ${skip}
        LIMIT ${take}
      `,
    );

    return rows.map((row) => row.id);
  }

  private buildFilteredProductsWhereSql(filter: FilterProductsDto) {
    const conditions: Prisma.Sql[] = [];
    const search = filter.q?.trim();
    const brand = filter.brand?.trim();

    if (filter.estado !== RecordStatusQuery.TODOS) {
      conditions.push(
        Prisma.sql`p."isActive" = ${filter.estado === RecordStatusQuery.INACTIVOS ? false : true}`,
      );
    }

    if (search) {
      const likeSearch = `%${search}%`;

      conditions.push(Prisma.sql`
        (
          p."name" ILIKE ${likeSearch}
          OR p."brand" ILIKE ${likeSearch}
          OR COALESCE(p."description", '') ILIKE ${likeSearch}
          OR pt."name" ILIKE ${likeSearch}
          OR pr."name" ILIKE ${likeSearch}
          OR EXISTS (
            SELECT 1
            FROM "ProductWarehouse" pw_search
            INNER JOIN "Warehouse" w_search ON w_search."id" = pw_search."warehouseId"
            WHERE pw_search."productId" = p."id"
              AND w_search."location" ILIKE ${likeSearch}
          )
        )
      `);
    }

    if (filter.productTypeId) {
      conditions.push(Prisma.sql`p."productTypeId" = ${filter.productTypeId}`);
    }

    if (filter.providerId) {
      conditions.push(Prisma.sql`p."providerId" = ${filter.providerId}`);
    }

    if (filter.warehouseId) {
      conditions.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "ProductWarehouse" pw_filter
          WHERE pw_filter."productId" = p."id"
            AND pw_filter."warehouseId" = ${filter.warehouseId}
        )
      `);
    }

    if (brand) {
      conditions.push(Prisma.sql`p."brand" ILIKE ${`%${brand}%`}`);
    }

    if (filter.stockStatus === ProductStockFilter.CON_STOCK) {
      conditions.push(Prisma.sql`COALESCE(stock."totalStock", 0) > 0`);
    }

    if (filter.stockStatus === ProductStockFilter.SIN_STOCK) {
      conditions.push(Prisma.sql`COALESCE(stock."totalStock", 0) <= 0`);
    }

    if (filter.stockStatus === ProductStockFilter.BAJO_MINIMO) {
      conditions.push(
        Prisma.sql`COALESCE(stock."totalStock", 0) <= COALESCE(p."minimumStock", 0)`,
      );
    }

    if (filter.stockStatus === ProductStockFilter.EN_RANGO) {
      conditions.push(Prisma.sql`
        COALESCE(stock."totalStock", 0) > COALESCE(p."minimumStock", 0)
        AND (
          p."maximumStock" IS NULL
          OR COALESCE(stock."totalStock", 0) < p."maximumStock"
        )
      `);
    }

    if (filter.stockStatus === ProductStockFilter.SOBRE_MAXIMO) {
      conditions.push(Prisma.sql`
        p."maximumStock" IS NOT NULL
        AND COALESCE(stock."totalStock", 0) >= p."maximumStock"
      `);
    }

    if (!conditions.length) {
      return Prisma.empty;
    }

    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
