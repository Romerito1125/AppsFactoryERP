import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BankMovementType, Prisma } from '@prisma/client';

type PostBankMovementInput = {
  bankAccountId: number;
  type: 'INGRESO' | 'EGRESO';
  amount: number;
  description?: string;
  invoiceId?: number;
};

/**
 * Registra un ingreso o egreso simple (sin GMF) dentro de una transacción
 * existente. Se usa para que factura, anticipos y devoluciones afecten el banco
 * de forma atómica con el documento que los origina.
 */
export async function postBankMovement(
  tx: Prisma.TransactionClient,
  input: PostBankMovementInput,
) {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BadRequestException('El monto del movimiento debe ser mayor a cero');
  }
  const account = await tx.bankAccount.findUnique({
    where: { id: input.bankAccountId },
  });
  if (!account) throw new NotFoundException('Cuenta bancaria no encontrada');
  if (!account.isActive) {
    throw new BadRequestException('La cuenta bancaria está inactiva');
  }
  const isIncome = input.type === 'INGRESO';
  // 4x1000 automático: cargo aparte (gasto identificable) sobre toda salida de la cuenta.
  const gmfAmount =
    !isIncome && account.autoGmf
      ? Math.round(amount * (Number(account.gmfRate) / 100) * 100) / 100
      : 0;
  if (!isIncome && Number(account.currentBalance) < amount + gmfAmount) {
    throw new BadRequestException(
      `Saldo insuficiente en ${account.name} para ${amount.toFixed(2)}${gmfAmount ? ` + 4x1000 ${gmfAmount.toFixed(2)}` : ''}`,
    );
  }
  await tx.bankAccount.update({
    where: { id: input.bankAccountId },
    data: { currentBalance: { increment: isIncome ? amount : -(amount + gmfAmount) } },
  });
  if (gmfAmount > 0) {
    await tx.bankAccountMovement.create({
      data: {
        bankAccountId: input.bankAccountId,
        movementType: BankMovementType.EGRESO,
        amount: gmfAmount,
        baseAmount: amount,
        gmfRate: account.gmfRate,
        gmfAmount,
        totalAmount: gmfAmount,
        appliesGmf: true,
        description: `GMF 4x1000 · ${input.description ?? 'egreso'}`,
        invoiceId: input.invoiceId,
      },
    });
  }
  return tx.bankAccountMovement.create({
    data: {
      bankAccountId: input.bankAccountId,
      movementType: isIncome ? BankMovementType.INGRESO : BankMovementType.EGRESO,
      amount,
      baseAmount: amount,
      totalAmount: amount,
      description: input.description,
      invoiceId: input.invoiceId,
    },
  });
}

export function nextConsecutive(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
