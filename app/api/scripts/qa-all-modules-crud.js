require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:7502';
const suffix = `QA-E2E-${Date.now()}`;
let accessToken;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const results = [];
const ids = {
  clients: [],
  providers: [],
  types: [],
  warehouses: [],
  products: [],
  prices: [],
  barcodes: [],
  retentions: [],
  users: [],
  tags: [],
  offers: [],
  accounts: [],
  movements: [],
  invoices: [],
  credits: [],
  payments: [],
  deliveries: [],
  quotes: [],
  purchases: [],
};

async function request(method, path, body, expected = [200, 201]) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

async function pass(label, fn) {
  try {
    const value = await fn();
    results.push({ label, ok: true });
    console.log(`OK ${label}`);
    return value;
  } catch (error) {
    results.push({ label, ok: false, error: error.message });
    console.log(`FAIL ${label} | ${error.message}`);
    return null;
  }
}

async function expectFail(label, fn) {
  try {
    await fn();
    results.push({ label, ok: false, error: 'La operación debía fallar.' });
    console.log(`FAIL ${label} | La operación debía fallar.`);
    return false;
  } catch (error) {
    results.push({ label, ok: true });
    console.log(`OK ${label}`);
    return true;
  }
}

function remember(collection, value) {
  if (value?.id) ids[collection].push(value.id);
  return value;
}

function addIds(collection, values) {
  for (const value of values) {
    if (value?.id && !ids[collection].includes(value.id)) ids[collection].push(value.id);
  }
}

async function cleanupStaleQa() {
  const [clients, providers, products, types, warehouses, users, accounts, retentions, tags, offers] = await Promise.all([
    prisma.client.findMany({ where: { identification: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
    prisma.provider.findMany({ where: { name: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
    prisma.product.findMany({ where: { name: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
    prisma.productType.findMany({ where: { name: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
    prisma.warehouse.findMany({ where: { location: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
    prisma.user.findMany({ where: { username: { startsWith: 'qa-e2e-' } }, select: { id: true } }),
    prisma.bankAccount.findMany({ where: { name: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
    prisma.retention.findMany({ where: { code: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
    prisma.tag.findMany({ where: { name: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
    prisma.offer.findMany({ where: { name: { startsWith: 'QA-E2E-' } }, select: { id: true } }),
  ]);
  const clientIds = clients.map((item) => item.id);
  const productIds = products.map((item) => item.id);
  const providerIds = providers.map((item) => item.id);
  const warehouseIds = warehouses.map((item) => item.id);
  const accountIds = accounts.map((item) => item.id);
  const userIds = users.map((item) => item.id);
  const invoiceRows = await prisma.invoice.findMany({
    where: {
      OR: [
        ...(clientIds.length ? [{ clientId: { in: clientIds } }] : []),
        ...(productIds.length ? [{ items: { some: { productId: { in: productIds } } } }] : []),
        ...(accountIds.length ? [{ bankMovement: { some: { bankAccountId: { in: accountIds } } } }] : []),
      ],
    },
    select: { id: true },
  });
  const quoteRows = await prisma.quote.findMany({
    where: {
      OR: [
        ...(clientIds.length ? [{ clientId: { in: clientIds } }] : []),
        ...(productIds.length ? [{ items: { some: { productId: { in: productIds } } } }] : []),
      ],
    },
    select: { id: true },
  });
  const creditRows = await prisma.invoiceCredit.findMany({
    where: {
      OR: [
        ...(clientIds.length ? [{ clientId: { in: clientIds } }] : []),
        ...(invoiceRows.length ? [{ invoiceId: { in: invoiceRows.map((item) => item.id) } }] : []),
      ],
    },
    select: { id: true },
  });
  const deliveryRows = invoiceRows.length
    ? await prisma.delivery.findMany({ where: { invoiceId: { in: invoiceRows.map((item) => item.id) } }, select: { id: true } })
    : [];
  const purchaseRows = await prisma.purchaseOrder.findMany({
    where: {
      OR: [
        ...(providerIds.length ? [{ providerId: { in: providerIds } }] : []),
        ...(warehouseIds.length ? [{ warehouseId: { in: warehouseIds } }] : []),
        ...(productIds.length ? [{ items: { some: { productId: { in: productIds } } } }] : []),
      ],
    },
    select: { id: true },
  });
  addIds('clients', clients);
  addIds('providers', providers);
  addIds('products', products);
  addIds('types', types);
  addIds('warehouses', warehouses);
  addIds('users', users);
  addIds('accounts', accounts);
  addIds('retentions', retentions);
  addIds('tags', tags);
  addIds('offers', offers);
  addIds('invoices', invoiceRows);
  addIds('quotes', quoteRows);
  addIds('credits', creditRows);
  addIds('deliveries', deliveryRows);
  addIds('purchases', purchaseRows);
  if (accountIds.length) addIds('movements', await prisma.bankAccountMovement.findMany({ where: { bankAccountId: { in: accountIds } }, select: { id: true } }));
  if (clientIds.length) await prisma.referral.findMany({ where: { OR: [{ referrerClientId: { in: clientIds } }, { referredClientId: { in: clientIds } }] }, select: { id: true } });
}

async function cleanup() {
  const productIds = ids.products;
  const invoiceIds = ids.invoices;
  const quoteIds = ids.quotes;
  const accountIds = ids.accounts;
  const creditIds = ids.credits;
  const deliveryIds = ids.deliveries;
  const purchaseIds = ids.purchases;

  if (invoiceIds.length) {
    await prisma.referralBenefitRedemption.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.referralSocialContribution.deleteMany({ where: { originInvoiceId: { in: invoiceIds } } });
    await prisma.referralBenefit.deleteMany({ where: { originInvoiceId: { in: invoiceIds } } });
    await prisma.creditPayment.deleteMany({ where: { invoiceCreditId: { in: creditIds } } });
    await prisma.invoiceCredit.deleteMany({ where: { id: { in: creditIds } } });
    await prisma.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  }
  if (accountIds.length) await prisma.bankAccountMovement.deleteMany({ where: { bankAccountId: { in: accountIds } } });
  if (quoteIds.length) {
    await prisma.quoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
  }
  if (productIds.length) {
    const inventoryMovements = await prisma.inventoryMovement.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
    const movementIds = inventoryMovements.map((movement) => movement.id);
    if (movementIds.length) await prisma.inventoryTransferTicket.deleteMany({ where: { movementId: { in: movementIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productCost.deleteMany({ where: { productId: { in: productIds } } });
    if (purchaseIds.length) await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: purchaseIds } } });
    const productPrices = await prisma.productPrice.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
    const productPriceIds = productPrices.map((price) => price.id);
    if (productPriceIds.length) {
      await prisma.productPriceHistory.deleteMany({ where: { productPriceId: { in: productPriceIds } } });
      await prisma.productPrice.deleteMany({ where: { id: { in: productPriceIds } } });
    }
    await prisma.productBarcode.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productFavorite.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productTag.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productProvider.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productWarehouse.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productPackagingProfile.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }
  if (purchaseIds.length) await prisma.purchaseOrder.deleteMany({ where: { id: { in: purchaseIds } } });
  if (ids.offers.length) {
    await prisma.offerTag.deleteMany({ where: { offerId: { in: ids.offers } } });
    await prisma.offerProduct.deleteMany({ where: { offerId: { in: ids.offers } } });
    await prisma.offerProductType.deleteMany({ where: { offerId: { in: ids.offers } } });
    await prisma.offerClient.deleteMany({ where: { offerId: { in: ids.offers } } });
    await prisma.offer.deleteMany({ where: { id: { in: ids.offers } } });
  }
  if (ids.tags.length) await prisma.tag.deleteMany({ where: { id: { in: ids.tags } } });
  if (ids.users.length) {
    await prisma.userPermission.deleteMany({ where: { userId: { in: ids.users } } });
    await prisma.employee.deleteMany({ where: { userId: { in: ids.users } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  }
  if (ids.retentions.length) {
    await prisma.retentionRange.deleteMany({ where: { retentionId: { in: ids.retentions } } });
    await prisma.retention.deleteMany({ where: { id: { in: ids.retentions } } });
  }
  if (ids.clients.length) {
    await prisma.referral.deleteMany({ where: { OR: [{ referrerClientId: { in: ids.clients } }, { referredClientId: { in: ids.clients } }] } });
    await prisma.client.deleteMany({ where: { id: { in: ids.clients } } });
  }
  if (ids.providers.length) await prisma.provider.deleteMany({ where: { id: { in: ids.providers } } });
  if (ids.types.length) await prisma.productType.deleteMany({ where: { id: { in: ids.types } } });
  if (ids.warehouses.length) await prisma.warehouse.deleteMany({ where: { id: { in: ids.warehouses } } });
  if (accountIds.length) await prisma.bankAccount.deleteMany({ where: { id: { in: accountIds } } });
}

async function main() {
  await cleanupStaleQa();
  const login = await request('POST', '/auth/login', { email: 'admin@mundotienda.com', password: 'Admin123*' });
  accessToken = login.accessToken;
  if (!accessToken) throw new Error('No fue posible autenticar al administrador.');
  console.log('OK Autenticar administrador');
  const type = remember('types', await pass('Crear tipo de producto', () => request('POST', '/tipos-producto', { name: `${suffix} Tipo`, description: 'Tipo QA' })));
  const warehouse = remember('warehouses', await pass('Crear bodega', () => request('POST', '/bodegas', { location: `${suffix} Bodega` })));
  const provider = remember('providers', await pass('Crear proveedor', () => request('POST', '/proveedores', { name: `${suffix} Proveedor`, taxId: `${suffix}-NIT`, providerType: 'Juridico', description: 'Proveedor QA', address: 'Calle QA', hasIslrWithholding: true, creditDays: 30 })));
  const client = remember('clients', await pass('Crear cliente con referido automático', () => request('POST', '/clientes', { identification: `${suffix}-CLI`, firstName: 'Cliente', lastName: 'QA', phone: '3000000000', address: 'Direccion QA', clientType: 'MINORISTA' })));
  const referred = remember('clients', await pass('Crear segundo cliente para referidos', () => request('POST', '/clientes', { identification: `${suffix}-CLI-2`, firstName: 'Referido', lastName: 'QA', clientType: 'MINORISTA' })));

  await pass('Consultar y actualizar tipo', async () => {
    await request('GET', `/tipos-producto/${type.id}`);
    const updated = await request('PATCH', `/tipos-producto/${type.id}`, { description: 'Tipo QA actualizado' });
    if (updated.description !== 'Tipo QA actualizado') throw new Error('La descripción no persistió.');
  });
  await pass('Consultar y actualizar bodega', async () => {
    await request('GET', `/bodegas/${warehouse.id}`);
    const updated = await request('PATCH', `/bodegas/${warehouse.id}`, { location: `${suffix} Bodega actualizada` });
    if (!updated.location.includes('actualizada')) throw new Error('La bodega no se actualizó.');
  });
  await pass('Consultar y actualizar proveedor', async () => {
    await request('GET', `/proveedores/${provider.id}`);
    const updated = await request('PATCH', `/proveedores/${provider.id}`, { description: 'Proveedor QA actualizado', city: 'Cali' });
    if (updated.description !== 'Proveedor QA actualizado') throw new Error('El proveedor no se actualizó.');
  });
  await pass('Consultar y actualizar cliente', async () => {
    if (!client.referralCode || client.referralLevel !== 0) throw new Error('No generó código/nivel de referido automático.');
    await request('GET', `/clientes/${client.id}`);
    const updated = await request('PATCH', `/clientes/${client.id}`, { identification: `${suffix}-CLI-UPD`, firstName: 'Cliente actualizado', email: `${suffix.toLowerCase()}@example.local`, password: 'QApass123' });
    if (!updated.firstName.includes('actualizado')) throw new Error('El cliente no se actualizó.');
    await request('POST', `/clientes/${client.id}/codigo-referido`);
    await request('PATCH', `/clientes/${client.id}/nivel-referido`, { referralLevel: 2 });
  });
  await pass('Crear y consultar relación de referido', async () => {
    const referral = await request('POST', '/referidos', { referredClientId: referred.id, codeUsed: client.referralCode });
    if (!referral?.id) throw new Error('No creó referido.');
    await request('GET', `/referidos/${referral.id}`);
    await request('GET', `/clientes/${client.id}/referidos`);
  });

  const product = remember('products', await pass('Crear producto con precio, bodega y stock', () => request('POST', '/productos', {
    productTypeId: type.id,
    providerId: provider.id,
    name: `${suffix} Producto`,
    description: 'Producto QA',
    taxRate: 19,
    brand: 'Marca QA',
    minimumStock: 2,
    maximumStock: 100,
    quantity: 50,
    warehouseId: warehouse.id,
    prices: [{ name: 'Precio QA', price: 10000, isDefault: true }],
  })));
  const price = remember('prices', await pass('Crear, consultar y actualizar precio', async () => {
    const created = await request('POST', `/productos/${product.id}/precios`, { name: 'Precio extra QA', price: 15000 });
    await request('GET', `/precios-producto/${created.id}`);
    const updated = await request('PATCH', `/precios-producto/${created.id}`, { name: 'Precio extra QA actualizado', price: 20000 });
    if (Number(updated.price) !== 20000) throw new Error('El precio no persistió.');
    await request('PATCH', `/precios-producto/${created.id}/default`);
    return created;
  }));
  await pass('Consultar utilidades y validar margen', async () => {
    const utilities = await request('GET', `/productos/${product.id}/utilidades`);
    const row = utilities?.prices?.find((item) => item.id === price.id) ?? utilities?.find?.((item) => item.id === price.id);
    if (row && row.profit !== undefined && row.margin !== undefined && Number(row.margin) < 0) throw new Error('Margen inválido.');
  });
  const barcode = remember('barcodes', await pass('Crear, actualizar y desactivar código de barras', async () => {
    const created = await request('POST', `/productos/${product.id}/codigos-barras`, { code: `${suffix}-BAR`, type: 'OTHER', isPrimary: true });
    await request('GET', `/codigos-barras/${created.id}`);
    await request('PATCH', `/codigos-barras/${created.id}`, { code: `${suffix}-BAR-UPD`, isPrimary: true });
    await request('DELETE', `/codigos-barras/${created.id}`);
    return created;
  }));
  await pass('Crear y actualizar empaque e inventario', async () => {
    await request('PATCH', `/productos/${product.id}`, { packaging: { unitsPerPackage: 6, packagesPerBox: 4, saleByUnitOnly: false, notes: 'Empaque QA' } });
    await request('POST', '/inventario/entrada', { productId: product.id, toWarehouseId: warehouse.id, quantity: 3, reason: 'Entrada QA' });
    await request('POST', '/inventario/ajuste', { productId: product.id, warehouseId: warehouse.id, quantity: 52, reason: 'Ajuste QA' });
    await request('GET', `/inventario/productos/${product.id}`);
    await request('GET', `/inventario/bodegas/${warehouse.id}`);
  });
  await expectFail('Rechazar producto con proveedor inexistente', () => request('POST', '/productos', { productTypeId: type.id, providerId: 99999999, name: `${suffix} invalido`, taxRate: 19, brand: 'QA' }));

  const retention = remember('retentions', await pass('Crear, actualizar y consultar retención', async () => {
    const created = await request('POST', '/retenciones', { code: `${suffix}-RTE`, description: 'Retención QA', minimumBase: 100000, applyPurchases: true, ranges: [{ minimum: 0, maximum: 1000000, percentage: 2.5 }] });
    await request('GET', `/retenciones/${created.id}`);
    const updated = await request('PATCH', `/retenciones/${created.id}`, { description: 'Retención QA actualizada', ranges: [{ minimum: 0, maximum: 2000000, percentage: 3 }] });
    if (!updated.description.includes('actualizada')) throw new Error('La retención no se actualizó.');
    return created;
  }));

  const account = remember('accounts', await pass('Crear y actualizar cuenta bancaria QA', () => request('POST', '/cuentas-bancarias', { name: `${suffix} Cuenta`, bankName: 'Banco QA', accountNumber: `${suffix}-001`, accountType: 'AHORROS', currentBalance: 1000000 })));
  const account2 = remember('accounts', await pass('Crear segunda cuenta bancaria QA', () => request('POST', '/cuentas-bancarias', { name: `${suffix} Cuenta 2`, bankName: 'Banco QA', accountNumber: `${suffix}-002`, accountType: 'CORRIENTE', currentBalance: 100000 })));
  await pass('Actualizar cuenta y ejecutar operaciones bancarias', async () => {
    await request('GET', `/cuentas-bancarias/${account.id}`);
    await request('PATCH', `/cuentas-bancarias/${account.id}`, { name: `${suffix} Cuenta actualizada` });
    for (const [path, payload] of [
      ['/movimientos-bancarios/ingreso', { bankAccountId: account.id, amount: 1000, description: `${suffix} ingreso` }],
      ['/movimientos-bancarios/egreso', { bankAccountId: account.id, amount: 100, description: `${suffix} egreso`, appliesGmf: true }],
      ['/movimientos-bancarios/transferencia', { fromBankAccountId: account.id, toBankAccountId: account2.id, amount: 200, description: `${suffix} transferencia` }],
      ['/movimientos-bancarios/ajuste', { bankAccountId: account.id, balance: 999999, description: `${suffix} ajuste` }],
    ]) {
      const movement = await request('POST', path, payload);
      if (movement?.id) ids.movements.push(movement.id);
    }
    await request('GET', '/movimientos-bancarios');
  });
  await expectFail('Rechazar transferencia entre la misma cuenta', () => request('POST', '/movimientos-bancarios/transferencia', { fromBankAccountId: account.id, toBankAccountId: account.id, amount: 1, description: `${suffix} inválida` }));

  const user = remember('users', await pass('Crear, actualizar permisos y eliminar usuario', async () => {
    const created = await request('POST', '/usuarios', { email: `${suffix.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.local`, password: 'QApass123', role: 'CONTADOR' });
    await request('GET', `/usuarios/${created.id}`);
    const updated = await request('PATCH', `/usuarios/${created.id}`, { email: `${suffix.toLowerCase()}-upd@example.local`, password: 'QApass456', role: 'CAJERO' });
    if (updated.role !== 'CAJERO') throw new Error('El rol no persistió.');
    await request('PUT', `/usuarios/${created.id}/permisos`, { permissions: [{ code: 'CLIENTS_VIEW', isAllowed: true }, { code: 'PRODUCTS_VIEW', isAllowed: false }] });
    await request('GET', `/usuarios/${created.id}/permisos`);
    return created;
  }));

  const invoice = remember('invoices', await pass('Crear factura y consultarla', () => request('POST', '/facturas', { clientId: client.id, warehouseId: warehouse.id, items: [{ productId: product.id, productPriceId: price.id, quantity: 1 }] })));
  await pass('Crear crédito, registrar pago parcial y consultar saldo', async () => {
    const credit = remember('credits', await request('POST', `/facturas/${invoice.id}/credito`, { dueDate: '2035-01-01T00:00:00.000Z' }));
    const paid = await request('POST', `/creditos/${credit.id}/pagos`, { amount: 1000, bankAccountId: account.id, notes: `${suffix} abono` });
    if (paid.balance >= credit.balance) throw new Error('El abono no redujo el saldo.');
    await request('GET', `/clientes/${client.id}/creditos`);
  });
  await expectFail('Rechazar sobrepago de crédito', () => request('POST', `/creditos/${ids.credits[0]}/pagos`, { amount: 999999999, bankAccountId: account.id }));
  await pass('Crear y actualizar entrega', async () => {
    const delivery = remember('deliveries', await request('POST', '/domicilios', { invoiceId: invoice.id, address: 'Direccion entrega QA', recipientName: 'Receptor QA', recipientPhone: '3000000000', notes: 'Entrega QA' }));
    await request('GET', `/domicilios/${delivery.id}`);
    await request('PATCH', `/domicilios/${delivery.id}`, { status: 'EN_CAMINO' });
  });
  await pass('Crear y actualizar cotización con varios productos', async () => {
    const quote = remember('quotes', await request('POST', '/cotizaciones', { clientId: client.id, expiresAt: '2035-01-01T00:00:00.000Z', items: [{ productId: product.id, productPriceId: price.id, quantity: 1 }, { productId: product.id, productPriceId: price.id, quantity: 2 }] }));
    await request('GET', `/cotizaciones/${quote.id}`);
    await request('PATCH', `/cotizaciones/${quote.id}`, { expiresAt: '2035-02-01T00:00:00.000Z' });
    await request('PATCH', `/cotizaciones/${quote.id}/estado`, { status: 'APROBADA' });
  });

  const purchase = remember('purchases', await pass('Crear y actualizar compra', () => request('POST', '/compras', { providerId: provider.id, warehouseId: warehouse.id, externalReference: `${suffix}-COMPRA`, expectedAt: '2035-01-01T00:00:00.000Z', items: [{ productId: product.id, quantity: 2, unitCost: 5000, taxRate: 19 }] })));
  await pass('Consultar reporte de compras y operaciones', async () => {
    await request('GET', '/compras');
    await request('GET', '/compras/reportes/resumen');
    await request('GET', `/compras/${purchase.id}`);
    await request('PATCH', `/compras/${purchase.id}`, { notes: `${suffix} compra actualizada`, items: [{ productId: product.id, quantity: 3, unitCost: 5500, taxRate: 19 }] });
    await request('POST', `/compras/${purchase.id}/ordenar`);
  });

  await pass('Eliminar registros CRUD sin relaciones', async () => {
    await request('DELETE', `/precios-producto/${price.id}`);
    await request('DELETE', `/retenciones/${retention.id}`);
    await request('DELETE', `/usuarios/${user.id}`);
    await request('DELETE', `/cuentas-bancarias/${account2.id}`);
  });

  await expectFail('Proteger producto relacionado de eliminación indebida', () => request('DELETE', `/productos/${product.id}`));

  const failed = results.filter((item) => !item.ok);
  console.log(JSON.stringify({ apiUrl: API_URL, suffix, passed: results.length - failed.length, failed: failed.length, created: ids }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`QA fatal: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      const remaining = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "Product" WHERE "name" LIKE '${suffix}%'`);
      if (remaining[0]?.count !== 0) {
        console.error(`QA cleanup incompleto: ${remaining[0].count} productos restantes.`);
        process.exitCode = 1;
      } else {
        console.log(`QA cleanup OK: ${suffix}`);
      }
    } catch (error) {
      console.error(`QA cleanup FAIL: ${error.message}`);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });
