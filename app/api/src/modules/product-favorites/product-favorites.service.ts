import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

const productInclude = {
  productType: true,
  primaryProvider: true,
  providers: {
    include: { provider: true },
    orderBy: { providerId: 'asc' },
  },
  tags: { include: { tag: true } },
  prices: { orderBy: { id: 'asc' } },
  warehouses: {
    include: { warehouse: true },
    orderBy: { warehouseId: 'asc' },
  },
  barcodes: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] },
} satisfies Prisma.ProductInclude;

type FavoriteProduct = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class ProductFavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: number) {
    const favorites = await this.prisma.productFavorite.findMany({
      where: {
        userId,
        product: { is: { isActive: true, deletedAt: null } },
      },
      include: { product: { include: this.productInclude } },
      orderBy: { createdAt: 'desc' },
    });

    return favorites.map((favorite) => this.formatProduct(favorite.product));
  }

  async add(userId: number, productId: number) {
    this.ensurePositiveId(productId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true, deletedAt: true },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (!product.isActive || product.deletedAt) {
      throw new BadRequestException('El producto está inactivo');
    }

    const favorite = await this.prisma.productFavorite.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
      include: { product: { include: this.productInclude } },
    });

    return this.formatProduct(favorite.product);
  }

  async remove(userId: number, productId: number) {
    this.ensurePositiveId(productId);
    await this.prisma.productFavorite.deleteMany({
      where: { userId, productId },
    });

    return { productId, isFavorite: false };
  }

  private readonly productInclude = productInclude;

  private formatProduct(product: FavoriteProduct) {
    return {
      ...product,
      provider: product.primaryProvider,
      providers: (product.providers ?? []).map((item) => ({
        ...item.provider,
        isPrimary: item.providerId === product.providerId,
      })),
      tags: product.tags.map((productTag) => productTag.tag),
      warehouses: product.warehouses.map((item) => ({
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        warehouse: item.warehouse,
      })),
      isFavorite: true,
    };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
