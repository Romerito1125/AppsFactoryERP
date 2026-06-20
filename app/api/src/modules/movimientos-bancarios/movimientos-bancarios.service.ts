import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BankMovementType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  BankAdjustmentDto,
  BankAmountDto,
  BankTransferDto,
} from '../cuentas-bancarias/dto/bank-account.dto';

@Injectable()
export class MovimientosBancariosService {
  constructor(private readonly prisma: PrismaService) {}
  findAll() {
    return this.prisma.bankAccountMovement.findMany({
      include: { bankAccount: true, invoice: true },
      orderBy: { id: 'desc' },
    });
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
      ),
    );
  }
  expense(bankAccountId: number, dto: BankAmountDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureBalance(tx, bankAccountId, dto.amount);
      return this.createMovement(
        tx,
        bankAccountId,
        BankMovementType.EGRESO,
        dto.amount,
        dto.description,
        dto.invoiceId,
      );
    });
  }
  transfer(dto: BankTransferDto) {
    if (dto.fromBankAccountId === dto.toBankAccountId)
      throw new BadRequestException('Las cuentas deben ser diferentes');
    return this.prisma.$transaction(async (tx) => {
      await this.ensureBalance(tx, dto.fromBankAccountId, dto.amount);
      await this.createMovement(
        tx,
        dto.fromBankAccountId,
        BankMovementType.TRANSFERENCIA_SALIENTE,
        dto.amount,
        dto.description,
      );
      return this.createMovement(
        tx,
        dto.toBankAccountId,
        BankMovementType.TRANSFERENCIA_ENTRANTE,
        dto.amount,
        dto.description,
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
  ) {
    await this.ensureActiveAccount(tx, bankAccountId);
    const increment =
      movementType === BankMovementType.INGRESO ||
      movementType === BankMovementType.TRANSFERENCIA_ENTRANTE
        ? amount
        : -amount;
    await tx.bankAccount.update({
      where: { id: bankAccountId },
      data: { currentBalance: { increment } },
    });
    return tx.bankAccountMovement.create({
      data: { bankAccountId, movementType, amount, description, invoiceId },
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
}
