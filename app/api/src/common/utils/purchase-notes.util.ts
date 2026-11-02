import { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Efecto neto de las notas de proveedor sobre lo que ya está «cubierto» de cada
 * compra: las notas de débito bajan lo que se debe (suman como pagado) y las de
 * crédito lo suben (restan). Solo cuentan las notas vigentes.
 */
export async function purchaseNoteAdjustments(db: Db, orderIds: number[]) {
  const result = new Map<number, number>();
  if (!orderIds.length) return result;
  const rows = await db.accountNote.groupBy({
    by: ['purchaseOrderId', 'kind'],
    where: {
      side: 'PAGAR',
      status: 'VIGENTE',
      kind: { in: ['DEBITO', 'CREDITO'] },
      purchaseOrderId: { in: orderIds },
    },
    _sum: { amount: true },
  });
  for (const row of rows) {
    if (row.purchaseOrderId == null) continue;
    const amount = Number(row._sum.amount ?? 0);
    const signed = row.kind === 'DEBITO' ? amount : -amount;
    result.set(row.purchaseOrderId, (result.get(row.purchaseOrderId) ?? 0) + signed);
  }
  return result;
}

/** Egresos de banco registrados contra una compra (convención «Pago compra X»). */
export async function purchaseMovementsPaid(db: Db, consecutive: string) {
  const movements = await db.bankAccountMovement.findMany({
    where: {
      movementType: 'EGRESO',
      description: { startsWith: `Pago compra ${consecutive}` },
    },
    select: { amount: true, description: true },
  });
  return movements
    .filter((movement) => {
      const description = movement.description ?? '';
      return (
        description === `Pago compra ${consecutive}` ||
        description.startsWith(`Pago compra ${consecutive} - `)
      );
    })
    .reduce((sum, movement) => sum + Number(movement.amount), 0);
}

export function purchasePayable(order: {
  total: Prisma.Decimal | number;
  payableTotal?: Prisma.Decimal | number | null;
}) {
  const total = Number(order.total ?? 0);
  const payable = Number(order.payableTotal ?? 0);
  return payable > 0 || total === 0 ? payable : total;
}
