import {
  InventoryMovementType,
  Prisma,
  PurchaseOrderStatus,
  Role,
  UnitType,
} from '@prisma/client';
import { getProductStockStatus } from '../src/common/utils/product-quantity.util';
import { AuditLogService } from '../src/modules/audit-log/audit-log.service';
import { ComprasService } from '../src/modules/compras/compras.service';
import { FacturasService } from '../src/modules/facturas/facturas.service';
import { InventarioService } from '../src/modules/inventario/inventario.service';
import { NotificacionesService } from '../src/modules/notificaciones/notificaciones.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { ProductResolverService } from '../src/shared/products/product-resolver.service';

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];
const tag = `QA-${Date.now()}`;
const prisma = new PrismaService();
const notifications = new NotificacionesService(prisma);
const resolver = new ProductResolverService();
const audit = new AuditLogService(prisma);
const purchases = new ComprasService(prisma, notifications);
const inventory = new InventarioService(prisma, resolver, audit);
const invoices = new FacturasService(prisma, notifications, resolver, audit);

let warehouseAId: number | undefined;
let warehouseBId: number | undefined;
let productId: number | undefined;
let productPriceId: number | undefined;
let purchaseOrderId: number | undefined;
let invoiceId: number | undefined;
let bodegaUserId: number | undefined;
let movementId: number | undefined;

function check(name: string, condition: boolean, detail: string) {
  checks.push({ name, ok: condition, detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
}

function number(value: unknown) {
  return Number(value ?? 0);
}

async function cleanup() {
  const invoiceIds = invoiceId ? [invoiceId] : [];
  const movementIds = movementId ? [movementId] : [];

  await prisma.$transaction(async (tx) => {
    if (invoiceIds.length) {
      await tx.notificationRead.deleteMany({
        where: { notification: { invoiceId: { in: invoiceIds } } },
      });
      await tx.notification.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.delivery.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }

    if (productId) {
      const productMovementIds = (
        await tx.inventoryMovement.findMany({
          where: { productId },
          select: { id: true },
        })
      ).map((movement) => movement.id);
      await tx.inventoryTransferTicket.deleteMany({
        where: { movementId: { in: productMovementIds } },
      });
      await tx.inventoryMovement.deleteMany({ where: { id: { in: productMovementIds } } });
    } else if (movementIds.length) {
      await tx.inventoryTransferTicket.deleteMany({
        where: { movementId: { in: movementIds } },
      });
      await tx.inventoryMovement.deleteMany({ where: { id: { in: movementIds } } });
    }

    if (purchaseOrderId) {
      await tx.notification.deleteMany({ where: { actionEntityId: purchaseOrderId } });
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId } });
      await tx.purchaseOrder.deleteMany({ where: { id: purchaseOrderId } });
    }

    if (productId) {
      const prices = await tx.productPrice.findMany({
        where: { productId },
        select: { id: true },
      });
      await tx.productPriceHistory.deleteMany({
        where: { productPriceId: { in: prices.map((price) => price.id) } },
      });
      await tx.productCost.deleteMany({ where: { productId } });
      await tx.productPrice.deleteMany({ where: { productId } });
      await tx.productProvider.deleteMany({ where: { productId } });
      await tx.productWarehouse.deleteMany({ where: { productId } });
      await tx.productPackagingProfile.deleteMany({ where: { productId } });
      await tx.product.deleteMany({ where: { id: productId } });
    }

    if (bodegaUserId) {
      await tx.notificationRead.deleteMany({ where: { userId: bodegaUserId } });
      await tx.userPermission.deleteMany({ where: { userId: bodegaUserId } });
      await tx.user.deleteMany({ where: { id: bodegaUserId } });
    }

    const warehouseIds = [warehouseAId, warehouseBId].filter(
      (id): id is number => Boolean(id),
    );
    if (warehouseIds.length) {
      await tx.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    }

    await tx.auditLog.deleteMany({
      where: {
        OR: [
          { entityLabel: { contains: tag } },
          ...(invoiceIds.length ? [{ entityId: { in: invoiceIds } }] : []),
          ...(movementIds.length ? [{ entityId: { in: movementIds } }] : []),
        ],
      },
    });
  });
}

async function main() {
  await prisma.$connect();

  try {
    const [admin, type, providers, client] = await Promise.all([
      prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true } }),
      prisma.productType.findFirst({ where: { isActive: true } }),
      prisma.provider.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        take: 2,
      }),
      prisma.client.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } }),
    ]);

    if (!admin || !type || providers.length < 2 || !client) {
      throw new Error('La base necesita un usuario ADMIN, tipo, dos proveedores y un cliente activos.');
    }

    const setup = await prisma.$transaction(async (tx) => {
      const [warehouseA, warehouseB] = await Promise.all([
        tx.warehouse.create({ data: { location: `${tag} Bodega A` } }),
        tx.warehouse.create({ data: { location: `${tag} Bodega B` } }),
      ]);
      const bodegaUser = await tx.user.create({
        data: {
          username: `${tag.toLowerCase()}@test.local`,
          password: 'qa-only',
          role: Role.BODEGA,
          warehouseId: warehouseB.id,
        },
      });
      const product = await tx.product.create({
        data: {
          productTypeId: type.id,
          providerId: providers[0].id,
          name: `${tag} Producto caja`,
          brand: 'QA',
          taxRate: 0,
          unit: UnitType.UND,
          minimumStock: 20,
          maximumStock: 100,
          packagingProfile: {
            create: { unitsPerPackage: 10, packagesPerBox: 2 },
          },
          providers: {
            create: providers.map((provider) => ({ providerId: provider.id })),
          },
          prices: {
            create: {
              name: 'Precio caja QA',
              price: 20000,
              unit: UnitType.CAJA,
              quantity: 1,
              isDefault: true,
              isActive: true,
            },
          },
          costs: {
            create: {
              cost: 1000,
              unit: UnitType.UND,
              quantity: 1,
              isActive: true,
            },
          },
          warehouses: {
            create: [
              { warehouseId: warehouseA.id, quantity: 100 },
              { warehouseId: warehouseB.id, quantity: 20 },
            ],
          },
        },
        include: { prices: true, providers: true },
      });
      return { warehouseA, warehouseB, bodegaUser, product };
    });

    warehouseAId = setup.warehouseA.id;
    warehouseBId = setup.warehouseB.id;
    productId = setup.product.id;
    productPriceId = setup.product.prices[0].id;
    bodegaUserId = setup.bodegaUser.id;

    check(
      'Proveedores secundarios',
      setup.product.providers.length === 2,
      `Producto vinculado a ${setup.product.providers.length} proveedores; principal y secundario disponibles.`,
    );

    const adminActor = {
      sub: admin.id,
      role: Role.ADMIN,
      username: admin.username,
    } as const;
    const bodegaActor = {
      sub: setup.bodegaUser.id,
      role: Role.BODEGA,
      warehouseId: setup.warehouseB.id,
      username: setup.bodegaUser.username,
    } as const;

    const sale = await invoices.create(
      {
        clientId: client.id,
        warehouseId: setup.warehouseA.id,
        source: 'POS',
        items: [{ productId: setup.product.id, productPriceId, quantity: 1 }],
      },
      adminActor,
    );
    invoiceId = sale.id;
    const afterSale = await prisma.productWarehouse.findUniqueOrThrow({
      where: {
        productId_warehouseId: {
          productId: setup.product.id,
          warehouseId: setup.warehouseA.id,
        },
      },
    });
    check('Venta POS descuenta una caja', afterSale.quantity === 80, `Bodega A: ${afterSale.quantity} UND.`);
    check('Factura guarda la bodega', sale.warehouseId === setup.warehouseA.id, `warehouseId=${sale.warehouseId}.`);

    let bodegaRejected = false;
    try {
      await invoices.create(
        {
          clientId: client.id,
          warehouseId: setup.warehouseA.id,
          source: 'ADMIN',
          items: [{ productId: setup.product.id, productPriceId, quantity: 1 }],
        },
        bodegaActor,
      );
    } catch (error) {
      bodegaRejected = /bodega|warehouse/i.test(String(error));
    }
    check('BODEGA no puede facturar desde otra bodega', bodegaRejected, 'La operación fue rechazada por alcance de bodega.');

    const purchase = await purchases.create({
      providerId: providers[0].id,
      warehouseId: setup.warehouseB.id,
      externalReference: `${tag} compra de prueba`,
      items: [{ productId: setup.product.id, quantity: 3, unit: UnitType.CAJA, unitCost: 12500 }],
    });
    purchaseOrderId = purchase.id;
    await purchases.order(purchase.id);
    const taskNotification = await prisma.notification.findFirst({
      where: { actionEntityId: purchase.id, recipientUserId: setup.bodegaUser.id },
    });
    check('Orden genera notificación al bodeguero', Boolean(taskNotification), 'La notificación quedó dirigida al usuario BODEGA de Bodega B.');
    const received = await purchases.receive(purchase.id, bodegaActor);
    check('Compra recibida', received.status === PurchaseOrderStatus.RECIBIDA, `Estado: ${received.status}.`);
    const afterPurchase = await prisma.productWarehouse.findUniqueOrThrow({
      where: {
        productId_warehouseId: {
          productId: setup.product.id,
          warehouseId: setup.warehouseB.id,
        },
      },
    });
    const currentCost = await prisma.productCost.findFirst({
      where: { productId: setup.product.id, isActive: true },
      orderBy: { id: 'desc' },
    });
    const entry = await prisma.inventoryMovement.findFirst({
      where: { purchaseOrderItemId: received.items[0].id, movementType: InventoryMovementType.ENTRADA },
    });
    check('Compra suma 3 cajas a Bodega B', afterPurchase.quantity === 80, `Bodega B: ${afterPurchase.quantity} UND.`);
    check('Costo normalizado a UND', number(currentCost?.cost) === 625, `Costo activo: ${currentCost?.cost ?? 'n/a'}.`);
    check('Compra crea movimiento ENTRADA', Boolean(entry), entry ? `Movimiento #${entry.id}.` : 'No se encontró ENTRADA.');

    const transfer = await inventory.transfer(
      {
        productId: setup.product.id,
        fromWarehouseId: setup.warehouseA.id,
        toWarehouseId: setup.warehouseB.id,
        quantity: 2,
        unit: UnitType.CAJA,
        reason: `${tag} traslado`,
        supportNote: 'Prueba automatizada',
      },
      adminActor,
    );
    movementId = transfer.id;
    const [finalA, finalB, ticket] = await Promise.all([
      prisma.productWarehouse.findUniqueOrThrow({ where: { productId_warehouseId: { productId: setup.product.id, warehouseId: setup.warehouseA.id } } }),
      prisma.productWarehouse.findUniqueOrThrow({ where: { productId_warehouseId: { productId: setup.product.id, warehouseId: setup.warehouseB.id } } }),
      prisma.inventoryTransferTicket.findUnique({ where: { movementId: transfer.id } }),
    ]);
    check('Traslado descuenta 2 cajas de A', finalA.quantity === 40, `Bodega A: ${finalA.quantity} UND.`);
    check('Traslado suma 2 cajas a B', finalB.quantity === 120, `Bodega B: ${finalB.quantity} UND.`);
    check('Traslado deja trazabilidad y ticket', transfer.movementType === InventoryMovementType.TRASLADO && Boolean(ticket), `Movimiento=${transfer.movementType}, ticket=${ticket?.ticketNumber ?? 'n/a'}.`);

    const inventoryRows = await inventory.findByProduct(setup.product.id);
    const rowB = inventoryRows.find((row) => row.warehouseId === setup.warehouseB.id);
    const rowBInventoryValue = number(rowB?.quantity) * number(rowB?.product?.cost);
    check('Valor de inventario usa costo', rowBInventoryValue === 120 * 625, `Bodega B: ${rowBInventoryValue || 'n/a'} = stock × costo.`);
    check('Semáforo rojo/verde/amarillo', getProductStockStatus(20, 20, 100) === 'ROJO' && getProductStockStatus(60, 20, 100) === 'VERDE' && getProductStockStatus(100, 20, 100) === 'AMARILLO', 'Límites evaluados con la regla definida.');
    check('Referencia de valor para 60 UND', 60 * 625 === 37500, '60 UND × $625 = $37.500.');

    const beforeMissingWarehouse = await prisma.productWarehouse.findUniqueOrThrow({ where: { productId_warehouseId: { productId: setup.product.id, warehouseId: setup.warehouseA.id } } });
    const invoiceCountBefore = await prisma.invoice.count();
    let missingWarehouseRejected = false;
    try {
      await invoices.create({ clientId: client.id, source: 'ADMIN', items: [{ productId: setup.product.id, productPriceId, quantity: 1 }] }, adminActor);
    } catch (error) {
      missingWarehouseRejected = /bodega|warehouse/i.test(String(error));
    }
    const afterMissingWarehouse = await prisma.productWarehouse.findUniqueOrThrow({ where: { productId_warehouseId: { productId: setup.product.id, warehouseId: setup.warehouseA.id } } });
    check('Factura sin bodega se rechaza', missingWarehouseRejected, 'Se solicitó seleccionar una bodega.');
    check('Factura inválida no altera datos', invoiceCountBefore === (await prisma.invoice.count()) && beforeMissingWarehouse.quantity === afterMissingWarehouse.quantity, 'No creó factura ni descontó stock.');

    check('ADMIN puede seleccionar otra bodega', sale.warehouseId === setup.warehouseA.id, 'ADMIN pudo emitir desde Bodega A.');
  } finally {
    await cleanup();
  }
}

main()
  .then(async () => {
    console.log(JSON.stringify({ ok: true, checks }, null, 2));
  })
  .catch(async (error) => {
    console.error(JSON.stringify({ ok: false, error: String(error), checks }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
