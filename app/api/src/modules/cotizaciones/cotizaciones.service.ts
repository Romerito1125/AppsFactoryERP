import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  NotificationPriority,
  NotificationType,
  QuoteStatus,
  Role,
} from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  UpdateQuoteStatusDto,
} from './dto/quote.dto';

function getPriceLevel(price: { priceLevel?: number | null; name: string }) {
  if (price.priceLevel !== null && price.priceLevel !== undefined) {
    return price.priceLevel;
  }
  const match = String(price.name ?? '').match(/^precio\s*([0-3])$/i);
  return match ? Number(match[1]) : undefined;
}

@Injectable()
export class CotizacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
  ) {}
  /** Un bodeguero solo ve las líneas de preventa de su bodega (y el total de esas líneas). */
  private scopeForActor<T extends { kind?: string; items?: any[] }>(quote: T, actor?: AuthUser): T {
    if (actor?.role !== Role.BODEGA || quote.kind !== 'PREVENTA') return quote;
    const items = (quote.items ?? []).filter((item) => item.warehouseId === actor.warehouseId);
    const total = items.reduce((sum, item) => sum + Number(item.total ?? 0), 0);
    return { ...quote, items, total } as T;
  }

  async findAll(query: ListQuotesQueryDto, actor?: AuthUser) {
    const where = {
      ...this.getStatusWhere(query.status),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.quote.count({ where }),
      this.prisma.quote.findMany({
        where,
        include: this.include,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(
      data.map((quote) => this.scopeForActor(quote, actor)),
      total,
      page,
      limit,
    );
  }
  async findOne(id: number, actor?: AuthUser) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: this.include,
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    return this.scopeForActor(quote, actor);
  }
  create(dto: CreateQuoteDto, actor?: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureActiveClient(tx, dto.clientId);
      const items = await this.buildItems(tx, dto.items, dto.priceLevel);
      const totals = this.calculateTotals(items);
      const kind = dto.kind === 'PREVENTA' ? 'PREVENTA' : 'COTIZACION';
      const quote = await tx.quote.create({
        data: {
          consecutive: this.generateConsecutive(kind === 'PREVENTA' ? 'PRE' : 'COT'),
          clientId: dto.clientId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          kind,
          sellerUserId: actor?.sub,
          sellerUsername: actor?.username,
          ...totals,
          items: { create: items },
        },
        include: this.include,
      });
      if (kind === 'PREVENTA') await this.notifyWarehouses(tx, quote);
      return quote;
    });
  }

  /** Cada bodega recibe solo las líneas de la preventa que debe surtir. */
  private async notifyWarehouses(
    tx: any,
    quote: { id: number; consecutive: string; items: Array<{ warehouseId: number | null; quantity: unknown; product?: { name?: string } }> },
  ) {
    const byWarehouse = new Map<number, typeof quote.items>();
    for (const item of quote.items) {
      if (!item.warehouseId) continue;
      byWarehouse.set(item.warehouseId, [...(byWarehouse.get(item.warehouseId) ?? []), item]);
    }
    for (const [warehouseId, lines] of byWarehouse) {
      const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
      const recipients = await tx.user.findMany({
        where: { role: Role.BODEGA, warehouseId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      const summary = lines
        .map((line) => `${Number(line.quantity)} × ${line.product?.name ?? 'producto'}`)
        .join(', ');
      for (const recipient of recipients) {
        await tx.notification.create({
          data: {
            type: NotificationType.BODEGA_TAREA,
            title: 'Preventa para tu bodega',
            message: `${quote.consecutive} · ${warehouse?.location ?? 'Bodega'} · ${summary}`,
            actionLabel: 'Ver preventa',
            actionModule: 'warehouse',
            actionView: 'quote',
            actionEntityId: quote.id,
            recipientUserId: recipient.id,
            priority: NotificationPriority.IMPORTANTE,
          },
        });
      }
    }
  }

  /** La bodega marca cada línea como atendida o surtida (queda quién y cuándo). */
  async fulfillLine(id: number, itemId: number, status: string, actor: AuthUser) {
    const item = await this.prisma.quoteItem.findFirst({ where: { id: itemId, quoteId: id } });
    if (!item) throw new NotFoundException('Línea no encontrada');
    if (actor.role !== Role.ADMIN) {
      if (actor.role !== Role.BODEGA || !item.warehouseId || item.warehouseId !== actor.warehouseId) {
        throw new BadRequestException('Solo la bodega asignada a la línea puede actualizar su surtido');
      }
    }
    return this.prisma.quoteItem.update({
      where: { id: itemId },
      data: {
        fulfillmentStatus: status,
        fulfilledAt: status === 'SURTIDO' ? new Date() : null,
        fulfilledByUsername: actor.username,
      },
    });
  }
  async update(id: number, dto: UpdateQuoteDto) {
    await this.findOne(id);
    return this.prisma.quote.update({
      where: { id },
      data: { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined },
      include: this.include,
    });
  }
  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.RECHAZADA },
      include: this.include,
    });
  }
  async updateStatus(id: number, dto: UpdateQuoteStatusDto) {
    await this.findOne(id);
    return this.prisma.quote.update({
      where: { id },
      data: { status: dto.status },
      include: this.include,
    });
  }
  convertToInvoice(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!quote) throw new NotFoundException('Cotización no encontrada');
      if (quote.status === QuoteStatus.CONVERTIDA)
        throw new BadRequestException('La cotización ya fue convertida');
      if (quote.expiresAt && quote.expiresAt < new Date())
        throw new BadRequestException('La cotización está expirada');
      const invoice = await tx.invoice.create({
        data: {
          consecutive: this.generateConsecutive('FAC'),
          quoteId: id,
          clientId: quote.clientId,
          subtotal: quote.subtotal,
          taxes: quote.taxes,
          total: quote.total,
          status: InvoiceStatus.ACTIVA,
          items: {
            create: quote.items.map((item) => ({
              productId: item.productId,
              productPriceId: item.productPriceId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              subtotal: item.subtotal,
              taxAmount: item.taxAmount,
              total: item.total,
            })),
          },
        },
        include: { client: true, items: true },
      });
      await tx.quote.update({
        where: { id },
        data: { status: QuoteStatus.CONVERTIDA },
      });
      return invoice;
    });
  }

  async sendToWarehouse(id: number, userId: number, _actor: AuthUser) {
    const quote = await this.findOne(id);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        role: Role.BODEGA,
        isActive: true,
        deletedAt: null,
        warehouseId: { not: null },
      },
      include: { warehouse: true },
    });
    if (!user?.warehouse) {
      throw new BadRequestException(
        'Selecciona un usuario Bodega activo y con una bodega asignada.',
      );
    }
    if (quote.status === QuoteStatus.RECHAZADA || quote.status === QuoteStatus.EXPIRADA) {
      throw new BadRequestException('No se puede enviar una cotización rechazada o expirada.');
    }
    await this.notificacionesService.createWarehouseTaskNotification({
      recipientUserId: user.id,
      quoteId: quote.id,
      quoteConsecutive: quote.consecutive,
      warehouseName: user.warehouse.location,
    });
    return {
      sent: true,
      quoteId: quote.id,
      recipient: {
        id: user.id,
        username: user.username,
        warehouseId: user.warehouseId,
        warehouse: user.warehouse.location,
      },
    };
  }
  private readonly include = {
    client: true,
    items: { include: { product: true, productPrice: true } },
    invoice: true,
  } as const;
  private async ensureActiveClient(tx: any, id: number) {
    const client = await tx.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (!client.isActive) throw new BadRequestException('Cliente inactivo');
  }
  private async buildItems(
    tx: any,
    input: CreateQuoteDto['items'],
    priceLevel?: number,
  ) {
    const productIds = [...new Set(input.map((item) => item.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      include: { prices: { where: { isActive: true } } },
    });
    if (products.length !== productIds.length)
      throw new NotFoundException('Uno o más productos no existen');
    return input.map((item) => {
      const product = products.find((current) => current.id === item.productId);
      if (!product?.isActive)
        throw new BadRequestException(
          `El producto ${item.productId} está inactivo`,
        );
      const price =
        priceLevel !== undefined
          ? product.prices.find((current) => getPriceLevel(current) === priceLevel) ??
            product.prices.find((current) => current.isDefault)
          : item.productPriceId
            ? product.prices.find((current) => current.id === item.productPriceId)
            : product.prices.find((current) => current.isDefault);
      if (!price)
        throw new BadRequestException(
          `El producto ${item.productId} no tiene precio válido`,
        );
      const unitPrice = Number(price.price);
      const taxRate = Number(product.taxRate);
      const subtotal = unitPrice * item.quantity;
      const taxAmount = subtotal * (taxRate / 100);
      return {
        productId: item.productId,
        productPriceId: price.id,
        quantity: item.quantity,
        warehouseId: item.warehouseId,
        unitPrice,
        taxRate,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
      };
    });
  }
  private calculateTotals(items: any[]) {
    return {
      subtotal: items.reduce((sum, item) => sum + item.subtotal, 0),
      taxes: items.reduce((sum, item) => sum + item.taxAmount, 0),
      total: items.reduce((sum, item) => sum + item.total, 0),
    };
  }
  private generateConsecutive(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private getStatusWhere(status?: ListQuotesQueryDto['status']) {
    if (!status) return undefined;
    return { status };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { consecutive: { contains: q, mode: 'insensitive' as const } },
        {
          client: { firstName: { contains: q, mode: 'insensitive' as const } },
        },
        { client: { lastName: { contains: q, mode: 'insensitive' as const } } },
        {
          client: {
            identification: { contains: q, mode: 'insensitive' as const },
          },
        },
      ],
    };
  }
}
