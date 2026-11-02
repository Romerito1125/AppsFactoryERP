import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdvanceSource,
  CreditStatus,
  Prisma,
  ReturnRefundMethod,
} from '@prisma/client';
import {
  nextConsecutive,
  postBankMovement,
} from '../../common/utils/bank-ledger.util';
import { convertProductQuantityToBase } from '../../common/utils/product-quantity.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateReturnDto, ListReturnsQueryDto } from './dto/return.dto';

const round = (value: number) => Math.round(value * 100) / 100;
const EPS = 0.0005;

const returnInclude = {
  invoice: { select: { id: true, consecutive: true, saleMode: true } },
  client: {
    select: { id: true, firstName: true, lastName: true, identification: true },
  },
  items: {
    include: {
      invoiceItem: {
        select: { product: { select: { id: true, name: true } } },
      },
    },
  },
} as const;

@Injectable()
export class DevolucionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: ListReturnsQueryDto) {
    const q = query.q?.trim();
    const where: Prisma.SaleReturnWhereInput = {
      ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.productId
        ? { items: { some: { productId: query.productId } } }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { consecutive: { contains: q, mode: 'insensitive' } },
              { reason: { contains: q, mode: 'insensitive' } },
              { invoice: { consecutive: { contains: q, mode: 'insensitive' } } },
              { client: { firstName: { contains: q, mode: 'insensitive' } } },
              { client: { lastName: { contains: q, mode: 'insensitive' } } },
              { client: { identification: { contains: q, mode: 'insensitive' } } },
              {
                items: {
                  some: {
                    invoiceItem: {
                      product: { name: { contains: q, mode: 'insensitive' } },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    return this.prisma.saleReturn.findMany({
      where,
      include: returnInclude,
      orderBy: { id: 'desc' },
      take: 300,
    });
  }

  async findOne(id: number) {
    const found = await this.prisma.saleReturn.findUnique({
      where: { id },
      include: returnInclude,
    });
    if (!found) throw new NotFoundException('Devolución no encontrada');
    return found;
  }

  /** Líneas de la factura con lo vendido, lo ya devuelto y lo disponible. */
  async returnable(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        credit: true,
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    const returned = await this.returnedByItem(this.prisma, invoiceId);
    return {
      invoice: {
        id: invoice.id,
        consecutive: invoice.consecutive,
        status: invoice.status,
        saleMode: invoice.saleMode,
        total: Number(invoice.total),
        client: invoice.client,
        creditBalance: invoice.credit ? Number(invoice.credit.balance) : null,
      },
      items: invoice.items.map((item) => {
        const done = returned.get(item.id)?.quantity ?? 0;
        const sold = Number(item.quantity);
        return {
          invoiceItemId: item.id,
          productId: item.productId,
          productName: item.product?.name,
          sold,
          returned: done,
          available: Math.max(0, round3(sold - done)),
          unitTotal: sold > 0 ? round(Number(item.total) / sold) : 0,
          taxRate: Number(item.taxRate),
        };
      }),
    };
  }

  async create(dto: CreateReturnDto, actor: AuthUser) {
    const created = await this.prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where: { id: dto.invoiceId },
          include: {
            credit: true,
            items: {
              include: {
                productPrice: { select: { quantity: true, unit: true } },
                product: {
                  select: {
                    unit: true,
                    packagingProfile: {
                      select: { unitsPerPackage: true, packagesPerBox: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!invoice) throw new NotFoundException('Factura no encontrada');
        if (invoice.status === 'ANULADA') {
          throw new BadRequestException('No se puede devolver una factura anulada');
        }

        const returned = await this.returnedByItem(tx, invoice.id);
        const seen = new Set<number>();
        const lines: Array<{
          item: (typeof invoice.items)[number];
          quantity: number;
          subtotal: number;
          taxAmount: number;
          total: number;
        }> = [];

        for (const requested of dto.items) {
          if (seen.has(requested.invoiceItemId)) {
            throw new BadRequestException('Una línea no puede repetirse en la devolución');
          }
          seen.add(requested.invoiceItemId);
          const item = invoice.items.find((row) => row.id === requested.invoiceItemId);
          if (!item) {
            throw new BadRequestException('La línea no pertenece a esta factura');
          }
          const done = returned.get(item.id);
          const sold = Number(item.quantity);
          const available = round3(sold - (done?.quantity ?? 0));
          if (requested.quantity > available + EPS) {
            throw new BadRequestException(
              `Solo se pueden devolver ${available} unidad(es) de la línea ${item.id}; solicitado ${requested.quantity}`,
            );
          }
          const isRest = requested.quantity >= available - EPS;
          // La última devolución de una línea toma el resto exacto para no acumular centavos.
          const subtotal = isRest
            ? round(Number(item.subtotal) - (done?.subtotal ?? 0))
            : round((Number(item.subtotal) * requested.quantity) / sold);
          const taxAmount = isRest
            ? round(Number(item.taxAmount) - (done?.taxAmount ?? 0))
            : round((Number(item.taxAmount) * requested.quantity) / sold);
          lines.push({
            item,
            quantity: requested.quantity,
            subtotal,
            taxAmount,
            total: round(subtotal + taxAmount),
          });
        }

        const subtotal = round(lines.reduce((sum, line) => sum + line.subtotal, 0));
        const taxes = round(lines.reduce((sum, line) => sum + line.taxAmount, 0));
        const total = round(subtotal + taxes);
        if (total <= 0) {
          throw new BadRequestException('El valor a devolver debe ser mayor a cero');
        }

        // 1) La deuda pendiente del crédito se reduce primero, solo por lo devuelto.
        let creditApplied = 0;
        const credit = invoice.credit;
        if (credit && credit.status !== CreditStatus.CANCELADA) {
          const balance = Number(credit.balance);
          creditApplied = round(Math.min(total, Math.max(balance, 0)));
          if (creditApplied > 0) {
            const nextBalance = round(balance - creditApplied);
            await tx.invoiceCredit.update({
              where: { id: credit.id },
              data: {
                totalAmount: { decrement: creditApplied },
                balance: nextBalance,
                status:
                  nextBalance > 0
                    ? credit.status
                    : Number(credit.paidAmount) > 0
                      ? CreditStatus.PAGADA
                      : CreditStatus.CANCELADA,
              },
            });
          }
        }

        // 2) Lo que ya estaba pagado se devuelve en dinero o queda como saldo a favor.
        const remainder = round(total - creditApplied);
        let refundedAmount = 0;
        let advanceAmount = 0;
        const consecutive = nextConsecutive('DV');
        let advanceToLink: number | null = null;
        if (remainder > 0.009) {
          if (!dto.refundMethod) {
            throw new BadRequestException(
              `Indica cómo se devuelven ${remainder.toFixed(2)} ya pagados: de una cuenta o como saldo a favor`,
            );
          }
          if (dto.refundMethod === ReturnRefundMethod.CUENTA) {
            if (!dto.bankAccountId) {
              throw new BadRequestException(
                'Selecciona la cuenta de la que sale el dinero',
              );
            }
            await postBankMovement(tx, {
              bankAccountId: dto.bankAccountId,
              type: 'EGRESO',
              amount: remainder,
              invoiceId: invoice.id,
              description: `Devolución ${consecutive} · factura ${invoice.consecutive}`,
            });
            refundedAmount = remainder;
          } else {
            const advance = await tx.clientAdvance.create({
              data: {
                consecutive: nextConsecutive('ANT'),
                clientId: invoice.clientId,
                amount: remainder,
                balance: remainder,
                source: AdvanceSource.DEVOLUCION,
                notes: `Saldo a favor por devolución ${consecutive}`,
                createdByUserId: actor.sub,
              },
            });
            advanceToLink = advance.id;
            advanceAmount = remainder;
          }
        }

        // 3) Inventario: vuelve a la bodega de donde salió cada línea.
        for (const line of lines) {
          const { item } = line;
          if (!item.warehouseId || !item.productPrice) continue;
          const stockUnits = convertProductQuantityToBase(
            line.quantity * Number(item.productPrice.quantity),
            item.productPrice.unit,
            item.product.unit,
            item.product.packagingProfile,
          );
          if (stockUnits === null || !Number.isFinite(stockUnits) || stockUnits <= 0) {
            continue;
          }
          await tx.productWarehouse.updateMany({
            where: { productId: item.productId, warehouseId: item.warehouseId },
            data: { quantity: { increment: stockUnits } },
          });
        }

        const saleReturn = await tx.saleReturn.create({
          data: {
            consecutive,
            invoiceId: invoice.id,
            clientId: invoice.clientId,
            reason: dto.reason.trim(),
            notes: dto.notes?.trim() || undefined,
            subtotal,
            taxes,
            total,
            creditApplied,
            refundedAmount,
            advanceAmount,
            refundMethod: remainder > 0.009 ? dto.refundMethod : undefined,
            bankAccountId:
              dto.refundMethod === ReturnRefundMethod.CUENTA && remainder > 0.009
                ? dto.bankAccountId
                : undefined,
            createdByUserId: actor.sub,
            createdByUsername: actor.username,
            items: {
              create: lines.map((line) => ({
                invoiceItemId: line.item.id,
                productId: line.item.productId,
                warehouseId: line.item.warehouseId,
                quantity: line.quantity,
                unitPrice: line.item.unitPrice,
                taxRate: line.item.taxRate,
                subtotal: line.subtotal,
                taxAmount: line.taxAmount,
                total: line.total,
                restocked: Boolean(line.item.warehouseId && line.item.productPrice),
              })),
            },
          },
          include: returnInclude,
        });
        if (advanceToLink) {
          await tx.clientAdvance.update({
            where: { id: advanceToLink },
            data: { saleReturnId: saleReturn.id },
          });
        }
        return saleReturn;
      },
      { timeout: 15000 },
    );

    await this.auditLogService.log({
      actor,
      module: 'DEVOLUCIONES',
      action: 'CREATE',
      entityType: 'SaleReturn',
      entityId: created.id,
      entityLabel: created.consecutive,
      description: `Registro la devolución ${created.consecutive} de la factura ${created.invoice.consecutive}`,
      metadata: {
        total: Number(created.total),
        creditApplied: Number(created.creditApplied),
        refundedAmount: Number(created.refundedAmount),
        advanceAmount: Number(created.advanceAmount),
        reason: created.reason,
      },
    });
    return created;
  }

  private async returnedByItem(
    db: Prisma.TransactionClient | PrismaService,
    invoiceId: number,
  ) {
    const rows = await db.saleReturnItem.groupBy({
      by: ['invoiceItemId'],
      where: { saleReturn: { invoiceId } },
      _sum: { quantity: true, subtotal: true, taxAmount: true },
    });
    return new Map(
      rows.map((row) => [
        row.invoiceItemId,
        {
          quantity: Number(row._sum.quantity ?? 0),
          subtotal: Number(row._sum.subtotal ?? 0),
          taxAmount: Number(row._sum.taxAmount ?? 0),
        },
      ]),
    );
  }
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
