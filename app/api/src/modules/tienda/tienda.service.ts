import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceSource, Prisma } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProductResolverService } from '../../shared/products/product-resolver.service';
import { CreateStoreOrderDto } from './dto/create-store-order.dto';
import { ListStoreOrdersQueryDto } from './dto/list-store-orders-query.dto';
import { StorefrontProductsQueryDto } from './dto/storefront-products-query.dto';

@Injectable()
export class TiendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
    private readonly productResolver: ProductResolverService,
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

  async createOrder(createStoreOrderDto: CreateStoreOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: createStoreOrderDto.clientId },
      });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (!client.isActive) {
        throw new BadRequestException(
          'No se puede crear un pedido para un cliente inactivo',
        );
      }

      const resolvedItems: Array<{
        productId: number;
        productPriceId?: number;
        quantity: number;
        product: any;
      }> = [];

      for (const item of createStoreOrderDto.items) {
        const product = await this.productResolver.resolve(item, tx, {
          prices: { where: { isActive: true } },
        });

        resolvedItems.push({
          productId: product.id,
          productPriceId: item.productPriceId,
          quantity: item.quantity,
          product,
        });
      }

      const groupedItems = this.groupInvoiceItems(resolvedItems);

      const invoiceItems = this.buildInvoiceItems(groupedItems);
      const subtotal = invoiceItems.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );
      const taxes = invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0);
      const total = invoiceItems.reduce((sum, item) => sum + item.total, 0);

      const invoice = await tx.invoice.create({
        data: {
          consecutive: this.generateConsecutive(),
          clientId: createStoreOrderDto.clientId,
          createdByUserId: null,
          createdByRole: null,
          createdByUsername: null,
          source: InvoiceSource.APP_MOVIL,
          subtotal,
          taxes,
          total,
          items: { create: invoiceItems },
          delivery: {
            create: {
              address: createStoreOrderDto.delivery.address,
              recipientName: createStoreOrderDto.delivery.recipientName,
              recipientPhone: createStoreOrderDto.delivery.recipientPhone,
              notes: createStoreOrderDto.delivery.notes,
            },
          },
        },
        include: this.storeOrderInclude,
      });

      await this.notificacionesService.createInvoiceNotification(tx, invoice);

      return invoice;
    });
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
      stock: product.warehouses.reduce((sum, item) => sum + item.quantity, 0),
      primaryBarcode: product.barcodes[0]?.code ?? null,
      activeOffer: activeOffer ?? null,
      createdAt: product.createdAt,
    };
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
