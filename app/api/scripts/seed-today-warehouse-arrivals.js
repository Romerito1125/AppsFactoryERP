require('dotenv').config();

const { PrismaClient, Prisma, PurchaseOrderStatus } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function todayAt(hour, minute) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function main() {
  const [warehouses, provider, products] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, take: 2 }),
    prisma.provider.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      include: { prices: { where: { isActive: true, isDefault: true }, take: 1 }, costs: { where: { isActive: true }, orderBy: { id: 'desc' }, take: 1 } },
      orderBy: { id: 'asc' },
      take: 2,
    }),
  ]);

  if (warehouses.length < 2 || !provider || products.length < 2) {
    throw new Error('No hay suficientes bodegas, proveedores o productos activos para crear las llegadas de ejemplo');
  }

  const orderedAt = todayAt(8, 0);
  const expectedAt = todayAt(14, 0);
  const rows = [];

  for (let index = 0; index < 2; index += 1) {
    const warehouse = warehouses[index];
    const consecutive = `OC-DEMO-LLEGADA-HOY-${warehouse.id}`;
    const items = products.map((product, productIndex) => {
      const unitCost = Number(product.costs[0]?.cost ?? product.prices[0]?.price ?? 1000);
      const quantity = productIndex === 0 ? 12 : 8;
      const taxRate = Number(product.taxRate ?? 0);
      const subtotal = new Prisma.Decimal(unitCost).mul(quantity).toDecimalPlaces(2);
      const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(2);
      const total = subtotal.plus(taxAmount).toDecimalPlaces(2);

      return {
        productId: product.id,
        quantity,
        receivedQuantity: 0,
        unit: product.unit,
        unitCost: new Prisma.Decimal(unitCost),
        taxRate: new Prisma.Decimal(taxRate),
        subtotal,
        taxAmount,
        total,
      };
    });
    const subtotal = items.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
    const taxes = items.reduce((sum, item) => sum.plus(item.taxAmount), new Prisma.Decimal(0));
    const total = items.reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0));

    await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findUnique({ where: { consecutive } });
      if (existing) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: existing.id } });
        await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: {
            providerId: provider.id,
            warehouseId: warehouse.id,
            orderedAt,
            expectedAt,
            receivedAt: null,
            status: PurchaseOrderStatus.ORDENADA,
            notes: 'Llegada de demostración programada para hoy. Solo consulta para el usuario de bodega.',
            subtotal,
            taxes,
            total,
            items: { create: items },
          },
        });
      } else {
        await tx.purchaseOrder.create({
          data: {
            consecutive,
            providerId: provider.id,
            warehouseId: warehouse.id,
            orderedAt,
            expectedAt,
            status: PurchaseOrderStatus.ORDENADA,
            notes: 'Llegada de demostración programada para hoy. Solo consulta para el usuario de bodega.',
            subtotal,
            taxes,
            total,
            items: { create: items },
          },
        });
      }
    });

    rows.push({ consecutive, warehouseId: warehouse.id, expectedAt });
  }

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
