import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdvanceSource, AdvanceStatus, CreditStatus } from '@prisma/client';
import {
  nextConsecutive,
  postBankMovement,
} from '../../common/utils/bank-ledger.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  ApplyAdvanceDto,
  CreateAdvanceDto,
  ListAdvancesQueryDto,
  RefundAdvanceDto,
} from './dto/advance.dto';

const round = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class AnticiposService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  findAll(query: ListAdvancesQueryDto) {
    return this.prisma.clientAdvance.findMany({
      where: {
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { client: true },
      orderBy: { id: 'desc' },
      take: 500,
    });
  }

  async create(dto: CreateAdvanceDto, actor: AuthUser) {
    const amount = round(dto.amount);
    const advance = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: dto.clientId } });
      if (!client || !client.isActive) {
        throw new BadRequestException('El cliente no existe o está inactivo');
      }
      const consecutive = nextConsecutive('ANT');
      const movement = await postBankMovement(tx, {
        bankAccountId: dto.bankAccountId,
        type: 'INGRESO',
        amount,
        description: `Anticipo ${consecutive} · cliente ${client.identification}`,
      });
      return tx.clientAdvance.create({
        data: {
          consecutive,
          clientId: client.id,
          amount,
          balance: amount,
          source: AdvanceSource.ANTICIPO,
          bankMovementId: movement.id,
          notes: dto.notes?.trim() || undefined,
          createdByUserId: actor.sub,
        },
        include: { client: true },
      });
    });
    await this.auditLogService.log({
      actor,
      module: 'ANTICIPOS',
      action: 'CREATE',
      entityType: 'ClientAdvance',
      entityId: advance.id,
      entityLabel: advance.consecutive,
      description: `Registro el anticipo ${advance.consecutive} por ${amount}`,
    });
    return advance;
  }

  /** Aplica el saldo a favor a un crédito del mismo cliente, sin tocar el banco. */
  async applyToCredit(id: number, dto: ApplyAdvanceDto, actor: AuthUser) {
    const amount = round(dto.amount);
    const result = await this.prisma.$transaction(async (tx) => {
      const advance = await tx.clientAdvance.findUnique({ where: { id } });
      if (!advance) throw new NotFoundException('Anticipo no encontrado');
      if (advance.status !== AdvanceStatus.DISPONIBLE) {
        throw new BadRequestException('El anticipo ya no tiene saldo disponible');
      }
      const credit = await tx.invoiceCredit.findUnique({
        where: { id: dto.creditId },
      });
      if (!credit || credit.clientId !== advance.clientId) {
        throw new BadRequestException(
          'El crédito no existe o pertenece a otro cliente',
        );
      }
      const advanceBalance = Number(advance.balance);
      const creditBalance = Number(credit.balance);
      if (creditBalance <= 0) {
        throw new BadRequestException('El crédito no tiene saldo pendiente');
      }
      if (amount > advanceBalance + 0.009) {
        throw new BadRequestException(
          `El anticipo solo tiene ${advanceBalance.toFixed(2)} disponibles`,
        );
      }
      if (amount > creditBalance + 0.009) {
        throw new BadRequestException(
          'El monto no puede superar el saldo pendiente del crédito',
        );
      }
      const receiptNumber = nextConsecutive('RC');
      await tx.creditPayment.create({
        data: {
          invoiceCreditId: credit.id,
          amount,
          notes: `Aplicación del anticipo ${advance.consecutive}`,
          receiptNumber,
          advanceId: advance.id,
          createdByUserId: actor.sub,
        },
      });
      const nextCredit = Math.max(0, round(creditBalance - amount));
      await tx.invoiceCredit.update({
        where: { id: credit.id },
        data: {
          paidAmount: { increment: amount },
          balance: nextCredit,
          status: nextCredit === 0 ? CreditStatus.PAGADA : CreditStatus.PARCIAL,
        },
      });
      const nextAdvance = Math.max(0, round(advanceBalance - amount));
      return tx.clientAdvance.update({
        where: { id: advance.id },
        data: {
          appliedAmount: { increment: amount },
          balance: nextAdvance,
          status:
            nextAdvance === 0 ? AdvanceStatus.APLICADO : AdvanceStatus.DISPONIBLE,
        },
        include: { client: true },
      });
    });
    await this.auditLogService.log({
      actor,
      module: 'ANTICIPOS',
      action: 'APPLY',
      entityType: 'ClientAdvance',
      entityId: result.id,
      entityLabel: result.consecutive,
      description: `Aplico ${amount} del anticipo ${result.consecutive} al crédito ${dto.creditId}`,
    });
    return result;
  }

  /** Devuelve el saldo a favor en dinero (egreso de la cuenta elegida). */
  async refund(id: number, dto: RefundAdvanceDto, actor: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const advance = await tx.clientAdvance.findUnique({ where: { id } });
      if (!advance) throw new NotFoundException('Anticipo no encontrado');
      if (advance.status !== AdvanceStatus.DISPONIBLE) {
        throw new BadRequestException('El anticipo ya no tiene saldo disponible');
      }
      const balance = Number(advance.balance);
      await postBankMovement(tx, {
        bankAccountId: dto.bankAccountId,
        type: 'EGRESO',
        amount: balance,
        description: `Devolución de saldo a favor ${advance.consecutive}`,
      });
      return tx.clientAdvance.update({
        where: { id: advance.id },
        data: {
          balance: 0,
          status: AdvanceStatus.DEVUELTO,
          notes: dto.notes?.trim()
            ? `${advance.notes ?? ''} | Devolución: ${dto.notes.trim()}`.trim()
            : advance.notes,
        },
        include: { client: true },
      });
    });
    await this.auditLogService.log({
      actor,
      module: 'ANTICIPOS',
      action: 'REFUND',
      entityType: 'ClientAdvance',
      entityId: result.id,
      entityLabel: result.consecutive,
      description: `Devolvio en dinero el saldo a favor ${result.consecutive}`,
    });
    return result;
  }

  /** Anula un anticipo que aún no se ha usado: el dinero sale de la misma cuenta que lo recibió. */
  async voidAdvance(id: number, reason: string, actor: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const advance = await tx.clientAdvance.findUnique({ where: { id } });
      if (!advance) throw new NotFoundException('Anticipo no encontrado');
      if (advance.status !== AdvanceStatus.DISPONIBLE || Number(advance.appliedAmount) > 0) {
        throw new BadRequestException(
          'Solo se anula un anticipo sin usar; si ya se aplicó, anula primero esas aplicaciones',
        );
      }
      const movement = advance.bankMovementId
        ? await tx.bankAccountMovement.findUnique({ where: { id: advance.bankMovementId } })
        : null;
      if (!movement) {
        throw new BadRequestException(
          'Este saldo a favor no vino de un ingreso bancario (es una devolución): usa «Devolver»',
        );
      }
      await postBankMovement(tx, {
        bankAccountId: movement.bankAccountId,
        type: 'EGRESO',
        amount: Number(advance.balance),
        description: `Anulación del anticipo ${advance.consecutive}`,
      });
      return tx.clientAdvance.update({
        where: { id },
        data: {
          balance: 0,
          status: AdvanceStatus.DEVUELTO,
          notes: `${advance.notes ?? ''} | Anulado: ${reason.trim()}`.trim(),
        },
        include: { client: true },
      });
    });
    await this.auditLogService.log({
      actor,
      module: 'ANTICIPOS',
      action: 'VOID',
      entityType: 'ClientAdvance',
      entityId: result.id,
      entityLabel: result.consecutive,
      description: `Anulo el anticipo ${result.consecutive}: ${reason}`,
    });
    return result;
  }
}
