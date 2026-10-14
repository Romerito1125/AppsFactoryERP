import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function assertClientCreditCapacity(
  tx: Prisma.TransactionClient,
  clientId: number,
  amount: number,
) {
  await tx.$queryRaw`SELECT "id" FROM "Client" WHERE "id" = ${clientId} FOR UPDATE`;

  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: { hasCredit: true, maxCredit: true },
  });
  if (!client) throw new NotFoundException('Cliente no encontrado');
  if (!client.hasCredit) {
    throw new BadRequestException('El cliente no tiene crédito habilitado');
  }

  const limit = Number(client.maxCredit);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new BadRequestException('El cliente no tiene un límite de crédito válido');
  }

  const openCredits = await tx.invoiceCredit.aggregate({
    where: { clientId, balance: { gt: 0 } },
    _sum: { balance: true },
  });
  const outstanding = Number(openCredits._sum.balance ?? 0);
  const available = Math.max(0, limit - outstanding);
  if (amount > available + 0.000001) {
    throw new BadRequestException(
      `El crédito supera el cupo disponible. Límite: ${limit.toFixed(2)}, saldo pendiente: ${outstanding.toFixed(2)}, disponible: ${available.toFixed(2)}.`,
    );
  }

  return { limit, outstanding, available };
}
