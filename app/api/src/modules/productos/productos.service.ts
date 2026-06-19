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
    const { tagIds, prices, ...productData } = createProductDto;

    // El producto depende de catálogos activos; no se crean relaciones inválidas.
    await this.ensureProductTypeExists(productData.productTypeId);
    await this.ensureWarehouseExists(productData.warehouseId);
    await this.ensureTagsExist(tagIds);
    const normalizedPrices = this.normalizeInitialPrices(prices);

    // Product y ProductTag deben persistirse juntos para evitar productos a medio relacionar.
    const product = await this.prisma.$transaction((tx) =>
      tx.product.create({
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
      }),
    );

    return this.formatProduct(product);
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    const { tagIds, ...productData } = updateProductDto;

    if (productData.productTypeId) {
      await this.ensureProductTypeExists(productData.productTypeId);
    }

    if (productData.warehouseId) {
      await this.ensureWarehouseExists(productData.warehouseId);
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
    warehouse: true,
    tags: { include: { tag: true } },
    prices: { orderBy: { id: 'asc' } },
  } as const;

  // La tabla pivote ProductTag es un detalle interno; la API responde tags planos.
  private formatProduct(product) {
    return {
      ...product,
      tags: product.tags.map((productTag) => productTag.tag),
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

  private async ensureWarehouseExists(id: number) {
    this.ensurePositiveId(id);

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });

    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }

    if (!warehouse.isActive) {
      throw new BadRequestException('La bodega está inactiva');
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
