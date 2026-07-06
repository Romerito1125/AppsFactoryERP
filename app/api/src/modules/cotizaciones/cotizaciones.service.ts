import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, QuoteStatus } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  UpdateQuoteStatusDto,
} from './dto/quote.dto';

@Injectable()
export class CotizacionesService {
  constructor(private readonly prisma: PrismaService) {}
  async findAll(query: ListQuotesQueryDto) {
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

    return buildPaginatedResponse(data, total, page, limit);
  }
  async findOne(id: number) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: this.include,
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    return quote;
  }
  create(dto: CreateQuoteDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureActiveClient(tx, dto.clientId);
      const items = await this.buildItems(tx, dto.items);
      const totals = this.calculateTotals(items);
      return tx.quote.create({
        data: {
          consecutive: this.generateConsecutive('COT'),
          clientId: dto.clientId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          ...totals,
          items: { create: items },
        },
        include: this.include,
      });
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
  private async buildItems(tx: any, input: CreateQuoteDto['items']) {
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
      const price = item.productPriceId
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
        { client: { firstName: { contains: q, mode: 'insensitive' as const } } },
        { client: { lastName: { contains: q, mode: 'insensitive' as const } } },
        { client: { identification: { contains: q, mode: 'insensitive' as const } } },
      ],
    };
  }
}
