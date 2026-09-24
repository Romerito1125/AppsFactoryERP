import {
  DiscountType,
  InventoryMovementType,
  Prisma,
  PurchaseOrderStatus,
  Role,
  UnitType,
} from '@prisma/client';
import { ProductPricesService } from '../src/modules/product-prices/product-prices.service';
import { ProductProfitService } from '../src/modules/productos/product-profit.service';
import { ComprasService } from '../src/modules/compras/compras.service';
import { FacturasService } from '../src/modules/facturas/facturas.service';
import { NotificacionesService } from '../src/modules/notificaciones/notificaciones.service';
import { AuditLogService } from '../src/modules/audit-log/audit-log.service';
import { ProductResolverService } from '../src/shared/products/product-resolver.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const tag = `QA-COMERCIAL-${Date.now()}`;
const prisma = new PrismaService();
const notifications = new NotificacionesService(prisma);
const audit = new AuditLogService(prisma);
const resolver = new ProductResolverService();
const purchases = new ComprasService(prisma, notifications);
const invoices = new FacturasService(prisma, notifications, resolver, audit);
const prices = new ProductPricesService(prisma, audit);
const profits = new ProductProfitService(prisma);

let productId: number | undefined;
let tagId: number | undefined;
let warehouseAId: number | undefined;
let warehouseBId: number | undefined;
let wholesaleClientId: number | undefined;
let offerId: number | undefined;
let purchaseOrderId: number | undefined;
let retentionProviderId: number | undefined;
const invoiceIds: number[] = [];

function check(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  if (!ok) throw new Error(`${name}: ${detail}`);
}

async function cleanup() {
  await prisma.$transaction(async (tx) => {
    if (invoiceIds.length) {
      await tx.notificationRead.deleteMany({
        where: { notification: { invoiceId: { in: invoiceIds } } },
      });
      await tx.notification.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
    if (purchaseOrderId) {
      const movementIds = (
        await tx.inventoryMovement.findMany({
          where: { purchaseOrderItem: { purchaseOrderId } },
          select: { id: true },
        })
      ).map((item) => item.id);
      if (movementIds.length) {
        await tx.inventoryTransferTicket.deleteMany({ where: { movementId: { in: movementIds } } });
        await tx.inventoryMovement.deleteMany({ where: { id: { in: movementIds } } });
      }
      await tx.notification.deleteMany({ where: { actionEntityId: purchaseOrderId } });
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId } });
      await tx.purchaseOrder.deleteMany({ where: { id: purchaseOrderId } });
    }
    if (offerId) {
      await tx.offerClient.deleteMany({ where: { offerId } });
      await tx.offerProduct.deleteMany({ where: { offerId } });
      await tx.offer.deleteMany({ where: { id: offerId } });
    }
    if (productId) {
      const productMovementIds = (
        await tx.inventoryMovement.findMany({ where: { productId }, select: { id: true } })
      ).map((item) => item.id);
      if (productMovementIds.length) {
        await tx.inventoryTransferTicket.deleteMany({ where: { movementId: { in: productMovementIds } } });
        await tx.inventoryMovement.deleteMany({ where: { id: { in: productMovementIds } } });
      }
      const priceIds = (await tx.productPrice.findMany({ where: { productId }, select: { id: true } })).map((p) => p.id);
      await tx.productPriceHistory.deleteMany({ where: { productPriceId: { in: priceIds } } });
      await tx.productTag.deleteMany({ where: { productId } });
      await tx.productProvider.deleteMany({ where: { productId } });
      await tx.productBarcode.deleteMany({ where: { productId } });
      await tx.productCost.deleteMany({ where: { productId } });
      await tx.productPrice.deleteMany({ where: { productId } });
      await tx.productWarehouse.deleteMany({ where: { productId } });
      await tx.productPackagingProfile.deleteMany({ where: { productId } });
      await tx.product.deleteMany({ where: { id: productId } });
    }
    if (wholesaleClientId) await tx.client.delete({ where: { id: wholesaleClientId } });
    if (retentionProviderId) await tx.provider.delete({ where: { id: retentionProviderId } });
    if (tagId) await tx.tag.delete({ where: { id: tagId } });
    if (warehouseAId || warehouseBId) {
      await tx.warehouse.deleteMany({ where: { id: { in: [warehouseAId, warehouseBId].filter(Boolean) as number[] } } });
    }
    await tx.auditLog.deleteMany({ where: { entityLabel: { contains: tag } } });
  });
}

async function main() {
  await prisma.$connect();
  try {
    const [admin, type, providers] = await Promise.all([
      prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true } }),
      prisma.productType.findFirst({ where: { isActive: true } }),
      prisma.provider.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, take: 2 }),
    ]);
    if (!admin || !type || providers.length < 2) throw new Error('La base necesita ADMIN, tipo y dos proveedores activos.');

    const setup = await prisma.$transaction(async (tx) => {
      const [warehouseA, warehouseB] = await Promise.all([
        tx.warehouse.create({ data: { location: `${tag} A` } }),
        tx.warehouse.create({ data: { location: `${tag} B` } }),
      ]);
      const tagRecord = await tx.tag.create({ data: { name: `${tag} Categoría` } });
      const retentionProvider = await tx.provider.create({
        data: {
          name: `${tag} Proveedor con retención`,
          providerType: 'JURÍDICO',
          withholdingType: 'RET-2.5%',
          withholdingRate: 2.5,
          withholdingMinimumBase: 1000,
          hasIslrWithholding: true,
          isSelfWithholding: false,
        },
      });
      const wholesaleClient = await tx.client.create({
        data: {
          identification: `${tag}-MAYORISTA`,
          firstName: 'QA',
          lastName: 'Mayorista',
          clientType: 'MAYORISTA',
          isActive: true,
        },
      });
      const product = await tx.product.create({
        data: {
          productTypeId: type.id,
          providerId: providers[0].id,
          name: `${tag} Producto completo`,
          description: 'Producto QA para pruebas de catálogo y venta',
          brand: 'QA Brand',
          taxRate: 19,
          unit: UnitType.UND,
          minimumStock: 5,
          maximumStock: 100,
          imageUrl: 'https://example.com/qa-product.png',
          providers: { create: providers.map((provider) => ({ providerId: provider.id })) },
          tags: { create: { tagId: tagRecord.id } },
          packagingProfile: { create: { unitsPerPackage: 10, packagesPerBox: 2 } },
          barcodes: { create: { code: `${tag}-BARCODE`, isPrimary: true } },
          prices: {
            create: [
              { name: 'Precio minorista', price: 1000, unit: UnitType.UND, quantity: 1, isDefault: true },
              { name: 'Precio mayorista', price: 800, unit: UnitType.UND, quantity: 1 },
              { name: 'Precio cliente especial', price: 700, unit: UnitType.UND, quantity: 1 },
            ],
          },
          costs: { create: { cost: 625, unit: UnitType.UND, quantity: 1, isActive: true } },
          warehouses: {
            create: [
              { warehouseId: warehouseA.id, quantity: 50 },
              { warehouseId: warehouseB.id, quantity: 50 },
            ],
          },
        },
        include: { providers: true, prices: true, barcodes: true, packagingProfile: true },
      });
      const offer = await tx.offer.create({
        data: {
          name: `${tag} oferta cliente`,
          discountType: DiscountType.PRECIO_ESPECIAL,
          discountValue: 100,
          isActive: true,
          clients: { create: { clientId: wholesaleClient.id } },
          products: { create: { productId: product.id } },
        },
      });
      return { warehouseA, warehouseB, tagRecord, wholesaleProvider: retentionProvider, wholesaleClient, product, offer };
    });
    productId = setup.product.id;
    warehouseAId = setup.warehouseA.id;
    warehouseBId = setup.warehouseB.id;
    tagId = setup.tagRecord.id;
    wholesaleClientId = setup.wholesaleClient.id;
    retentionProviderId = setup.wholesaleProvider.id;
    offerId = setup.offer.id;
    const minoristaPrice = setup.product.prices.find((p) => p.name === 'Precio minorista')!;

    check('Producto completo', setup.product.providers.length === 2 && setup.product.barcodes.length === 1 && Boolean(setup.product.packagingProfile) && setup.product.imageUrl !== null, 'Proveedor principal/secundario, empaque, código e imagen guardados.');
    check('Tres precios configurables', setup.product.prices.length >= 3, `${setup.product.prices.length} precios activos creados.`);

    await prices.update(setup.product.prices.find((p) => p.name === 'Precio cliente especial')!.id, { price: 710, reason: 'Prueba QA de trazabilidad' }, { sub: admin.id, role: Role.ADMIN, username: admin.username });
    const history = await prisma.productPriceHistory.findFirst({ where: { productPriceId: setup.product.prices.find((p) => p.name === 'Precio cliente especial')!.id }, orderBy: { id: 'desc' } });
    check('Cambio de precio trazable', Boolean(history?.reason), `Razón registrada: ${history?.reason ?? 'ninguna'}.`);

    const profit = await profits.findProductProfit(setup.product.id);
    const defaultProfit = profit.prices.find((price) => price.priceId === minoristaPrice.id);
    const lowMargin = profit.prices.find((price) => price.name === 'Precio cliente especial');
    check('Margen antes/después de IVA', defaultProfit?.priceBeforeTax === '1000' && defaultProfit?.priceAfterTax === '1190' && defaultProfit?.marginAfterTax !== undefined, 'La utilidad expone valores antes y después de IVA.');
    check('Advertencia y sugerencia de margen', Boolean(lowMargin?.warning && lowMargin?.suggestedPriceBeforeTax), lowMargin?.warning ?? 'No se generó advertencia.');

    const adminActor = { sub: admin.id, role: Role.ADMIN, username: admin.username } as const;
    const minoristaSale = await invoices.create({ warehouseId: setup.warehouseA.id, source: 'ADMIN', items: [{ productId: productId!, quantity: 1 }] }, adminActor);
    invoiceIds.push(minoristaSale.id);
    check('Cliente por defecto minorista', minoristaSale.client.clientType === 'MINORISTA', `Tipo: ${minoristaSale.client.clientType}.`);
    check('Precio minorista automático', minoristaSale.items[0].productPriceId === minoristaPrice.id && Number(minoristaSale.items[0].unitPrice) <= 1000, `Precio catálogo minorista con ofertas: ${minoristaSale.items[0].unitPrice}.`);

    const wholesaleSale = await invoices.create({ clientId: setup.wholesaleClient.id, warehouseId: setup.warehouseB.id, source: 'ADMIN', items: [{ productId: productId!, quantity: 1 }] }, adminActor);
    invoiceIds.push(wholesaleSale.id);
    const wholesalePrice = setup.product.prices.find((p) => p.name === 'Precio mayorista')!;
    check('Precio mayorista y oferta por cliente', wholesaleSale.items[0].productPriceId === wholesalePrice.id && Number(wholesaleSale.items[0].unitPrice) <= 700, `Precio mayorista con ofertas: ${wholesaleSale.items[0].unitPrice}.`);

    const multiWarehouseSale = await invoices.create({ clientId: setup.wholesaleClient.id, warehouseId: setup.warehouseB.id, source: 'ADMIN', items: [
      { productId: productId!, productPriceId: minoristaPrice.id, warehouseId: setup.warehouseA.id, quantity: 1 },
      { productId: productId!, productPriceId: minoristaPrice.id, warehouseId: setup.warehouseB.id, quantity: 1 },
    ] }, adminActor);
    invoiceIds.push(multiWarehouseSale.id);
    check('Factura multi-bodega con trazabilidad', multiWarehouseSale.items.length === 2 && new Set(multiWarehouseSale.items.map((item) => item.warehouseId)).size === 2, 'Cada línea conserva su bodega de salida.');

    const vendorSale = await invoices.create({ warehouseId: setup.warehouseA.id, source: 'ADMIN', items: [{ productId: productId!, productPriceId: minoristaPrice.id, quantity: 1 }] }, { sub: admin.id, role: Role.VENDEDOR, username: admin.username });
    invoiceIds.push(vendorSale.id);
    check('Validación de solicitud del vendedor', vendorSale.validationStatus === 'PENDIENTE', `Estado: ${vendorSale.validationStatus}.`);

    const purchase = await purchases.create({
      providerId: retentionProviderId!,
      warehouseId: setup.warehouseB.id,
      externalReference: `${tag} factura proveedor`,
      documentName: 'factura-proveedor-qa.pdf',
      documentMimeType: 'application/pdf',
      documentData: 'data:application/pdf;base64,UVEtRE9DVU1FTlQ=',
      items: [{ productId: productId!, quantity: 2, unit: UnitType.UND, unitCost: 650, taxRate: 19 }],
    });
    purchaseOrderId = purchase.id;
    check('Documento de compra conservado', purchase.documentName === 'factura-proveedor-qa.pdf' && Boolean(purchase.documentData), 'La compra conserva el soporte PDF para consulta.');
    check('Retención automática por condición y umbral', Number(purchase.retentionRate) === 2.5 && Number(purchase.retentionAmount) === 32.5 && Number(purchase.payableTotal) === 1514.5, `Retención ${purchase.retentionAmount}, pagable ${purchase.payableTotal}.`);
    await purchases.order(purchase.id);
    const received = await purchases.receive(purchase.id, adminActor);
    check('Compra borrador-ordenada-recibida', received.status === PurchaseOrderStatus.RECIBIDA, `Estado final: ${received.status}.`);
    const entry = await prisma.inventoryMovement.findFirst({ where: { purchaseOrderItem: { purchaseOrderId: purchase.id }, movementType: InventoryMovementType.ENTRADA } });
    check('Recepción actualiza inventario y costo', Boolean(entry) && Number(received.items[0].receivedQuantity) === 2, `Movimiento ENTRADA: ${entry?.id ?? 'no encontrado'}.`);
  } finally {
    await cleanup();
  }
}

main()
  .then(() => console.log(JSON.stringify({ ok: true, checks }, null, 2)))
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error), checks }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
