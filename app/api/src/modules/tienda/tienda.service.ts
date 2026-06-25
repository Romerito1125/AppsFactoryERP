import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { StorefrontProductsQueryDto } from './dto/storefront-products-query.dto';

@Injectable()
export class TiendaService {
  constructor(private readonly prisma: PrismaService) {}

  async findProducts(query: StorefrontProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildProductWhere(query);
    const total = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      include: this.productInclude,
      orderBy:
        query.sortBy === 'createdAt'
          ? { createdAt: query.sortOrder ?? 'desc' }
          : { id: 'asc' },
      skip: query.sortBy === 'price' ? undefined : (page - 1) * limit,
      take: query.sortBy === 'price' ? undefined : limit,
    });
    const formattedProducts = products.map((product) => this.formatProduct(product));
    const data =
      query.sortBy === 'price'
        ? formattedProducts.sort((left, right) => {
            const direction = query.sortOrder === 'asc' ? 1 : -1;
            return (left.currentPrice - right.currentPrice) * direction;
          }).slice((page - 1) * limit, page * limit)
        : formattedProducts;

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findProduct(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }

    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: this.productInclude,
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.formatProduct(product);
  }

  findCategories() {
    return this.prisma.productType.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  findTags() {
    return this.prisma.tag.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOffers() {
    const offers = await this.prisma.offer.findMany({
      where: this.activeOfferWhere(),
      include: {
        products: { include: { product: true } },
        productTypes: { include: { productType: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { id: 'desc' },
    });

    return offers.map((offer) => ({
      ...offer,
      products: offer.products.map((item) => item.product),
      productTypes: offer.productTypes.map((item) => item.productType),
      tags: offer.tags.map((item) => item.tag),
    }));
  }

  private readonly productInclude: Prisma.ProductInclude = {
    productType: { include: { offers: { include: { offer: true } } } },
    tags: {
      include: { tag: { include: { offers: { include: { offer: true } } } } },
    },
    prices: {
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    },
    warehouses: true,
    offers: { include: { offer: true } },
  };

  private buildProductWhere(query: StorefrontProductsQueryDto): Prisma.ProductWhereInput {
    return {
      isActive: true,
      deletedAt: null,
      productTypeId: query.productTypeId,
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
          { brand: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
      ...(query.tagIds?.length && {
        tags: { some: { tagId: { in: query.tagIds } } },
      }),
    };
  }

  private formatProduct(product) {
    const now = new Date();
    const currentPrice = product.prices.find(
      (price) =>
        (!price.startsAt || price.startsAt <= now) &&
        (!price.endsAt || price.endsAt >= now),
    );
    const { offers: productTypeOffers, ...productType } = product.productType;
    const tags = product.tags.map((item) => {
      const { offers, ...tag } = item.tag;
      return tag;
    });
    const activeOffer = [
      ...product.offers.map((item) => item.offer),
      ...productTypeOffers.map((item) => item.offer),
      ...product.tags.flatMap((item) => item.tag.offers.map((offerTag) => offerTag.offer)),
    ]
      .find((offer) => this.isOfferActive(offer));

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      imageUrl: product.imageUrl,
      brand: product.brand,
      productType,
      tags,
      currentPrice: Number(currentPrice?.price ?? 0),
      stock: product.warehouses.reduce((sum, item) => sum + item.quantity, 0),
      activeOffer: activeOffer ?? null,
      createdAt: product.createdAt,
    };
  }

  private activeOfferWhere(): Prisma.OfferWhereInput {
    const now = new Date();

    return {
      isActive: true,
      deletedAt: null,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    };
  }

  private isOfferActive(offer) {
    const now = new Date();

    return (
      offer.isActive &&
      !offer.deletedAt &&
      (!offer.startsAt || offer.startsAt <= now) &&
      (!offer.endsAt || offer.endsAt >= now)
    );
  }
}
