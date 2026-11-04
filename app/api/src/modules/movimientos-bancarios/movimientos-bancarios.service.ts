import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BankMovementType, Prisma } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  BankAdjustmentDto,
  BankAmountDto,
  BankTransferDto,
} from '../cuentas-bancarias/dto/bank-account.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ListBankMovementsQueryDto } from './dto/list-bank-movements-query.dto';

@Injectable()
export class MovimientosBancariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}
  async findAll(query: ListBankMovementsQueryDto) {
    const where = {
      ...this.getTypeWhere(query.movementType),
      ...(query.appliesGmf === undefined
        ? {}
        : { appliesGmf: query.appliesGmf }),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.bankAccountMovement.count({ where }),
      this.prisma.bankAccountMovement.findMany({
        where,
        include: { bankAccount: true, invoice: true },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }
  async findOne(id: number) {
    const movement = await this.prisma.bankAccountMovement.findUnique({
      where: { id },
      include: { bankAccount: true, invoice: true },
    });
    if (!movement)
      throw new NotFoundException('Movimiento bancario no encontrado');
    return movement;
  }
  async income(bankAccountId: number, dto: BankAmountDto, actor?: AuthUser) {
    const movement = await this.prisma.$transaction(async (tx) =>
      this.createMovement(
        tx,
        bankAccountId,
        BankMovementType.INGRESO,
        dto.amount,
        dto.description,
        dto.invoiceId,
        dto.appliesGmf,
      ),
    );
    await this.audit(actor, 'INGRESO', movement);
    return movement;
  }
  async expense(bankAccountId: number, dto: BankAmountDto, actor?: AuthUser) {
    const movement = await this.prisma.$transaction(async (tx) => {
      const account = await this.ensureActiveAccount(tx, bankAccountId);
      // Cuenta con 4x1000 automático: el cargo se aplica salvo que se indique lo contrario.
      const appliesGmf = dto.appliesGmf ?? account.autoGmf;
      const amounts = this.buildMovementAmounts(
        BankMovementType.EGRESO,
        dto.amount,
        appliesGmf,
        account.gmfRate,
      );
      await this.ensureBalance(tx, bankAccountId, Number(amounts.totalAmount));
      return this.createMovement(
        tx,
        bankAccountId,
        BankMovementType.EGRESO,
        dto.amount,
        dto.description,
        dto.invoiceId,
        appliesGmf,
      );
    });
    await this.audit(actor, 'EGRESO', movement);
    return movement;
  }
  async transfer(dto: BankTransferDto, actor?: AuthUser) {
    if (dto.fromBankAccountId === dto.toBankAccountId)
      throw new BadRequestException('Las cuentas deben ser diferentes');
    const { outgoing, incoming } = await this.prisma.$transaction(async (tx) => {
      const originAccount = await this.ensureActiveAccount(tx, dto.fromBankAccountId);
      const appliesGmf = dto.appliesGmf ?? originAccount.autoGmf;
      const outgoingAmounts = this.buildMovementAmounts(
        BankMovementType.TRANSFERENCIA_SALIENTE,
        dto.amount,
        appliesGmf,
        originAccount.gmfRate,
      );
      await this.ensureBalance(
        tx,
        dto.fromBankAccountId,
        Number(outgoingAmounts.totalAmount),
      );
      const outgoing = await this.createMovement(
        tx,
        dto.fromBankAccountId,
        BankMovementType.TRANSFERENCIA_SALIENTE,
        dto.amount,
        dto.description,
        undefined,
        appliesGmf,
        originAccount.gmfRate,
      );
      const incoming = await this.createMovement(
        tx,
        dto.toBankAccountId,
        BankMovementType.TRANSFERENCIA_ENTRANTE,
        dto.amount,
        dto.description,
        undefined,
        false,
      );
      return { outgoing, incoming };
    });
    await this.audit(actor, 'TRANSFERENCIA', outgoing);
    return incoming;
  }
  async adjustment(bankAccountId: number, dto: BankAdjustmentDto, actor?: AuthUser) {
    const description = dto.description.trim();
    if (description.length < 3)
      throw new BadRequestException('El ajuste requiere un motivo de al menos 3 caracteres');
    const movement = await this.prisma.$transaction(async (tx) => {
      const account = await this.ensureActiveAccount(tx, bankAccountId);
      // El ajuste guarda la diferencia con signo: positiva sube el saldo, negativa lo baja.
      const difference =
        Math.round((dto.balance - Number(account.currentBalance)) * 100) / 100;
      if (difference === 0)
        throw new BadRequestException('El saldo ya tiene ese valor; no hay nada que ajustar');
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { currentBalance: dto.balance },
      });
      return tx.bankAccountMovement.create({
        data: {
          bankAccountId,
          movementType: BankMovementType.AJUSTE,
          amount: difference,
          baseAmount: difference,
          totalAmount: difference,
          description,
        },
        include: { bankAccount: true, invoice: true },
      });
    });
    await this.audit(actor, 'AJUSTE', movement);
    return movement;
  }
  private async audit(
    actor: AuthUser | undefined,
    action: string,
    movement: {
      id: number;
      bankAccountId: number;
      movementType: BankMovementType;
      totalAmount: Prisma.Decimal | number;
      description: string | null;
    },
  ) {
    await this.auditLog.log({
      actor,
      module: 'BANCOS',
      action,
      entityType: 'BankAccountMovement',
      entityId: movement.id,
      entityLabel: `MOV-${movement.id}`,
      description: movement.description ?? action,
      metadata: {
        bankAccountId: movement.bankAccountId,
        movementType: movement.movementType,
        total: Number(movement.totalAmount),
      },
    });
  }
  private async createMovement(
    tx: any,
    bankAccountId: number,
    movementType: BankMovementType,
    amount: number,
    description?: string,
    invoiceId?: number,
    appliesGmf?: boolean,
    accountGmfRate?: Prisma.Decimal | number,
  ) {
    const account = await this.ensureActiveAccount(tx, bankAccountId);
    const normalized = this.buildMovementAmounts(
      movementType,
      amount,
      appliesGmf,
      accountGmfRate ?? account.gmfRate,
    );
    const increment =
      movementType === BankMovementType.INGRESO ||
      movementType === BankMovementType.TRANSFERENCIA_ENTRANTE
        ? Number(normalized.totalAmount)
        : -Number(normalized.totalAmount);
    await tx.bankAccount.update({
      where: { id: bankAccountId },
      data: { currentBalance: { increment } },
    });
    return tx.bankAccountMovement.create({
      data: {
        bankAccountId,
        movementType,
        amount: normalized.baseAmount,
        baseAmount: normalized.baseAmount,
        gmfRate: normalized.gmfRate,
        gmfAmount: normalized.gmfAmount,
        totalAmount: normalized.totalAmount,
        appliesGmf: normalized.appliesGmf,
        description,
        invoiceId,
      },
      include: { bankAccount: true, invoice: true },
    });
  }
  private async ensureBalance(tx: any, bankAccountId: number, amount: number) {
    const account = await this.ensureActiveAccount(tx, bankAccountId);
    if (Number(account.currentBalance) < amount)
      throw new BadRequestException('Saldo insuficiente');
  }
  private async ensureActiveAccount(tx: any, id: number) {
    const account = await tx.bankAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta bancaria no encontrada');
    if (!account.isActive)
      throw new BadRequestException('La cuenta bancaria está inactiva');
    return account;
  }

  private getTypeWhere(
    movementType?: ListBankMovementsQueryDto['movementType'],
  ) {
    if (!movementType) return undefined;
    return { movementType };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        {
          bankAccount: { name: { contains: q, mode: 'insensitive' as const } },
        },
        { description: { contains: q, mode: 'insensitive' as const } },
        {
          invoice: {
            consecutive: { contains: q, mode: 'insensitive' as const },
          },
        },
      ],
    };
  }

  private buildMovementAmounts(
    movementType: BankMovementType,
    amount: number,
    appliesGmf?: boolean,
    accountGmfRate?: Prisma.Decimal | number,
  ) {
    const baseAmount = new Prisma.Decimal(amount);
    const supportsGmf =
      movementType === BankMovementType.EGRESO ||
      movementType === BankMovementType.TRANSFERENCIA_SALIENTE;
    const shouldApplyGmf = Boolean(appliesGmf && supportsGmf);
    const gmfRate = accountGmfRate == null
      ? new Prisma.Decimal('0.4').div(100)
      : new Prisma.Decimal(accountGmfRate).div(100);
    const gmfAmount = shouldApplyGmf
      ? baseAmount.mul(gmfRate).toDecimalPlaces(2)
      : new Prisma.Decimal(0);
    const totalAmount = baseAmount.plus(gmfAmount).toDecimalPlaces(2);

    return {
      appliesGmf: shouldApplyGmf,
      baseAmount,
      gmfRate: shouldApplyGmf ? gmfRate : new Prisma.Decimal(0),
      gmfAmount,
      totalAmount,
    };
  }
}
