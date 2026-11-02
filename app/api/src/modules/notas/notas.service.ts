import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountSide,
  CreditStatus,
  NoteKind,
  Prisma,
  PurchaseOrderStatus,
  ReceiptStatus,
} from '@prisma/client';
import { postBankMovement } from '../../common/utils/bank-ledger.util';
import {
  purchaseMovementsPaid,
  purchaseNoteAdjustments,
  purchasePayable,
} from '../../common/utils/purchase-notes.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  ApplyAdvanceNoteDto,
  CreateNoteDto,
  ListNotesQueryDto,
} from './dto/note.dto';

const round = (value: number) => Math.round(value * 100) / 100;
const EPS = 0.009;

type Tx = Prisma.TransactionClient;

/**
 * Notas de débito / crédito y anticipos de Cuentas por cobrar y por pagar.
 * Todas dejan rastro (auditoría) y se pueden anular con motivo.
 */
@Injectable()
export class NotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  list(query: ListNotesQueryDto) {
    return this.prisma.accountNote.findMany({
      where: {
        ...(query.side ? { side: query.side } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.providerId ? { providerId: query.providerId } : {}),
      },
      orderBy: { id: 'desc' },
      take: 500,
    });
  }

  /* ------------------------------- cobrar ------------------------------- */

  /** Cargo adicional al cliente (intereses, ajustes): crea una cuenta por cobrar. */
  async createClientDebit(dto: CreateNoteDto, actor: AuthUser) {
    const created = await this.prisma.$transaction(async (tx) => {
      const client = await this.client(tx, dto.clientId);
      await this.ensureFree(tx, AccountSide.COBRAR, NoteKind.DEBITO, dto.documentNumber);
      const dueDate = dto.dueDate ? new Date(dto.dueDate) : this.defaultDue();
      const amount = round(dto.amount);
      const credit = await tx.invoiceCredit.create({
        data: {
          clientId: client.id,
          dueDate,
          totalAmount: amount,
          paidAmount: 0,
          balance: amount,
          status: CreditStatus.PENDIENTE,
        },
      });
      return tx.accountNote.create({
        data: {
          side: AccountSide.COBRAR,
          kind: NoteKind.DEBITO,
          documentNumber: dto.documentNumber.trim(),
          detail: dto.detail.trim(),
          clientId: client.id,
          creditId: credit.id,
          amount,
          balance: amount,
          dueDate,
          createdByUserId: actor.sub,
          createdByUsername: actor.username,
        },
      });
    });
    await this.audit(actor, 'CREATE', created, 'Registro la nota de débito');
    return created;
  }

  /** Ajuste a favor del cliente que baja una de sus cuentas por cobrar (sin mover dinero). */
  async createClientCredit(dto: CreateNoteDto, actor: AuthUser) {
    const created = await this.prisma.$transaction(async (tx) => {
      const client = await this.client(tx, dto.clientId);
      await this.ensureFree(tx, AccountSide.COBRAR, NoteKind.CREDITO, dto.documentNumber);
      if (!dto.creditId) throw new BadRequestException('Selecciona la cuenta por cobrar a ajustar');
      const credit = await tx.invoiceCredit.findUnique({ where: { id: dto.creditId } });
      if (!credit || credit.clientId !== client.id) {
        throw new BadRequestException('La cuenta no existe o pertenece a otro cliente');
      }
      const amount = round(dto.amount);
      const balance = Number(credit.balance);
      if (amount > balance + EPS) {
        throw new BadRequestException(
          `La nota no puede superar el saldo pendiente (${balance.toFixed(2)})`,
        );
      }
      const nextBalance = Math.max(0, round(balance - amount));
      await tx.invoiceCredit.update({
        where: { id: credit.id },
        data: {
          totalAmount: { decrement: amount },
          balance: nextBalance,
          status: this.statusAfter(nextBalance, Number(credit.paidAmount), credit.status),
        },
      });
      return tx.accountNote.create({
        data: {
          side: AccountSide.COBRAR,
          kind: NoteKind.CREDITO,
          documentNumber: dto.documentNumber.trim(),
          detail: dto.detail.trim(),
          clientId: client.id,
          creditId: credit.id,
          amount,
          createdByUserId: actor.sub,
          createdByUsername: actor.username,
        },
      });
    });
    await this.audit(actor, 'CREATE', created, 'Registro la nota de crédito');
    return created;
  }

  /* ------------------------------- pagar -------------------------------- */

  /** Baja lo que se debe de una compra (retención, descuento, ajuste a favor nuestro). */
  async createProviderDebit(dto: CreateNoteDto, actor: AuthUser) {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.ensureFree(tx, AccountSide.PAGAR, NoteKind.DEBITO, dto.documentNumber);
      const { order, provider } = await this.providerOrder(tx, dto);
      const amount = round(dto.amount);
      const balance = await this.orderBalance(tx, order);
      if (amount > balance + EPS) {
        throw new BadRequestException(
          `La nota supera el saldo pendiente de la compra (${balance.toFixed(2)})`,
        );
      }
      return this.createProviderNote(tx, NoteKind.DEBITO, dto, provider.id, order.id, amount, actor);
    });
    await this.audit(actor, 'CREATE', created, 'Registro la nota de débito de proveedor');
    return created;
  }

  /** Sube lo que se debe de una compra (cargo adicional del proveedor: flete, ajuste). */
  async createProviderCredit(dto: CreateNoteDto, actor: AuthUser) {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.ensureFree(tx, AccountSide.PAGAR, NoteKind.CREDITO, dto.documentNumber);
      const { order, provider } = await this.providerOrder(tx, dto);
      return this.createProviderNote(
        tx,
        NoteKind.CREDITO,
        dto,
        provider.id,
        order.id,
        round(dto.amount),
        actor,
      );
    });
    await this.audit(actor, 'CREATE', created, 'Registro la nota de crédito de proveedor');
    return created;
  }

  /** Pago adelantado a un proveedor: sale dinero del banco y queda como saldo de anticipos. */
  async createProviderAdvance(dto: CreateNoteDto, actor: AuthUser) {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.ensureFree(tx, AccountSide.PAGAR, NoteKind.ANTICIPO, dto.documentNumber);
      if (!dto.providerId) throw new BadRequestException('Selecciona el proveedor');
      const provider = await tx.provider.findUnique({ where: { id: dto.providerId } });
      if (!provider) throw new NotFoundException('Proveedor no encontrado');
      if (!dto.bankAccountId) {
        throw new BadRequestException('Selecciona la cuenta de la que sale el anticipo');
      }
      const amount = round(dto.amount);
      await postBankMovement(tx, {
        bankAccountId: dto.bankAccountId,
        type: 'EGRESO',
        amount,
        description: `Anticipo proveedor ${dto.documentNumber.trim()} · ${provider.name}`,
      });
      return tx.accountNote.create({
        data: {
          side: AccountSide.PAGAR,
          kind: NoteKind.ANTICIPO,
          documentNumber: dto.documentNumber.trim(),
          detail: dto.detail.trim(),
          providerId: provider.id,
          amount,
          balance: amount,
          bankAccountId: dto.bankAccountId,
          createdByUserId: actor.sub,
          createdByUsername: actor.username,
        },
      });
    });
    await this.audit(actor, 'CREATE', created, 'Registro el anticipo a proveedor');
    return created;
  }

  /** Aplica un anticipo a una compra: genera una nota de débito ligada al anticipo. */
  async applyProviderAdvance(id: number, dto: ApplyAdvanceNoteDto, actor: AuthUser) {
    const created = await this.prisma.$transaction(async (tx) => {
      const advance = await tx.accountNote.findUnique({ where: { id } });
      if (
        !advance ||
        advance.side !== AccountSide.PAGAR ||
        advance.kind !== NoteKind.ANTICIPO ||
        advance.status !== ReceiptStatus.VIGENTE
      ) {
        throw new NotFoundException('Anticipo no encontrado o anulado');
      }
      const amount = round(dto.amount);
      if (amount > Number(advance.balance) + EPS) {
        throw new BadRequestException(
          `El anticipo solo tiene ${Number(advance.balance).toFixed(2)} disponibles`,
        );
      }
      const { order, provider } = await this.providerOrder(tx, {
        providerId: advance.providerId ?? undefined,
        purchaseOrderId: dto.purchaseOrderId,
      } as CreateNoteDto);
      const balance = await this.orderBalance(tx, order);
      if (amount > balance + EPS) {
        throw new BadRequestException(
          `El valor supera el saldo pendiente de la compra (${balance.toFixed(2)})`,
        );
      }
      await tx.accountNote.update({
        where: { id: advance.id },
        data: { balance: { decrement: amount } },
      });
      return tx.accountNote.create({
        data: {
          side: AccountSide.PAGAR,
          kind: NoteKind.DEBITO,
          documentNumber: `AP-${advance.documentNumber}-${Date.now() % 100000}`,
          detail: `Aplicación del anticipo ${advance.documentNumber}`,
          providerId: provider.id,
          purchaseOrderId: order.id,
          amount,
          advanceNoteId: advance.id,
          createdByUserId: actor.sub,
          createdByUsername: actor.username,
        },
      });
    });
    await this.audit(actor, 'APPLY', created, 'Aplico un anticipo a una compra');
    return created;
  }

  /* ------------------------------- anular ------------------------------- */

  async void(id: number, reason: string, actor: AuthUser) {
    const voided = await this.prisma.$transaction(async (tx) => {
      const note = await tx.accountNote.findUnique({ where: { id } });
      if (!note) throw new NotFoundException('Nota no encontrada');
      if (note.status === ReceiptStatus.ANULADO) {
        throw new BadRequestException('La nota ya está anulada');
      }
      const amount = Number(note.amount);

      if (note.side === AccountSide.COBRAR && note.kind === NoteKind.DEBITO) {
        const credit = await tx.invoiceCredit.findUnique({ where: { id: note.creditId! } });
        if (!credit || Number(credit.paidAmount) > 0 || Math.abs(Number(credit.balance) - amount) > EPS) {
          throw new BadRequestException(
            'La nota de débito ya tiene abonos: anula primero los recibos que la pagaron',
          );
        }
        await tx.invoiceCredit.update({
          where: { id: credit.id },
          data: { balance: 0, status: CreditStatus.CANCELADA },
        });
      } else if (note.side === AccountSide.COBRAR && note.kind === NoteKind.CREDITO) {
        const credit = await tx.invoiceCredit.findUniqueOrThrow({ where: { id: note.creditId! } });
        const nextBalance = round(Number(credit.balance) + amount);
        await tx.invoiceCredit.update({
          where: { id: credit.id },
          data: {
            totalAmount: { increment: amount },
            balance: nextBalance,
            status: this.statusAfter(nextBalance, Number(credit.paidAmount), credit.status),
          },
        });
      } else if (note.side === AccountSide.PAGAR && note.kind === NoteKind.CREDITO) {
        // Anular un cargo no puede dejar la compra con saldo negativo (ya se pagó sobre él).
        const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: note.purchaseOrderId! } });
        const balanceAfter = (await this.orderBalance(tx, order)) - amount;
        if (balanceAfter < -EPS) {
          throw new BadRequestException(
            'La compra ya se pagó sobre esta nota: no se puede anular',
          );
        }
      } else if (note.side === AccountSide.PAGAR && note.kind === NoteKind.DEBITO) {
        if (note.advanceNoteId) {
          await tx.accountNote.update({
            where: { id: note.advanceNoteId },
            data: { balance: { increment: amount } },
          });
        }
      } else if (note.side === AccountSide.PAGAR && note.kind === NoteKind.ANTICIPO) {
        if (Math.abs(Number(note.balance) - amount) > EPS) {
          throw new BadRequestException('El anticipo ya se aplicó a compras: anula primero esas aplicaciones');
        }
        await postBankMovement(tx, {
          bankAccountId: note.bankAccountId!,
          type: 'INGRESO',
          amount,
          description: `Anulación del anticipo a proveedor ${note.documentNumber}`,
        });
      }
      return tx.accountNote.update({
        where: { id },
        data: {
          status: ReceiptStatus.ANULADO,
          voidedAt: new Date(),
          voidReason: reason.trim(),
          balance: note.kind === NoteKind.ANTICIPO ? 0 : note.balance,
        },
      });
    });
    await this.audit(actor, 'VOID', voided, `Anulo la nota ${voided.documentNumber}: ${reason}`);
    return voided;
  }

  /* ------------------------------- helpers ------------------------------- */

  private async client(tx: Tx, clientId?: number) {
    if (!clientId) throw new BadRequestException('Selecciona el cliente');
    const client = await tx.client.findUnique({ where: { id: clientId } });
    if (!client || !client.isActive) {
      throw new BadRequestException('El cliente no existe o está inactivo');
    }
    return client;
  }

  private async providerOrder(tx: Tx, dto: Pick<CreateNoteDto, 'providerId' | 'purchaseOrderId'>) {
    if (!dto.providerId) throw new BadRequestException('Selecciona el proveedor');
    if (!dto.purchaseOrderId) throw new BadRequestException('Selecciona la compra a la que se aplica');
    const provider = await tx.provider.findUnique({ where: { id: dto.providerId } });
    if (!provider) throw new NotFoundException('Proveedor no encontrado');
    const order = await tx.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId } });
    if (!order || order.providerId !== provider.id) {
      throw new BadRequestException('La compra no existe o pertenece a otro proveedor');
    }
    if (order.status !== PurchaseOrderStatus.RECIBIDA) {
      throw new BadRequestException('Solo se aplican notas a compras recibidas');
    }
    return { order, provider };
  }

  private createProviderNote(
    tx: Tx,
    kind: NoteKind,
    dto: CreateNoteDto,
    providerId: number,
    purchaseOrderId: number,
    amount: number,
    actor: AuthUser,
  ) {
    return tx.accountNote.create({
      data: {
        side: AccountSide.PAGAR,
        kind,
        documentNumber: dto.documentNumber.trim(),
        detail: dto.detail.trim(),
        providerId,
        purchaseOrderId,
        amount,
        createdByUserId: actor.sub,
        createdByUsername: actor.username,
      },
    });
  }

  private async orderBalance(
    tx: Tx,
    order: { id: number; consecutive: string; total: Prisma.Decimal; payableTotal: Prisma.Decimal },
  ) {
    const paid = await purchaseMovementsPaid(tx, order.consecutive);
    const adjustments = await purchaseNoteAdjustments(tx, [order.id]);
    return Math.max(0, round(purchasePayable(order) - paid - (adjustments.get(order.id) ?? 0)));
  }

  private statusAfter(balance: number, paid: number, current: CreditStatus) {
    if (balance > EPS) return paid > 0 ? CreditStatus.PARCIAL : current === CreditStatus.CANCELADA ? CreditStatus.PENDIENTE : current;
    return paid > 0 ? CreditStatus.PAGADA : CreditStatus.CANCELADA;
  }

  private defaultDue() {
    const due = new Date();
    due.setDate(due.getDate() + 15);
    return due;
  }

  private async ensureFree(tx: Tx, side: AccountSide, kind: NoteKind, documentNumber: string) {
    const clash = await tx.accountNote.findFirst({
      where: { side, kind, documentNumber: documentNumber.trim() },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException(`El número de documento ${documentNumber.trim()} ya fue usado`);
    }
  }

  private audit(
    actor: AuthUser,
    action: string,
    note: { id: number; documentNumber: string; side: AccountSide; kind: NoteKind; amount: Prisma.Decimal },
    description: string,
  ) {
    return this.auditLogService.log({
      actor,
      module: 'NOTAS',
      action,
      entityType: 'AccountNote',
      entityId: note.id,
      entityLabel: note.documentNumber,
      description: `${description} ${note.documentNumber}`,
      metadata: { side: note.side, kind: note.kind, amount: Number(note.amount) },
    });
  }
}
