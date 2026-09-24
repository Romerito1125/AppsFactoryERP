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
  const consecutive = 'COT-PROV-DEMO-002';
  const existing = await prisma.purchaseOrder.findUnique({
    where: { consecutive },
    include: { provider: true, warehouse: true, items: true },
  });

  if (existing) {
    console.log(JSON.stringify({
      reused: true,
      id: existing.id,
      consecutive: existing.consecutive,
      status: existing.status,
      provider: existing.provider.name,
      warehouse: existing.warehouse.location,
    }, null, 2));
    return;
  }

  const [provider, warehouse, products] = await Promise.all([
    prisma.provider.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } }),
    prisma.warehouse.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      include: {
        prices: { where: { isActive: true, isDefault: true }, take: 1 },
        costs: { where: { isActive: true }, orderBy: { id: 'desc' }, take: 1 },
      },
      orderBy: { id: 'asc' },
      take: 2,
    }),
  ]);

  if (!provider || !warehouse || products.length < 2) {
    throw new Error('No hay proveedor, bodega o productos activos suficientes para crear el ejemplo.');
  }

  const quantities = [6, 4];
  const items = products.map((product, index) => {
    const unitCost = Number(product.costs[0]?.cost ?? product.prices[0]?.price ?? 1000);
    const quantity = quantities[index];
    const taxRate = Number(product.taxRate ?? 0);
    const subtotal = new Prisma.Decimal(unitCost).mul(quantity).toDecimalPlaces(2);
    const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(2);

    return {
      productId: product.id,
      quantity,
      receivedQuantity: 0,
      unit: product.unit,
      unitCost: new Prisma.Decimal(unitCost),
      taxRate: new Prisma.Decimal(taxRate),
      subtotal,
      taxAmount,
      total: subtotal.plus(taxAmount).toDecimalPlaces(2),
    };
  });
  const subtotal = items.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
  const taxes = items.reduce((sum, item) => sum.plus(item.taxAmount), new Prisma.Decimal(0));

  const created = await prisma.purchaseOrder.create({
    data: {
      consecutive,
      providerId: provider.id,
      warehouseId: warehouse.id,
      status: PurchaseOrderStatus.ORDENADA,
      externalReference: 'COT-PROV-2026-002',
      orderedAt: todayAt(9, 15),
      expectedAt: todayAt(16, 0),
      notes: 'Ejemplo de cotización del proveedor para revisar antes de recibir en bodega.',
      subtotal,
      taxes,
      total: subtotal.plus(taxes).toDecimalPlaces(2),
      items: { create: items },
    },
    include: { provider: true, warehouse: true, items: { include: { product: true } } },
  });

  console.log(JSON.stringify({
    created: true,
    id: created.id,
    consecutive: created.consecutive,
    provider: created.provider.name,
    warehouse: created.warehouse.location,
    items: created.items.map((item) => ({
      product: item.product.name,
      quantity: item.quantity,
      unitCost: item.unitCost,
    })),
    total: created.total,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
