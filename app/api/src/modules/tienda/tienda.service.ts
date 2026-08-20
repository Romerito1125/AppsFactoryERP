import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceSource, Prisma, SaleMode } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { FacturasService } from '../facturas/facturas.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateStoreOrderDto } from './dto/create-store-order.dto';
import { ListStoreOrdersQueryDto } from './dto/list-store-orders-query.dto';
import { StorefrontProductsQueryDto } from './dto/storefront-products-query.dto';

@Injectable()
export class TiendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facturasService: FacturasService,
  ) {}

  async findOrders(query: ListStoreOrdersQueryDto) {
    const where = {
      source: InvoiceSource.APP_MOVIL,
      ...this.getOrderStatusWhere(query.status),
      ...this.getOrderSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: this.storeOrderInclude,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findClientOrders(clientId: number | null | undefined, query: ListStoreOrdersQueryDto) {
    if (!clientId) {
      throw new ForbiddenException('La sesión no tiene un cliente asociado');
    }

    const where = {
      source: InvoiceSource.APP_MOVIL,
      clientId,
      ...this.getOrderStatusWhere(query.status),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: this.storeOrderInclude,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findProducts(query: StorefrontProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildProductWhere(query);
    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: this.productInclude,
        orderBy:
          query.sortBy === 'createdAt'
            ? { createdAt: query.sortOrder ?? 'desc' }
            : { id: 'asc' },
        skip: query.sortBy === 'price' ? undefined : (page - 1) * limit,
        take: query.sortBy === 'price' ? undefined : limit,
      }),
    ]);
    const formattedProducts = products.map((product) =>
      this.formatProduct(product),
    );
    const data =
      query.sortBy === 'price'
        ? formattedProducts
            .sort((left, right) => {
              const direction = query.sortOrder === 'asc' ? 1 : -1;
              return (left.currentPrice - right.currentPrice) * direction;
            })
            .slice((page - 1) * limit, page * limit)
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
    return this.prisma.offer.findMany({
      where: this.activeOfferWhere(),
      select: {
        id: true,
        name: true,
        description: true,
        discountType: true,
        discountValue: true,
        startsAt: true,
        endsAt: true,
        minimumProductQuantity: true,
        maximumProductQuantity: true,
        isStackable: true,
      },
      orderBy: { id: 'desc' },
    });
  }

  async createOrder(createStoreOrderDto: CreateStoreOrderDto, authUser: AuthUser) {
    if (authUser.clientId !== createStoreOrderDto.clientId) {
      throw new ForbiddenException('Solo puedes crear pedidos para tu propia cuenta');
    }

    return this.facturasService.create(
      {
        clientId: createStoreOrderDto.clientId,
        items: createStoreOrderDto.items,
        source: InvoiceSource.APP_MOVIL,
        saleMode: SaleMode.CONTADO,
      },
      authUser,
      createStoreOrderDto.delivery,
    );
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
    packagingProfile: true,
    warehouses: {
      where: { warehouse: { isActive: true, deletedAt: null } },
      select: { quantity: true },
    },
    offers: { include: { offer: true } },
    barcodes: {
      where: { isActive: true, isPrimary: true },
      take: 1,
    },
  };

  private readonly storeOrderInclude = {
    client: true,
    createdByUser: {
      select: {
        id: true,
        username: true,
        role: true,
      },
    },
    delivery: true,
    credit: true,
    items: {
      include: {
        product: { include: { productType: true } },
        productPrice: true,
      },
    },
  } as const;

  private buildProductWhere(
    query: StorefrontProductsQueryDto,
  ): Prisma.ProductWhereInput {
    return {
      isActive: true,
      deletedAt: null,
      productTypeId: query.productTypeId,
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' as const } },
          { description: { contains: query.q, mode: 'insensitive' as const } },
          { brand: { contains: query.q, mode: 'insensitive' as const } },
        ],
      }),
      ...(query.tagIds?.length && {
        tags: { some: { tagId: { in: query.tagIds } } },
      }),
    };
  }

  private formatProduct(product) {
    const now = new Date();
    const currentPrices = product.prices.filter((price) =>
      this.isPriceActive(price, now),
    );
    const currentPrice = currentPrices.find((price) => price.isDefault) ?? currentPrices[0];
    const { offers: productTypeOffers, ...productType } = product.productType;
    const tags = product.tags.map((item) => {
      const { offers, ...tag } = item.tag;
      return tag;
    });
    const activeOffer = [
      ...product.offers.map((item) => item.offer),
      ...productTypeOffers.map((item) => item.offer),
      ...product.tags.flatMap((item) =>
        item.tag.offers.map((offerTag) => offerTag.offer),
      ),
    ].find((offer) => this.isOfferActive(offer));

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      imageUrl: product.imageUrl,
      brand: product.brand,
      productType,
      tags,
      currentPrice: Number(currentPrice?.price ?? 0),
      currentPriceUnit: currentPrice?.unit ?? null,
      currentPriceQuantity: Number(currentPrice?.quantity ?? 1),
      packagingProfile: product.packagingProfile
        ? {
            unitsPerPackage: product.packagingProfile.unitsPerPackage,
            packagesPerBox: product.packagingProfile.packagesPerBox,
            saleByUnitOnly: product.packagingProfile.saleByUnitOnly,
          }
        : null,
      defaultPriceId: currentPrice?.id ?? null,
      taxRate: Number(product.taxRate),
      stock: product.warehouses.reduce((sum, item) => sum + item.quantity, 0),
      primaryBarcode: product.barcodes[0]?.code ?? null,
      activeOffer: activeOffer ?? null,
      createdAt: product.createdAt,
    };
  }

  private isPriceActive(price, now = new Date()) {
    return (
      price.isActive &&
      (!price.startsAt || price.startsAt <= now) &&
      (!price.endsAt || price.endsAt >= now)
    );
  }

  private buildInvoiceItems(
    items: Array<{
      productId: number;
      productPriceId?: number;
      quantity: number;
      product: any;
    }>,
  ) {
    return items.map((item) => {
      const product = item.product;

      if (!product.isActive) {
        throw new BadRequestException(
          `El producto ${product.id} está inactivo`,
        );
      }

      const productPrice = item.productPriceId
        ? product.prices.find((price) => price.id === item.productPriceId)
        : product.prices.find((price) => price.isDefault);

      if (!productPrice) {
        throw new BadRequestException(
          item.productPriceId
            ? `El precio ${item.productPriceId} no existe, está inactivo o no pertenece al producto ${product.id}`
            : `El producto ${product.id} no tiene precio default activo`,
        );
      }

      const unitPrice = Number(productPrice.price);
      const taxRate = Number(product.taxRate);
      const subtotal = unitPrice * item.quantity;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      return {
        productId: product.id,
        productPriceId: productPrice.id,
        quantity: item.quantity,
        unitPrice,
        taxRate,
        subtotal,
        taxAmount,
        total,
      };
    });
  }

  private groupInvoiceItems(
    items: Array<{
      productId: number;
      productPriceId?: number;
      quantity: number;
      product: any;
    }>,
  ) {
    const groupedItems = new Map<
      string,
      {
        productId: number;
        productPriceId?: number;
        quantity: number;
        product: any;
      }
    >();

    for (const item of items) {
      const key = `${item.productId}:${item.productPriceId ?? 'default'}`;
      const current = groupedItems.get(key);

      groupedItems.set(key, {
        productId: item.productId,
        productPriceId: item.productPriceId,
        quantity: (current?.quantity ?? 0) + item.quantity,
        product: item.product,
      });
    }

    return Array.from(groupedItems.values());
  }

  private generateConsecutive() {
    return `APP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

  private getOrderStatusWhere(status?: ListStoreOrdersQueryDto['status']) {
    if (!status) return undefined;
    return { delivery: { status } };
  }

  private getOrderSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { consecutive: { contains: q, mode: 'insensitive' as const } },
        { client: { firstName: { contains: q, mode: 'insensitive' as const } } },
        { client: { lastName: { contains: q, mode: 'insensitive' as const } } },
        { client: { identification: { contains: q, mode: 'insensitive' as const } } },
        { delivery: { address: { contains: q, mode: 'insensitive' as const } } },
        { delivery: { recipientName: { contains: q, mode: 'insensitive' as const } } },
        { delivery: { recipientPhone: { contains: q, mode: 'insensitive' as const } } },
      ],
    };
  }
}
