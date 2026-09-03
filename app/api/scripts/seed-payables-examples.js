require('dotenv').config();

const { Prisma, PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TAX_RATE = new Prisma.Decimal(19);

const examples = [
  {
    consecutive: 'CXP-DEM-2026-001',
    providerIndex: 0,
    status: 'RECIBIDA',
    orderedAt: '2026-07-10T12:00:00Z',
    expectedAt: '2026-07-15T12:00:00Z',
    receivedAt: '2026-07-14T12:00:00Z',
    quantity: 12,
    unitCost: 12000,
  },
  {
    consecutive: 'CXP-DEM-2026-002',
    providerIndex: 0,
    status: 'ORDENADA',
    orderedAt: '2026-08-20T12:00:00Z',
    expectedAt: '2026-08-28T12:00:00Z',
    quantity: 8,
    unitCost: 9800,
  },
  {
    consecutive: 'CXP-DEM-2026-003',
    providerIndex: 0,
    status: 'BORRADOR',
    orderedAt: '2026-09-01T12:00:00Z',
    expectedAt: '2026-09-08T12:00:00Z',
    quantity: 15,
    unitCost: 11000,
  },
  {
    consecutive: 'CXP-DEM-2026-004',
    providerIndex: 1,
    status: 'RECIBIDA',
    orderedAt: '2026-06-15T12:00:00Z',
    expectedAt: '2026-06-20T12:00:00Z',
    receivedAt: '2026-06-19T12:00:00Z',
    quantity: 10,
    unitCost: 6500,
  },
  {
    consecutive: 'CXP-DEM-2026-005',
    providerIndex: 1,
    status: 'ORDENADA',
    orderedAt: '2026-08-25T12:00:00Z',
    expectedAt: '2026-09-12T12:00:00Z',
    quantity: 20,
    unitCost: 7000,
  },
];

async function findContext() {
  const [providers, warehouse] = await Promise.all([
    prisma.provider.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: 2,
    }),
    prisma.warehouse.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  if (providers.length < 2 || !warehouse) {
    throw new Error(
      'Se requieren dos proveedores y una bodega activa para cargar ejemplos de CxP',
    );
  }

  const products = await Promise.all(
    providers.map((provider) =>
      prisma.product.findFirst({
        where: { providerId: provider.id, isActive: true, deletedAt: null },
        include: {
          costs: {
            where: { isActive: true },
            orderBy: { id: 'desc' },
            take: 1,
          },
          prices: {
            where: { isActive: true },
            orderBy: { id: 'asc' },
            take: 1,
          },
        },
        orderBy: { id: 'asc' },
      }),
    ),
  );

  if (products.some((product) => !product)) {
    throw new Error(
      'Cada proveedor debe tener al menos un producto activo para cargar ejemplos de CxP',
    );
  }

  return { providers, warehouse, products };
}

async function ensurePurchase(example, context) {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { consecutive: example.consecutive },
  });
  if (existing)
    return {
      consecutive: example.consecutive,
      created: false,
      status: existing.status,
    };

  const provider = context.providers[example.providerIndex];
  const product = context.products[example.providerIndex];
  const subtotal = new Prisma.Decimal(example.quantity)
    .mul(example.unitCost)
    .toDecimalPlaces(2);
  const taxAmount = subtotal.mul(TAX_RATE).div(100).toDecimalPlaces(2);
  const total = subtotal.plus(taxAmount).toDecimalPlaces(2);
  const orderedAt = new Date(example.orderedAt);
  const expectedAt = example.expectedAt ? new Date(example.expectedAt) : null;
  const receivedAt = example.receivedAt ? new Date(example.receivedAt) : null;

  await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchaseOrder.create({
      data: {
        consecutive: example.consecutive,
        providerId: provider.id,
        warehouseId: context.warehouse.id,
        externalReference: `FACT-${example.consecutive}`,
        notes: 'Registro de ejemplo para revisar Cuentas por pagar',
        orderedAt,
        expectedAt,
        receivedAt,
        status: example.status,
        subtotal,
        taxes: taxAmount,
        total,
        items: {
          create: {
            productId: product.id,
            quantity: example.quantity,
            receivedQuantity:
              example.status === 'RECIBIDA' ? example.quantity : 0,
            unit: product.unit,
            unitCost: new Prisma.Decimal(example.unitCost),
            taxRate: TAX_RATE,
            subtotal,
            taxAmount,
            total,
          },
        },
      },
      include: { items: true },
    });

    if (example.status === 'RECIBIDA') {
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: context.warehouse.id,
          },
        },
        update: { quantity: { increment: example.quantity } },
        create: {
          productId: product.id,
          warehouseId: context.warehouse.id,
          quantity: example.quantity,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          toWarehouseId: context.warehouse.id,
          quantity: example.quantity,
          movementType: 'ENTRADA',
          reason: `Ejemplo ${example.consecutive}`,
          purchaseOrderItemId: purchase.items[0].id,
          createdAt: receivedAt,
        },
      });
    }
  });

  return {
    consecutive: example.consecutive,
    created: true,
    status: example.status,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria');
  const context = await findContext();
  const results = [];
  for (const example of examples)
    results.push(await ensurePurchase(example, context));
  console.table(results);
  console.log(
    'Ejemplos de Cuentas por pagar cargados sin crear productos nuevos.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
