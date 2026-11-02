import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreditStatus,
  Prisma,
  PurchaseOrderStatus,
  ReceiptKind,
  ReceiptStatus,
} from '@prisma/client';
import {
  nextConsecutive,
  postBankMovement,
} from '../../common/utils/bank-ledger.util';
import {
  purchaseMovementsPaid,
  purchaseNoteAdjustments,
} from '../../common/utils/purchase-notes.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  CreateReceiptDto,
  ListReceiptsQueryDto,
  StatementQueryDto,
  UpdateReceiptDto,
} from './dto/receipt.dto';

const round = (value: number) => Math.round(value * 100) / 100;
const TOLERANCE = 0.009;

type Tx = Prisma.TransactionClient;
type Source = { bankAccountId: number; remaining: number; label: string };

// Mantiene la convención de descripción que usa Compras para sumar lo pagado.
function purchasePaymentDescription(consecutive: string, note: string) {
  return `Pago compra ${consecutive} - ${note}`;
}

@Injectable()
export class RecibosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /* ------------------------------ consulta ------------------------------ */

  list(query: ListReceiptsQueryDto) {
    return this.prisma.paymentReceipt.findMany({
      where: {
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.providerId ? { providerId: query.providerId } : {}),
        ...(query.from || query.to
          ? {
              paidAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      omit: { supportData: true },
      orderBy: { id: 'desc' },
      take: 500,
    });
  }

  async findOne(id: number) {
    const receipt = await this.prisma.paymentReceipt.findUnique({ where: { id } });
    if (!receipt) throw new NotFoundException('Recibo no encontrado');
    return receipt;
  }

  /** Estado de cuenta del cliente con débitos, créditos y saldo corrido. */
  async clientStatement(clientId: number, query: StatementQueryDto) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const credits = await this.prisma.invoiceCredit.findMany({
      where: { clientId },
      include: {
        invoice: { select: { id: true, consecutive: true } },
        payments: {
          include: {
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
                documentNumber: true,
                detail: true,
                status: true,
                voidedAt: true,
              },
            },
          },
          omit: { supportData: true },
        },
      },
    });
    const returns = await this.prisma.saleReturn.findMany({
      where: {
        clientId,
        creditApplied: { gt: 0 },
        invoice: { credit: { isNot: null } },
      },
      select: {
        id: true,
        consecutive: true,
        creditApplied: true,
        createdAt: true,
        invoice: { select: { consecutive: true } },
      },
    });
    const clientNotes = await this.prisma.accountNote.findMany({
      where: { side: 'COBRAR', clientId, kind: { in: ['DEBITO', 'CREDITO'] } },
    });
    const debitNoteByCredit = new Map(
      clientNotes
        .filter((note) => note.kind === 'DEBITO' && note.creditId)
        .map((note) => [note.creditId as number, note]),
    );
    const creditNotesByCredit = new Map<number, number>();
    for (const note of clientNotes) {
      if (note.kind === 'CREDITO' && note.status === 'VIGENTE' && note.creditId) {
        creditNotesByCredit.set(
          note.creditId,
          (creditNotesByCredit.get(note.creditId) ?? 0) + Number(note.amount),
        );
      }
    }
    const returnedByInvoice = new Map<string, number>();
    for (const row of returns) {
      returnedByInvoice.set(
        row.invoice.consecutive,
        (returnedByInvoice.get(row.invoice.consecutive) ?? 0) + Number(row.creditApplied),
      );
    }

    type Row = {
      key: string;
      date: Date;
      number: string;
      kind: 'FACTURA' | 'ABONO' | 'DEVOLUCION' | 'ANULACION' | 'NOTA_DEBITO' | 'NOTA_CREDITO';
      detail: string;
      debit: number;
      credit: number;
      creditId?: number;
      paymentId?: number;
      receiptId?: number;
      voided?: boolean;
      docAmount?: number;
      docBalance?: number;
      dueDate?: Date | null;
    };
    const rows: Row[] = [];
    for (const credit of credits) {
      const number = credit.invoice?.consecutive ?? `CR-${String(credit.id).padStart(6, '0')}`;
      const debitNote = debitNoteByCredit.get(credit.id);
      // El débito original = total vigente + devoluciones y notas de crédito aplicadas.
      const originalAmount = round(
        Number(credit.totalAmount) +
          (returnedByInvoice.get(number) ?? 0) +
          (creditNotesByCredit.get(credit.id) ?? 0),
      );
      rows.push({
        key: `c${credit.id}`,
        date: credit.createdAt,
        number: debitNote ? debitNote.documentNumber : number,
        kind: debitNote ? 'NOTA_DEBITO' : 'FACTURA',
        detail: debitNote
          ? debitNote.detail
          : `Vence ${credit.dueDate.toISOString().slice(0, 10)}`,
        debit: originalAmount,
        credit: 0,
        creditId: credit.id,
        docAmount: originalAmount,
        docBalance: round(Number(credit.balance)),
        dueDate: credit.dueDate,
      });
      for (const payment of credit.payments) {
        const paid = round(Number(payment.amount) + Number(payment.retention));
        const voided = payment.receipt?.status === ReceiptStatus.ANULADO;
        rows.push({
          key: `p${payment.id}`,
          date: payment.paidAt,
          number:
            payment.receipt?.documentNumber ??
            payment.receiptNumber ??
            `ABONO-${payment.id}`,
          kind: 'ABONO',
          detail: `${payment.receipt?.detail ?? payment.notes ?? 'Abono'} · ${number}`,
          debit: 0,
          credit: paid,
          creditId: credit.id,
          paymentId: payment.id,
          receiptId: payment.receipt?.id,
          voided,
          docAmount: paid,
          docBalance: round(Number(credit.balance)),
          dueDate: credit.dueDate,
        });
        if (voided && payment.receipt?.voidedAt) {
          rows.push({
            key: `v${payment.id}`,
            date: payment.receipt.voidedAt,
            number: payment.receipt.documentNumber,
            kind: 'ANULACION',
            detail: `Anulación del recibo ${payment.receipt.receiptNumber} · ${number}`,
            debit: paid,
            credit: 0,
            creditId: credit.id,
            receiptId: payment.receipt.id,
          });
        }
      }
    }
    for (const note of clientNotes) {
      const amount = round(Number(note.amount));
      const voided = note.status === 'ANULADO';
      if (note.kind === 'CREDITO') {
        rows.push({
          key: `n${note.id}`,
          date: note.issuedAt,
          number: note.documentNumber,
          kind: 'NOTA_CREDITO',
          detail: note.detail,
          debit: 0,
          credit: amount,
          creditId: note.creditId ?? undefined,
          voided,
        });
      }
      if (voided && note.voidedAt) {
        rows.push({
          key: `nv${note.id}`,
          date: note.voidedAt,
          number: note.documentNumber,
          kind: 'ANULACION',
          detail: `Anulación de la nota ${note.documentNumber}`,
          debit: note.kind === 'CREDITO' ? amount : 0,
          credit: note.kind === 'DEBITO' ? amount : 0,
          creditId: note.creditId ?? undefined,
        });
      }
    }
    for (const row of returns) {
      rows.push({
        key: `r${row.id}`,
        date: row.createdAt,
        number: row.consecutive,
        kind: 'DEVOLUCION',
        detail: `Devolución de la factura ${row.invoice.consecutive}`,
        debit: 0,
        credit: round(Number(row.creditApplied)),
      });
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key));

    let balance = 0;
    let opening = 0;
    const visible: Array<Row & { balance: number }> = [];
    for (const row of rows) {
      balance = round(balance + row.debit - row.credit);
      if (from && row.date < from) {
        opening = balance;
        continue;
      }
      if (to && row.date > to) continue;
      visible.push({ ...row, balance });
    }
    return {
      opening,
      rows: visible,
      totalDebit: round(visible.reduce((sum, row) => sum + row.debit, 0)),
      totalCredit: round(visible.reduce((sum, row) => sum + row.credit, 0)),
      balance,
    };
  }

  /** Estado de cuenta del proveedor: facturas (créditos) y pagos (débitos), saldo = lo que se debe. */
  async providerStatement(providerId: number, query: StatementQueryDto) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { providerId, status: PurchaseOrderStatus.RECIBIDA },
      select: {
        id: true,
        consecutive: true,
        total: true,
        payableTotal: true,
        orderedAt: true,
        receivedAt: true,
        expectedAt: true,
      },
    });
    const byConsecutive = new Map(orders.map((order) => [order.consecutive, order]));
    const movements = orders.length
      ? await this.prisma.bankAccountMovement.findMany({
          where: {
            movementType: 'EGRESO',
            OR: orders.map((order) => ({
              description: { startsWith: `Pago compra ${order.consecutive}` },
            })),
          },
          select: { id: true, amount: true, description: true, createdAt: true },
        })
      : [];
    const receipts = await this.prisma.paymentReceipt.findMany({
      where: { kind: ReceiptKind.PAGO, providerId },
      select: { id: true, documentNumber: true, detail: true, status: true },
    });
    const receiptByDoc = new Map(receipts.map((receipt) => [receipt.documentNumber, receipt]));
    const payableOf = (order: (typeof orders)[number]) =>
      Number(order.payableTotal) > 0 || Number(order.total) === 0
        ? Number(order.payableTotal)
        : Number(order.total);

    type Row = {
      key: string;
      date: Date;
      number: string;
      kind: 'FACTURA' | 'ABONO' | 'ANULACION' | 'NOTA_DEBITO' | 'NOTA_CREDITO';
      detail: string;
      debit: number;
      credit: number;
      receiptId?: number;
      voided?: boolean;
      docAmount?: number;
      docBalance?: number;
      dueDate?: Date | null;
    };
    const providerNotes = await this.prisma.accountNote.findMany({
      where: { side: 'PAGAR', providerId, kind: { in: ['DEBITO', 'CREDITO'] } },
    });
    const noteAdjustments = await purchaseNoteAdjustments(
      this.prisma,
      orders.map((order) => order.id),
    );
    const paidByOrder = new Map<string, number>();
    const payRows: Row[] = [];
    for (const movement of movements) {
      const description = movement.description ?? '';
      const rest = description.slice('Pago compra '.length);
      const [consecutive, ...noteParts] = rest.split(' - ');
      const order = byConsecutive.get(consecutive);
      if (!order) continue;
      const note = noteParts.join(' - ');
      const documentNumber = /^Doc ([^·]+?)(?: ·.*)?$/.exec(note)?.[1]?.trim();
      const receipt = documentNumber ? receiptByDoc.get(documentNumber) : undefined;
      paidByOrder.set(consecutive, round((paidByOrder.get(consecutive) ?? 0) + Number(movement.amount)));
      payRows.push({
        key: `m${movement.id}`,
        date: movement.createdAt,
        number: receipt?.documentNumber ?? documentNumber ?? `PAG-${movement.id}`,
        kind: 'ABONO',
        detail: `${receipt?.detail ?? (note || 'Pago')} · ${consecutive}`,
        debit: round(Number(movement.amount)),
        credit: 0,
        receiptId: receipt?.id,
        voided: receipt?.status === ReceiptStatus.ANULADO,
        docAmount: round(Number(movement.amount)),
        dueDate: order.expectedAt,
      });
    }
    const rows: Row[] = [
      ...orders.map((order) => ({
        key: `o${order.id}`,
        date: order.receivedAt ?? order.orderedAt,
        number: order.consecutive,
        kind: 'FACTURA' as const,
        detail: 'Compra recibida',
        debit: 0,
        credit: round(payableOf(order)),
        docAmount: round(payableOf(order)),
        docBalance: round(
          Math.max(
            0,
            payableOf(order) -
              (paidByOrder.get(order.consecutive) ?? 0) -
              (noteAdjustments.get(order.id) ?? 0),
          ),
        ),
        dueDate: order.expectedAt,
      })),
      ...payRows,
    ];
    for (const note of providerNotes) {
      const amount = round(Number(note.amount));
      const voided = note.status === 'ANULADO';
      const isDebit = note.kind === 'DEBITO';
      rows.push({
        key: `n${note.id}`,
        date: note.issuedAt,
        number: note.documentNumber,
        kind: isDebit ? 'NOTA_DEBITO' : 'NOTA_CREDITO',
        detail: note.detail,
        // Para el proveedor: la nota de débito baja lo que se debe (débito) y la de crédito lo sube.
        debit: isDebit ? amount : 0,
        credit: isDebit ? 0 : amount,
        voided,
        docAmount: amount,
      });
      if (voided && note.voidedAt) {
        rows.push({
          key: `nv${note.id}`,
          date: note.voidedAt,
          number: note.documentNumber,
          kind: 'ANULACION',
          detail: `Anulación de la nota ${note.documentNumber}`,
          debit: isDebit ? 0 : amount,
          credit: isDebit ? amount : 0,
        });
      }
    }
    for (const row of payRows) {
      const consecutive = row.detail.split(' · ').pop() ?? '';
      const order = byConsecutive.get(consecutive);
      if (order) {
        row.docBalance = round(
          Math.max(
            0,
            payableOf(order) -
              (paidByOrder.get(consecutive) ?? 0) -
              (noteAdjustments.get(order.id) ?? 0),
          ),
        );
      }
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key));

    let balance = 0;
    let opening = 0;
    const visible: Array<Row & { balance: number }> = [];
    for (const row of rows) {
      balance = round(balance + row.credit - row.debit);
      if (from && row.date < from) {
        opening = balance;
        continue;
      }
      if (to && row.date > to) continue;
      visible.push({ ...row, balance });
    }
    return {
      opening,
      rows: visible,
      totalDebit: round(visible.reduce((sum, row) => sum + row.debit, 0)),
      totalCredit: round(visible.reduce((sum, row) => sum + row.credit, 0)),
      balance,
    };
  }

  /* ------------------------------- cobros ------------------------------- */

  async createCollection(dto: CreateReceiptDto, actor: AuthUser) {
    if (!dto.clientId) throw new BadRequestException('Selecciona el cliente');
    const created = await this.prisma.$transaction(
      async (tx) => {
        const client = await tx.client.findUnique({ where: { id: dto.clientId } });
        if (!client) throw new NotFoundException('Cliente no encontrado');
        await this.ensureDocumentFree(tx, ReceiptKind.COBRO, dto.documentNumber);

        const lines = this.cleanAllocations(dto);
        const credits = await tx.invoiceCredit.findMany({
          where: { id: { in: lines.map((line) => line.creditId!) }, clientId: client.id },
          include: { invoice: { select: { consecutive: true } } },
        });
        let total = 0;
        let retentionTotal = 0;
        const allocations: Array<Record<string, unknown>> = [];
        for (const line of lines) {
          const credit = credits.find((item) => item.id === line.creditId);
          if (!credit) {
            throw new BadRequestException('Un documento no pertenece a este cliente');
          }
          const retention = round(line.retention ?? 0);
          const balance = Number(credit.balance);
          if (line.amount + retention > balance + TOLERANCE) {
            throw new BadRequestException(
              `El abono más la retención supera el saldo pendiente (${balance.toFixed(2)})`,
            );
          }
          total += line.amount;
          retentionTotal += retention;
          allocations.push({
            creditId: credit.id,
            number: credit.invoice?.consecutive ?? `CR-${credit.id}`,
            amount: line.amount,
            retention,
          });
        }
        total = round(total);
        const sources = await this.buildSources(tx, dto, total, 'EFECTIVO');

        const receiptNumber = nextConsecutive('RC');
        const instruments: Array<Record<string, unknown>> = [];
        for (const source of sources) {
          const movement = await postBankMovement(tx, {
            bankAccountId: source.bankAccountId,
            type: 'INGRESO',
            amount: source.remaining,
            description: `Cobro ${dto.documentNumber} · ${client.firstName} ${client.lastName}${source.reference ? ` · ${source.reference}` : ''}`,
          });
          instruments.push({
            bankAccountId: source.bankAccountId,
            name: source.label,
            amount: source.remaining,
            reference: source.reference ?? null,
            movementId: movement.id,
          });
        }

        const receipt = await tx.paymentReceipt.create({
          data: {
            kind: ReceiptKind.COBRO,
            receiptNumber,
            documentNumber: dto.documentNumber.trim(),
            detail: dto.detail.trim(),
            clientId: client.id,
            paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
            totalAmount: total,
            cashAmount: round(dto.cashAmount ?? 0),
            retentionTotal: round(retentionTotal),
            instruments: instruments as Prisma.InputJsonValue,
            allocations: allocations as Prisma.InputJsonValue,
            ...this.metadata(dto),
            createdByUserId: actor.sub,
            createdByUsername: actor.username,
          },
        });

        for (const line of lines) {
          const credit = credits.find((item) => item.id === line.creditId)!;
          const retention = round(line.retention ?? 0);
          await tx.creditPayment.create({
            data: {
              invoiceCreditId: credit.id,
              amount: line.amount,
              retention,
              notes: dto.detail.trim(),
              receiptId: receipt.id,
              createdByUserId: actor.sub,
              paidAt: receipt.paidAt,
            },
          });
          const nextBalance = Math.max(
            0,
            round(Number(credit.balance) - line.amount - retention),
          );
          await tx.invoiceCredit.update({
            where: { id: credit.id },
            data: {
              paidAmount: { increment: line.amount + retention },
              balance: nextBalance,
              status: nextBalance === 0 ? CreditStatus.PAGADA : CreditStatus.PARCIAL,
            },
          });
        }
        return receipt;
      },
      { timeout: 20000 },
    );
    await this.audit(actor, 'COLLECT', created, `Registro el cobro ${created.documentNumber}`);
    return this.stripSupport(created);
  }

  /* ------------------------------- pagos -------------------------------- */

  async createPayment(dto: CreateReceiptDto, actor: AuthUser) {
    if (!dto.providerId) throw new BadRequestException('Selecciona el proveedor');
    const created = await this.prisma.$transaction(
      async (tx) => {
        const provider = await tx.provider.findUnique({ where: { id: dto.providerId } });
        if (!provider) throw new NotFoundException('Proveedor no encontrado');
        await this.ensureDocumentFree(tx, ReceiptKind.PAGO, dto.documentNumber);

        const lines = this.cleanAllocations(dto, 'purchaseOrderId');
        const orders = await tx.purchaseOrder.findMany({
          where: {
            id: { in: lines.map((line) => line.purchaseOrderId!) },
            providerId: provider.id,
          },
        });
        const adjustments = await purchaseNoteAdjustments(
          tx,
          orders.map((order) => order.id),
        );
        let total = 0;
        const allocations: Array<Record<string, unknown>> = [];
        for (const line of lines) {
          const order = orders.find((item) => item.id === line.purchaseOrderId);
          if (!order) {
            throw new BadRequestException('Una compra no pertenece a este proveedor');
          }
          if (order.status !== PurchaseOrderStatus.RECIBIDA) {
            throw new BadRequestException(
              `La compra ${order.consecutive} no está recibida; solo se pagan compras recibidas`,
            );
          }
          const paid =
            (await purchaseMovementsPaid(tx, order.consecutive)) +
            (adjustments.get(order.id) ?? 0);
          const payable =
            Number(order.payableTotal ?? 0) > 0 || Number(order.total) === 0
              ? Number(order.payableTotal ?? 0)
              : Number(order.total);
          const balance = Math.max(0, round(payable - paid));
          if (line.amount > balance + TOLERANCE) {
            throw new BadRequestException(
              `El pago de ${order.consecutive} supera su saldo pendiente (${balance.toFixed(2)})`,
            );
          }
          total += line.amount;
          allocations.push({
            purchaseOrderId: order.id,
            number: order.consecutive,
            amount: line.amount,
          });
        }
        total = round(total);
        const sources = await this.buildSources(tx, dto, total, 'EFECTIVO');

        // Cada compra consume de las fuentes en orden: queda un egreso por tramo.
        const instrumentTotals = new Map<number, Record<string, unknown>>();
        for (const allocation of allocations) {
          let pending = allocation.amount as number;
          for (const source of sources) {
            if (pending <= 0) break;
            const slice = round(Math.min(pending, source.remaining));
            if (slice <= 0) continue;
            const movement = await postBankMovement(tx, {
              bankAccountId: source.bankAccountId,
              type: 'EGRESO',
              amount: slice,
              description: purchasePaymentDescription(
                String(allocation.number),
                `Doc ${dto.documentNumber.trim()}${source.reference ? ` · ${source.reference}` : ''}`,
              ),
            });
            source.remaining = round(source.remaining - slice);
            pending = round(pending - slice);
            const entry = instrumentTotals.get(source.bankAccountId) ?? {
              bankAccountId: source.bankAccountId,
              name: source.label,
              amount: 0,
              reference: source.reference ?? null,
              movementIds: [] as number[],
            };
            entry.amount = round((entry.amount as number) + slice);
            (entry.movementIds as number[]).push(movement.id);
            instrumentTotals.set(source.bankAccountId, entry);
          }
        }

        return tx.paymentReceipt.create({
          data: {
            kind: ReceiptKind.PAGO,
            receiptNumber: nextConsecutive('CE'),
            documentNumber: dto.documentNumber.trim(),
            detail: dto.detail.trim(),
            providerId: provider.id,
            paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
            totalAmount: total,
            cashAmount: round(dto.cashAmount ?? 0),
            instruments: [...instrumentTotals.values()] as Prisma.InputJsonValue,
            allocations: allocations as Prisma.InputJsonValue,
            ...this.metadata(dto),
            createdByUserId: actor.sub,
            createdByUsername: actor.username,
          },
        });
      },
      { timeout: 20000 },
    );
    await this.audit(actor, 'PAY', created, `Registro el pago ${created.documentNumber}`);
    return this.stripSupport(created);
  }

  /* --------------------------- edición / anulación --------------------------- */

  async update(id: number, dto: UpdateReceiptDto, actor: AuthUser) {
    const current = await this.findOne(id);
    if (current.status === ReceiptStatus.ANULADO) {
      throw new BadRequestException('Un recibo anulado no se puede editar');
    }
    if (dto.documentNumber && dto.documentNumber.trim() !== current.documentNumber) {
      await this.ensureDocumentFree(this.prisma, current.kind, dto.documentNumber, id);
    }
    const updated = await this.prisma.paymentReceipt.update({
      where: { id },
      data: {
        ...(dto.documentNumber ? { documentNumber: dto.documentNumber.trim() } : {}),
        ...(dto.detail ? { detail: dto.detail.trim() } : {}),
        ...(dto.paidAt ? { paidAt: new Date(dto.paidAt) } : {}),
        ...(dto.comments !== undefined ? { comments: dto.comments.trim() || null } : {}),
        ...(dto.operationType !== undefined ? { operationType: dto.operationType.trim() || null } : {}),
        ...(dto.sellerName !== undefined ? { sellerName: dto.sellerName.trim() || null } : {}),
        ...(dto.removeSupport
          ? { supportName: null, supportMimeType: null, supportData: null }
          : dto.supportData
            ? {
                supportName: dto.supportName ?? 'soporte',
                supportMimeType: dto.supportMimeType ?? null,
                supportData: dto.supportData,
              }
            : {}),
        updatedByUserId: actor.sub,
      },
    });
    await this.auditLogService.log({
      actor,
      module: 'RECIBOS',
      action: 'UPDATE',
      entityType: 'PaymentReceipt',
      entityId: id,
      entityLabel: updated.documentNumber,
      description: `Edito el recibo ${updated.receiptNumber}`,
      metadata: {
        before: {
          documentNumber: current.documentNumber,
          detail: current.detail,
          paidAt: current.paidAt,
          comments: current.comments,
        },
        after: {
          documentNumber: updated.documentNumber,
          detail: updated.detail,
          paidAt: updated.paidAt,
          comments: updated.comments,
        },
        supportChanged: Boolean(dto.supportData || dto.removeSupport),
      },
    });
    return this.stripSupport(updated);
  }

  /** Anula un recibo de cobro: revierte saldos de cartera y los ingresos del banco. */
  async voidCollection(id: number, reason: string, actor: AuthUser) {
    const voided = await this.prisma.$transaction(
      async (tx) => {
        const receipt = await tx.paymentReceipt.findUnique({
          where: { id },
          include: { payments: true },
        });
        if (!receipt) throw new NotFoundException('Recibo no encontrado');
        if (receipt.kind !== ReceiptKind.COBRO) {
          throw new BadRequestException(
            'Los pagos a proveedores no se anulan desde aquí; registra una corrección en Compras',
          );
        }
        if (receipt.status === ReceiptStatus.ANULADO) {
          throw new BadRequestException('El recibo ya está anulado');
        }
        for (const payment of receipt.payments) {
          const credit = await tx.invoiceCredit.findUniqueOrThrow({
            where: { id: payment.invoiceCreditId },
          });
          const restored = round(
            Number(credit.balance) + Number(payment.amount) + Number(payment.retention),
          );
          const paidAmount = Math.max(
            0,
            round(Number(credit.paidAmount) - Number(payment.amount) - Number(payment.retention)),
          );
          await tx.invoiceCredit.update({
            where: { id: credit.id },
            data: {
              balance: restored,
              paidAmount,
              status: paidAmount > 0 ? CreditStatus.PARCIAL : CreditStatus.PENDIENTE,
            },
          });
        }
        const instruments = (receipt.instruments as Array<{
          bankAccountId: number;
          amount: number;
        }>) ?? [];
        for (const instrument of instruments) {
          await postBankMovement(tx, {
            bankAccountId: instrument.bankAccountId,
            type: 'EGRESO',
            amount: Number(instrument.amount),
            description: `Anulación del cobro ${receipt.documentNumber}`,
          });
        }
        return tx.paymentReceipt.update({
          where: { id },
          data: {
            status: ReceiptStatus.ANULADO,
            voidedAt: new Date(),
            voidReason: reason.trim(),
            updatedByUserId: actor.sub,
          },
        });
      },
      { timeout: 20000 },
    );
    await this.audit(actor, 'VOID', voided, `Anulo el recibo ${voided.receiptNumber}: ${reason}`);
    return this.stripSupport(voided);
  }

  /* ------------------------------- helpers ------------------------------- */

  private cleanAllocations(dto: CreateReceiptDto, key: 'creditId' | 'purchaseOrderId' = 'creditId') {
    const lines = (dto.allocations ?? []).filter((line) => Number(line.amount) > 0);
    if (!lines.length) {
      throw new BadRequestException('Indica el monto abonado en al menos un documento');
    }
    const seen = new Set<number>();
    for (const line of lines) {
      const id = line[key];
      if (!id) throw new BadRequestException('Cada línea debe indicar su documento');
      if (seen.has(id)) throw new BadRequestException('Un documento no puede repetirse');
      seen.add(id);
      line.amount = round(Number(line.amount));
    }
    return lines;
  }

  /** Efectivo + instrumentos de pago deben desglosar exactamente el total. */
  private async buildSources(
    tx: Tx,
    dto: CreateReceiptDto,
    total: number,
    cashLabel: string,
  ) {
    const sources: Array<Source & { reference?: string }> = [];
    const cash = round(dto.cashAmount ?? 0);
    if (cash > 0) {
      if (!dto.cashAccountId) {
        throw new BadRequestException('Selecciona la cuenta o caja donde entra/sale el efectivo');
      }
      sources.push({ bankAccountId: dto.cashAccountId, remaining: cash, label: cashLabel });
    }
    for (const instrument of dto.instruments ?? []) {
      sources.push({
        bankAccountId: instrument.bankAccountId,
        remaining: round(instrument.amount),
        label: '',
        reference: instrument.reference?.trim() || undefined,
      });
    }
    const desglose = round(sources.reduce((sum, source) => sum + source.remaining, 0));
    if (Math.abs(desglose - total) > TOLERANCE) {
      throw new BadRequestException(
        `El desglose (${desglose.toFixed(2)}) debe ser igual al total (${total.toFixed(2)})`,
      );
    }
    const accounts = await tx.bankAccount.findMany({
      where: { id: { in: sources.map((source) => source.bankAccountId) } },
      select: { id: true, name: true, isActive: true },
    });
    for (const source of sources) {
      const account = accounts.find((item) => item.id === source.bankAccountId);
      if (!account || !account.isActive) {
        throw new BadRequestException('Una cuenta del desglose no existe o está inactiva');
      }
      if (!source.label) source.label = account.name;
      else source.label = `${source.label} · ${account.name}`;
    }
    return sources;
  }

  private async ensureDocumentFree(
    db: Tx | PrismaService,
    kind: ReceiptKind,
    documentNumber: string,
    exceptId?: number,
  ) {
    const clash = await db.paymentReceipt.findFirst({
      where: {
        kind,
        documentNumber: documentNumber.trim(),
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException(
        `El número de documento ${documentNumber.trim()} ya fue usado en otro recibo`,
      );
    }
  }

  private metadata(dto: CreateReceiptDto) {
    return {
      comments: dto.comments?.trim() || undefined,
      operationType: dto.operationType?.trim() || undefined,
      sellerName: dto.sellerName?.trim() || undefined,
      ...(dto.supportData
        ? {
            supportName: dto.supportName ?? 'soporte',
            supportMimeType: dto.supportMimeType,
            supportData: dto.supportData,
          }
        : {}),
    };
  }

  private stripSupport<T extends { supportData?: string | null }>(receipt: T) {
    const { supportData, ...rest } = receipt;
    return { ...rest, hasSupport: Boolean(supportData) };
  }

  private audit(
    actor: AuthUser,
    action: string,
    receipt: { id: number; receiptNumber: string; totalAmount: Prisma.Decimal; kind: ReceiptKind },
    description: string,
  ) {
    return this.auditLogService.log({
      actor,
      module: 'RECIBOS',
      action,
      entityType: 'PaymentReceipt',
      entityId: receipt.id,
      entityLabel: receipt.receiptNumber,
      description,
      metadata: { kind: receipt.kind, total: Number(receipt.totalAmount) },
    });
  }
}
