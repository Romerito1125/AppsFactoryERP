const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const runId = `T${Date.now()}`;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type ApiResponse<T = any> = {
  status: number;
  body: T;
};

type TestResult = {
  name: string;
  ok: boolean;
  status: number;
  expected: string;
  error?: string;
};

const results: TestResult[] = [];

async function request<T = any>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(10000),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function test<T = any>(
  name: string,
  method: Method,
  path: string,
  body: unknown,
  expected: (status: number, body: T) => boolean,
) {
  try {
    const response = await request<T>(method, path, body);
    const ok = expected(response.status, response.body);
    results.push({
      name,
      ok,
      status: response.status,
      expected: expected.toString().replace(/\s+/g, ' ').slice(0, 120),
      error: ok ? undefined : JSON.stringify(response.body).slice(0, 300),
    });
    console.log(`${ok ? 'OK' : 'FAIL'} ${response.status} ${name}`);
    return response.body;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      ok: false,
      status: 0,
      expected: 'request should complete',
      error: message,
    });
    console.log(`FAIL 0 ${name} | ${message}`);
    return null as T;
  }
}

const ok = (status: number) => status >= 200 && status < 300;
const fail = (status: number) => status >= 400;

async function main() {
  const clients: any[] = [];
  const productTypes: any[] = [];
  const providers: any[] = [];
  const tags: any[] = [];
  const warehouses: any[] = [];
  const products: any[] = [];
  const invoices: any[] = [];
  const bankAccounts: any[] = [];
  const offers: any[] = [];
  const quotes: any[] = [];

  await test('GET / root health', 'GET', '/', undefined, ok);

  for (let index = 1; index <= 10; index++) {
    clients.push(
      await test(
        `POST /clientes valid ${index}`,
        'POST',
        '/clientes',
        {
          identification: `${runId}-CC-${index}`,
          firstName: `Cliente${index}`,
          lastName: `Prueba${index}`,
          phone: `30000000${index}`,
          address: `Calle ${index}`,
          clientType: index % 2 === 0 ? 'MAYORISTA' : 'MINORISTA',
        },
        ok,
      ),
    );
    productTypes.push(
      await test(
        `POST /tipos-producto valid ${index}`,
        'POST',
        '/tipos-producto',
        { name: `${runId} Tipo ${index}`, description: `Tipo de prueba ${index}` },
        ok,
      ),
    );
    providers.push(
      await test(
        `POST /proveedores valid ${index}`,
        'POST',
        '/proveedores',
        { name: `${runId} Proveedor ${index}`, description: `Proveedor ${index}` },
        ok,
      ),
    );
    tags.push(
      await test(
        `POST /etiquetas valid ${index}`,
        'POST',
        '/etiquetas',
        { name: `${runId} Etiqueta ${index}`, description: `Etiqueta ${index}` },
        ok,
      ),
    );
    warehouses.push(
      await test(
        `POST /bodegas valid ${index}`,
        'POST',
        '/bodegas',
        { location: `${runId} Bodega ${index}` },
        ok,
      ),
    );
  }

  for (let index = 0; index < 10; index++) {
    products.push(
      await test(
        `POST /productos valid ${index + 1}`,
        'POST',
        '/productos',
        {
          productTypeId: productTypes[index].id,
          providerId: providers[index].id,
          name: `${runId} Producto ${index + 1}`,
          description: `Producto de prueba ${index + 1}`,
          taxRate: index % 2 === 0 ? 19 : 5,
          brand: `Marca ${index + 1}`,
          minimumStock: 1 + index,
          maximumStock: 100 + index,
          tagIds: [tags[index].id],
          prices: [
            { name: 'Precio normal', price: 1000 + index * 100, isDefault: true },
            { name: 'Precio alterno', price: 900 + index * 100 },
          ],
          warehouses: [
            { warehouseId: warehouses[index].id, quantity: 20 + index },
            { warehouseId: warehouses[(index + 1) % 10].id, quantity: 10 + index },
          ],
        },
        ok,
      ),
    );
  }

  for (let index = 0; index < 10; index++) {
    await test(`GET /clientes/:id ${index + 1}`, 'GET', `/clientes/${clients[index].id}`, undefined, ok);
    await test(`PATCH /clientes/:id ${index + 1}`, 'PATCH', `/clientes/${clients[index].id}`, { phone: `31111111${index}` }, ok);
    await test(`GET /tipos-producto/:id ${index + 1}`, 'GET', `/tipos-producto/${productTypes[index].id}`, undefined, ok);
    await test(`PATCH /tipos-producto/:id ${index + 1}`, 'PATCH', `/tipos-producto/${productTypes[index].id}`, { description: `Actualizado ${index}` }, ok);
    await test(`GET /proveedores/:id ${index + 1}`, 'GET', `/proveedores/${providers[index].id}`, undefined, ok);
    await test(`PATCH /proveedores/:id ${index + 1}`, 'PATCH', `/proveedores/${providers[index].id}`, { description: `Actualizado ${index}` }, ok);
    await test(`GET /etiquetas/:id ${index + 1}`, 'GET', `/etiquetas/${tags[index].id}`, undefined, ok);
    await test(`PATCH /etiquetas/:id ${index + 1}`, 'PATCH', `/etiquetas/${tags[index].id}`, { description: `Actualizada ${index}` }, ok);
    await test(`GET /bodegas/:id ${index + 1}`, 'GET', `/bodegas/${warehouses[index].id}`, undefined, ok);
    await test(`PATCH /bodegas/:id ${index + 1}`, 'PATCH', `/bodegas/${warehouses[index].id}`, { location: `${runId} Bodega actualizada ${index}` }, ok);
    await test(`GET /productos/:id ${index + 1}`, 'GET', `/productos/${products[index].id}`, undefined, ok);
    await test(`PATCH /productos/:id ${index + 1}`, 'PATCH', `/productos/${products[index].id}`, { description: `Producto actualizado ${index}` }, ok);
    await test(`GET /productos/:id/precios ${index + 1}`, 'GET', `/productos/${products[index].id}/precios`, undefined, ok);
  }

  await test('GET /clientes', 'GET', '/clientes', undefined, ok);
  await test('GET /clientes?estado=todos', 'GET', '/clientes?estado=todos', undefined, ok);
  await test('GET /tipos-producto', 'GET', '/tipos-producto', undefined, ok);
  await test('GET /proveedores', 'GET', '/proveedores', undefined, ok);
  await test('GET /etiquetas', 'GET', '/etiquetas', undefined, ok);
  await test('GET /bodegas', 'GET', '/bodegas', undefined, ok);
  await test('GET /productos', 'GET', '/productos', undefined, ok);
  await test('GET /inventario', 'GET', '/inventario', undefined, ok);

  for (let index = 0; index < 10; index++) {
    await test(`POST /inventario/entrada ${index + 1}`, 'POST', '/inventario/entrada', { productId: products[index].id, toWarehouseId: warehouses[index].id, quantity: 2 + index, reason: `Entrada ${index}` }, ok);
    await test(`POST /inventario/salida ${index + 1}`, 'POST', '/inventario/salida', { productId: products[index].id, fromWarehouseId: warehouses[index].id, quantity: 1, reason: `Salida ${index}` }, ok);
    await test(`POST /inventario/traslado ${index + 1}`, 'POST', '/inventario/traslado', { productId: products[index].id, fromWarehouseId: warehouses[index].id, toWarehouseId: warehouses[(index + 1) % 10].id, quantity: 1, reason: `Traslado ${index}` }, ok);
    await test(`POST /inventario/ajuste ${index + 1}`, 'POST', '/inventario/ajuste', { productId: products[index].id, warehouseId: warehouses[index].id, quantity: 15 + index, reason: `Ajuste ${index}` }, ok);
    await test(`GET /inventario/productos/:id ${index + 1}`, 'GET', `/inventario/productos/${products[index].id}`, undefined, ok);
    await test(`GET /inventario/bodegas/:id ${index + 1}`, 'GET', `/inventario/bodegas/${warehouses[index].id}`, undefined, ok);
  }
  await test('GET /inventario/movimientos', 'GET', '/inventario/movimientos', undefined, ok);

  for (let index = 0; index < 10; index++) {
    const price = await test(`POST /productos/:id/precios ${index + 1}`, 'POST', `/productos/${products[index].id}/precios`, { name: `Precio prueba ${index}`, price: 1500 + index, isDefault: false }, ok);
    if (!price?.id) continue;
    await test(`GET /precios-producto/:id ${index + 1}`, 'GET', `/precios-producto/${price.id}`, undefined, ok);
    await test(`PATCH /precios-producto/:id ${index + 1}`, 'PATCH', `/precios-producto/${price.id}`, { price: 1600 + index, reason: `Cambio ${index}` }, ok);
    await test(`GET /precios-producto/:id/historial ${index + 1}`, 'GET', `/precios-producto/${price.id}/historial`, undefined, ok);
    await test(`PATCH /precios-producto/:id/default ${index + 1}`, 'PATCH', `/precios-producto/${price.id}/default`, undefined, ok);
  }
  await test('GET /precios-producto', 'GET', '/precios-producto', undefined, ok);

  for (let index = 0; index < 10; index++) {
    offers.push(await test(`POST /ofertas valid ${index + 1}`, 'POST', '/ofertas', { name: `${runId} Oferta ${index}`, discountType: index % 2 === 0 ? 'PORCENTAJE' : 'MONTO_FIJO', discountValue: index % 2 === 0 ? 10 : 500, isStackable: index % 3 === 0, productIds: [products[index].id], minimumProductQuantity: 1, maximumProductQuantity: 20 }, ok));
    if (!offers[index]?.id) continue;
    await test(`GET /ofertas/:id ${index + 1}`, 'GET', `/ofertas/${offers[index].id}`, undefined, ok);
    await test(`PATCH /ofertas/:id ${index + 1}`, 'PATCH', `/ofertas/${offers[index].id}`, { description: `Oferta actualizada ${index}` }, ok);
    await test(`POST /ofertas/aplicables ${index + 1}`, 'POST', '/ofertas/aplicables', { clientId: clients[index].id, items: [{ productId: products[index].id, productPriceId: products[index].prices[0].id, quantity: 2 }] }, ok);
  }
  await test('GET /ofertas', 'GET', '/ofertas', undefined, ok);

  for (let index = 0; index < 10; index++) {
    invoices.push(await test(`POST /facturas valid ${index + 1}`, 'POST', '/facturas', { clientId: clients[index].id, items: [{ productId: products[index].id, productPriceId: products[index].prices[0].id, quantity: 1 }] }, ok));
    if (!invoices[index]?.id) continue;
    await test(`GET /facturas/:id ${index + 1}`, 'GET', `/facturas/${invoices[index].id}`, undefined, ok);
    await test(`PATCH /facturas/:id ${index + 1}`, 'PATCH', `/facturas/${invoices[index].id}`, { consecutive: `${runId}-FAC-${index}` }, ok);
  }
  await test('GET /facturas', 'GET', '/facturas', undefined, ok);

  for (let index = 0; index < 10; index++) {
    await test(`POST /domicilios valid ${index + 1}`, 'POST', '/domicilios', { invoiceId: invoices[index].id, address: `Direccion ${index}`, recipientName: `Recibe ${index}`, recipientPhone: `32000000${index}`, notes: `Nota ${index}` }, ok);
  }
  await test('GET /domicilios', 'GET', '/domicilios', undefined, ok);

  for (let index = 0; index < 10; index++) {
    bankAccounts.push(await test(`POST /cuentas-bancarias valid ${index + 1}`, 'POST', '/cuentas-bancarias', { name: `${runId} Cuenta ${index}`, bankName: `Banco ${index}`, accountNumber: `${runId}-${index}`, accountType: 'AHORROS', currentBalance: 50000 + index }, ok));
    await test(`GET /cuentas-bancarias/:id ${index + 1}`, 'GET', `/cuentas-bancarias/${bankAccounts[index].id}`, undefined, ok);
    await test(`PATCH /cuentas-bancarias/:id ${index + 1}`, 'PATCH', `/cuentas-bancarias/${bankAccounts[index].id}`, { accountType: 'CORRIENTE' }, ok);
    await test(`POST /movimientos-bancarios/ingreso ${index + 1}`, 'POST', '/movimientos-bancarios/ingreso', { bankAccountId: bankAccounts[index].id, amount: 1000 + index, description: `Ingreso ${index}` }, ok);
    await test(`POST /movimientos-bancarios/egreso ${index + 1}`, 'POST', '/movimientos-bancarios/egreso', { bankAccountId: bankAccounts[index].id, amount: 100 + index, description: `Egreso ${index}` }, ok);
  }
  await test('POST /movimientos-bancarios/transferencia', 'POST', '/movimientos-bancarios/transferencia', { fromBankAccountId: bankAccounts[0].id, toBankAccountId: bankAccounts[1].id, amount: 500, description: 'Transferencia prueba' }, ok);
  await test('POST /movimientos-bancarios/ajuste', 'POST', '/movimientos-bancarios/ajuste', { bankAccountId: bankAccounts[0].id, balance: 12345, description: 'Ajuste prueba' }, ok);
  await test('GET /cuentas-bancarias', 'GET', '/cuentas-bancarias', undefined, ok);
  await test('GET /movimientos-bancarios', 'GET', '/movimientos-bancarios', undefined, ok);

  for (let index = 0; index < 10; index++) {
    const credit = await test(`POST /facturas/:id/credito ${index + 1}`, 'POST', `/facturas/${invoices[index].id}/credito`, { dueDate: '2030-01-01T00:00:00.000Z' }, ok);
    if (!credit?.id) continue;
    await test(`GET /creditos/:id ${index + 1}`, 'GET', `/creditos/${credit.id}`, undefined, ok);
    await test(`POST /creditos/:id/pagos ${index + 1}`, 'POST', `/creditos/${credit.id}/pagos`, { amount: 100, notes: `Pago ${index}` }, ok);
    await test(`PATCH /creditos/:id/estado ${index + 1}`, 'PATCH', `/creditos/${credit.id}/estado`, { status: 'PARCIAL' }, ok);
  }
  await test('GET /creditos', 'GET', '/creditos', undefined, ok);
  await test('GET /clientes/:id/creditos', 'GET', `/clientes/${clients[0].id}/creditos`, undefined, ok);

  for (let index = 0; index < 10; index++) {
    quotes.push(await test(`POST /cotizaciones valid ${index + 1}`, 'POST', '/cotizaciones', { clientId: clients[index].id, expiresAt: '2030-01-01T00:00:00.000Z', items: [{ productId: products[index].id, productPriceId: products[index].prices[0].id, quantity: 1 }] }, ok));
    if (!quotes[index]?.id) continue;
    await test(`GET /cotizaciones/:id ${index + 1}`, 'GET', `/cotizaciones/${quotes[index].id}`, undefined, ok);
    await test(`PATCH /cotizaciones/:id ${index + 1}`, 'PATCH', `/cotizaciones/${quotes[index].id}`, { expiresAt: '2030-02-01T00:00:00.000Z' }, ok);
    await test(`PATCH /cotizaciones/:id/estado ${index + 1}`, 'PATCH', `/cotizaciones/${quotes[index].id}/estado`, { status: 'APROBADA' }, ok);
  }
  await test('POST /cotizaciones/:id/convertir-factura', 'POST', `/cotizaciones/${quotes[0].id}/convertir-factura`, undefined, ok);
  await test('GET /cotizaciones', 'GET', '/cotizaciones', undefined, ok);

  const referrer = await test('POST /clientes/:id/codigo-referido', 'POST', `/clientes/${clients[0].id}/codigo-referido`, undefined, ok);
  for (let index = 1; index < 10; index++) {
    await test(`POST /referidos valid ${index}`, 'POST', '/referidos', { referredClientId: clients[index].id, codeUsed: referrer.referralCode }, ok);
  }
  await test('GET /referidos', 'GET', '/referidos', undefined, ok);
  await test('GET /clientes/:id/referidos', 'GET', `/clientes/${clients[0].id}/referidos`, undefined, ok);
  await test('PATCH /clientes/:id/nivel-referido', 'PATCH', `/clientes/${clients[0].id}/nivel-referido`, { referralLevel: 3 }, ok);

  const user = await test('POST /usuarios valid', 'POST', '/usuarios', { clientId: clients[0].id, username: `${runId}_user`, password: 'secret123', role: 'ADMIN' }, ok);
  await test('GET /usuarios', 'GET', '/usuarios', undefined, ok);
  await test('GET /usuarios/:id', 'GET', `/usuarios/${user.id}`, undefined, ok);
  await test('PATCH /usuarios/:id', 'PATCH', `/usuarios/${user.id}`, { role: 'CONTADOR' }, ok);
  await test('DELETE /usuarios/:id', 'DELETE', `/usuarios/${user.id}`, undefined, ok);

  await test('FAIL duplicate provider name', 'POST', '/proveedores', { name: providers[0].name }, fail);
  await test('FAIL invalid product provider', 'POST', '/productos', { productTypeId: productTypes[0].id, providerId: 999999, name: 'Bad product', taxRate: 19, brand: 'Bad', minimumStock: 1 }, fail);
  await test('FAIL negative inventory', 'POST', '/inventario/entrada', { productId: products[0].id, toWarehouseId: warehouses[0].id, quantity: -1 }, fail);
  await test('FAIL insufficient stock', 'POST', '/inventario/salida', { productId: products[0].id, fromWarehouseId: warehouses[0].id, quantity: 999999 }, fail);
  await test('FAIL invalid percentage offer', 'POST', '/ofertas', { name: 'Bad offer', discountType: 'PORCENTAJE', discountValue: 150 }, fail);
  await test('FAIL duplicate credit', 'POST', `/facturas/${invoices[0].id}/credito`, { dueDate: '2030-01-01T00:00:00.000Z' }, fail);
  await test('FAIL credit overpay', 'POST', '/creditos/1/pagos', { amount: 999999999 }, fail);
  await test('FAIL transfer same account', 'POST', '/movimientos-bancarios/transferencia', { fromBankAccountId: bankAccounts[0].id, toBankAccountId: bankAccounts[0].id, amount: 1 }, fail);
  await test('FAIL self referral', 'POST', '/referidos', { referredClientId: clients[0].id, codeUsed: referrer.referralCode }, fail);
  await test('FAIL quote expired conversion', 'POST', '/cotizaciones', { clientId: clients[0].id, expiresAt: '2020-01-01T00:00:00.000Z', items: [{ productId: products[0].id, quantity: 1 }] }, ok).then(async (quote: any) => {
    if (quote?.id) await test('FAIL convert expired quote', 'POST', `/cotizaciones/${quote.id}/convertir-factura`, undefined, fail);
  });

  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  console.log(`\nAPI URL: ${API_URL}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed.length}`);
  for (const result of failed) {
    console.log(`FAIL | ${result.status} | ${result.name} | ${result.error}`);
  }
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
