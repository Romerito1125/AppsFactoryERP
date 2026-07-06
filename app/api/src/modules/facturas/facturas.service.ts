import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceSource } from '@prisma/client';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProductResolverService } from '../../shared/products/product-resolver.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

@Injectable()
export class FacturasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
    private readonly productResolver: ProductResolverService,
  ) {}

  async findAll(query: ListInvoicesQueryDto) {
    const where = {
      ...this.getStatusWhere(query.status),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: this.invoiceInclude,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.invoiceInclude,
    });

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    return invoice;
  }

  async create(createInvoiceDto: CreateInvoiceDto, authUser: AuthUser) {
    // La venta no descuenta stock por bodega; el inventario se maneja en /inventario.
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: createInvoiceDto.clientId },
      });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (!client.isActive) {
        throw new BadRequestException(
          'No se puede facturar a un cliente inactivo',
        );
      }

      const resolvedItems: Array<{
        productId: number;
        productPriceId?: number;
        quantity: number;
        product: any;
      }> = [];

      for (const item of createInvoiceDto.items) {
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

      const groupedItems = this.groupItems(resolvedItems);

      const invoiceItems = groupedItems.map((item) => {
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
        // El precio e impuesto se congelan en el detalle para conservar histórico.
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

      const subtotal = invoiceItems.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );
      const taxes = invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0);
      const total = invoiceItems.reduce((sum, item) => sum + item.total, 0);

      let creatorId = authUser.sub;
      let creatorRole = authUser.role;
      let creatorUsername = authUser.username;

      if (createInvoiceDto.createdByUserId) {
        const creatorUser = await tx.user.findUnique({
          where: { id: createInvoiceDto.createdByUserId, isActive: true },
        });
        if (creatorUser) {
          creatorId = creatorUser.id;
          creatorRole = creatorUser.role as any;
          creatorUsername = creatorUser.username;
        }
      }

      const invoice = await tx.invoice.create({
        data: {
          consecutive: this.generateConsecutive(),
          clientId: createInvoiceDto.clientId,
          createdByUserId: creatorId,
          createdByRole: creatorRole,
          createdByUsername: creatorUsername,
          source: createInvoiceDto.source ?? InvoiceSource.ADMIN,
          subtotal,
          taxes,
          total,
          items: { create: invoiceItems },
        },
        include: this.invoiceInclude,
      });

      await this.notificacionesService.createInvoiceNotification(tx, invoice);

      return invoice;
    });
  }

  async update(id: number, updateInvoiceDto: UpdateInvoiceDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateInvoiceDto.consecutive) {
      const existingInvoice = await this.prisma.invoice.findUnique({
        where: { consecutive: updateInvoiceDto.consecutive },
      });

      if (existingInvoice && existingInvoice.id !== id) {
        throw new ConflictException('El consecutivo ya existe');
      }
    }

    // Los totales e items no se actualizan aquí para evitar inconsistencias contables.
    return this.prisma.invoice.update({
      where: { id },
      data: updateInvoiceDto,
      include: this.invoiceInclude,
    });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);

    // Anular conserva la factura para trazabilidad; no ajusta inventario por bodega.
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
      });

      if (!invoice) {
        throw new NotFoundException('Factura no encontrada');
      }

      if (invoice.status === 'ANULADA') {
        throw new BadRequestException('La factura ya está anulada');
      }

      return tx.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.ANULADA },
        include: this.invoiceInclude,
      });
    });
  }

  private readonly invoiceInclude = {
    client: true,
    createdByUser: {
      select: {
        id: true,
        username: true,
        role: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    },
    items: {
      include: {
        product: { include: { productType: true } },
        productPrice: true,
      },
    },
  } as const;

  private groupItems(
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

    // Agrupa líneas repetidas solo cuando usan el mismo producto y precio.
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
    return `FAC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }

  private getStatusWhere(status?: ListInvoicesQueryDto['status']) {
    if (!status) return undefined;
    return { status };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { consecutive: { contains: q, mode: 'insensitive' as const } },
        { client: { firstName: { contains: q, mode: 'insensitive' as const } } },
        { client: { lastName: { contains: q, mode: 'insensitive' as const } } },
        { client: { identification: { contains: q, mode: 'insensitive' as const } } },
        { createdByUsername: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }
}
