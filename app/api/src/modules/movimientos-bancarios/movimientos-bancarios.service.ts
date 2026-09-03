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
import { ListBankMovementsQueryDto } from './dto/list-bank-movements-query.dto';

@Injectable()
export class MovimientosBancariosService {
  private readonly gmfRate = new Prisma.Decimal('0.004');

  constructor(private readonly prisma: PrismaService) {}
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
  income(bankAccountId: number, dto: BankAmountDto) {
    return this.prisma.$transaction(async (tx) =>
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
  }
  expense(bankAccountId: number, dto: BankAmountDto) {
    return this.prisma.$transaction(async (tx) => {
      const amounts = this.buildMovementAmounts(
        BankMovementType.EGRESO,
        dto.amount,
        dto.appliesGmf,
      );
      await this.ensureBalance(tx, bankAccountId, Number(amounts.totalAmount));
      return this.createMovement(
        tx,
        bankAccountId,
        BankMovementType.EGRESO,
        dto.amount,
        dto.description,
        dto.invoiceId,
        dto.appliesGmf,
      );
    });
  }
  transfer(dto: BankTransferDto) {
    if (dto.fromBankAccountId === dto.toBankAccountId)
      throw new BadRequestException('Las cuentas deben ser diferentes');
    return this.prisma.$transaction(async (tx) => {
      const outgoing = this.buildMovementAmounts(
        BankMovementType.TRANSFERENCIA_SALIENTE,
        dto.amount,
        dto.appliesGmf,
      );
      await this.ensureBalance(
        tx,
        dto.fromBankAccountId,
        Number(outgoing.totalAmount),
      );
      await this.createMovement(
        tx,
        dto.fromBankAccountId,
        BankMovementType.TRANSFERENCIA_SALIENTE,
        dto.amount,
        dto.description,
        undefined,
        dto.appliesGmf,
      );
      return this.createMovement(
        tx,
        dto.toBankAccountId,
        BankMovementType.TRANSFERENCIA_ENTRANTE,
        dto.amount,
        dto.description,
        undefined,
        false,
      );
    });
  }
  adjustment(bankAccountId: number, dto: BankAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const account = await this.ensureActiveAccount(tx, bankAccountId);
      const difference = dto.balance - Number(account.currentBalance);
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { currentBalance: dto.balance },
      });
      return tx.bankAccountMovement.create({
        data: {
          bankAccountId,
          movementType: BankMovementType.AJUSTE,
          amount: Math.abs(difference),
          baseAmount: Math.abs(difference),
          totalAmount: Math.abs(difference),
          description: dto.description,
        },
        include: { bankAccount: true, invoice: true },
      });
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
  ) {
    await this.ensureActiveAccount(tx, bankAccountId);
    const normalized = this.buildMovementAmounts(
      movementType,
      amount,
      appliesGmf,
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
  ) {
    const baseAmount = new Prisma.Decimal(amount);
    const supportsGmf =
      movementType === BankMovementType.EGRESO ||
      movementType === BankMovementType.TRANSFERENCIA_SALIENTE;
    const shouldApplyGmf = Boolean(appliesGmf && supportsGmf);
    const gmfAmount = shouldApplyGmf
      ? baseAmount.mul(this.gmfRate).toDecimalPlaces(2)
      : new Prisma.Decimal(0);
    const totalAmount = baseAmount.plus(gmfAmount).toDecimalPlaces(2);

    return {
      appliesGmf: shouldApplyGmf,
      baseAmount,
      gmfRate: shouldApplyGmf ? this.gmfRate : new Prisma.Decimal(0),
      gmfAmount,
      totalAmount,
    };
  }
}
