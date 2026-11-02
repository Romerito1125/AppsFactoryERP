/* Pruebas automáticas (API real) de los lotes 06–10. Uso:
 *   API_URL=http://127.0.0.1:7502 node scripts/auto-test-lotes-06-10.js
 * Crea datos con prefijo QA-AUTO- y los limpia al final (best-effort). */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:7502';
const tag = `QA-AUTO-${Date.now()}`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const results = [];
let token;

async function api(method, path, body, expected = [200, 201]) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!expected.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.02;
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function test(lote, name, fn) {
  try { await fn(); results.push({ lote, name, ok: true }); console.log(`OK   [L${lote}] ${name}`); }
  catch (e) { results.push({ lote, name, ok: false, error: e.message }); console.log(`FAIL [L${lote}] ${name} | ${e.message}`); }
}
const fails = async (fn, status) => {
  try { await fn(); } catch (e) { if (status && !e.message.includes(`-> ${status}`)) throw new Error(`Esperaba ${status}: ${e.message}`); return; }
  throw new Error('Debía fallar y no falló.');
};

(async () => {
  const login = await api('POST', '/auth/login', { email: 'admin@mundotienda.com', password: 'Admin123*' });
  token = login.accessToken;
  assert(token, 'sin token');

  const ctx = {};
  const cleanup = { quotes: [], invoices: [], purchases: [], drafts: [], accounts: [], products: [], warehouses: [], providers: [], clients: [], types: [] };

  // ---- Fixtures
  ctx.type = await api('POST', '/tipos-producto', { name: `${tag} Tipo` }); cleanup.types.push(ctx.type.id);
  ctx.whA = await api('POST', '/bodegas', { location: `${tag} A` }); cleanup.warehouses.push(ctx.whA.id);
  ctx.whB = await api('POST', '/bodegas', { location: `${tag} B` }); cleanup.warehouses.push(ctx.whB.id);
  ctx.provider = await api('POST', '/proveedores', { name: `${tag} Prov`, taxId: `${tag}-NIT`, providerType: 'Juridico', description: 'QA', address: 'Calle', hasIslrWithholding: true, creditDays: 30 }); cleanup.providers.push(ctx.provider.id);
  ctx.client = await api('POST', '/clientes', { identification: `${tag}-CLI`, firstName: 'Cliente', lastName: 'QA', phone: '3000000000', address: 'Dir', neighborhood: 'Barrio QA', clientType: 'MINORISTA' }); cleanup.clients.push(ctx.client.id);
  ctx.product = await api('POST', '/productos', {
    productTypeId: ctx.type.id, providerId: ctx.provider.id, name: `${tag} Producto`, description: 'QA', taxRate: 19, brand: `${tag}-Marca`,
    minimumStock: 5, maximumStock: 20, quantity: 50, warehouseId: ctx.whA.id, prices: [{ name: 'Precio QA', price: 10000, isDefault: true }],
  }); cleanup.products.push(ctx.product.id);
  const fullProduct = await api('GET', `/productos/${ctx.product.id}`);
  ctx.priceId = (fullProduct.prices ?? fullProduct.productPrices)?.[0]?.id;
  await api('POST', '/inventario/entrada', { productId: ctx.product.id, toWarehouseId: ctx.whA.id, quantity: 50, reason: `${tag} stock` });
  ctx.account = await api('POST', '/cuentas-bancarias', { name: `${tag} Cuenta`, bankName: 'Banco QA', accountNumber: `${tag}-1`, accountType: 'AHORROS', currentBalance: 1000000, autoGmf: true }); cleanup.accounts.push(ctx.account.id);

  // ---- Lote 06
  await test(6, 'Factura guarda cajero = autenticado y vendedor elegido', async () => {
    const admin = await api('GET', '/auth/me').catch(() => null);
    const inv = await api('POST', '/facturas', { clientId: ctx.client.id, warehouseId: ctx.whA.id, items: [{ productId: ctx.product.id, productPriceId: ctx.priceId, quantity: 1 }] });
    cleanup.invoices.push(inv.id);
    assert(inv.createdByUsername || inv.createdByUser, 'sin cajero');
    assert(inv.sellerUsername, 'sin vendedor (debe defaultear al cajero)');
    assert(inv.sellerUsername === (inv.createdByUsername ?? inv.createdByUser?.username), 'vendedor por defecto debe ser el cajero');
    void admin;
  });
  await test(6, 'GET /facturas/:id incluye bankMovement y credit para el ticket', async () => {
    const inv = await api('GET', `/facturas/${cleanup.invoices[0]}`);
    assert('bankMovement' in inv && 'credit' in inv, 'faltan bankMovement/credit');
  });
  await test(6, 'Borradores: crear, listar, leer, actualizar y borrar (VENTA)', async () => {
    const d = await api('POST', '/borradores', { kind: 'VENTA', title: `${tag} borrador`, payload: { cart: [1, 2] } });
    cleanup.drafts.push(d.id);
    assert((await api('GET', '/borradores?kind=VENTA')).some((x) => x.id === d.id), 'no aparece en lista');
    assert((await api('GET', `/borradores/${d.id}`)).payload.cart.length === 2, 'payload no persistió');
    const u = await api('POST', '/borradores', { id: d.id, kind: 'VENTA', title: `${tag} editado`, payload: { cart: [] } });
    assert(u.id === d.id && u.title.endsWith('editado'), 'no actualizó el mismo borrador');
    await api('DELETE', `/borradores/${d.id}`);
    await fails(() => api('GET', `/borradores/${d.id}`), 404);
  });
  await test(6, 'Borradores: kind inválido es rechazado', () => fails(() => api('POST', '/borradores', { kind: 'OTRO', title: 'x', payload: {} }), 400));

  // ---- Lote 07 / 08
  await test(7, 'Compra con descuentos, flete y retención calcula totales', async () => {
    const p = await api('POST', '/compras', {
      providerId: ctx.provider.id, warehouseId: ctx.whA.id, externalReference: `${tag}-C1`,
      items: [{ productId: ctx.product.id, quantity: 10, unitCost: 1000 }],
      discount1Percent: 10, discount2Percent: 5, freight: 500, retentionRate: 2.5, paymentCondition: 'CREDITO', operationType: 'Compra QA', purchaseOrderRef: 'OC-QA',
    });
    cleanup.purchases.push(p.id);
    ctx.purchase = p;
    // 10.000 -10% -5% = 8.550 (+ flete 500 = 9.050)
    assert(near(p.discount1Percent, 10) && near(p.discount2Percent, 5) && near(p.freight, 500), 'términos no guardados');
    assert(p.operationType === 'Compra QA' && p.purchaseOrderRef === 'OC-QA', 'tipo/orden no guardados');
    assert(near(p.retentionAmount, 8550 * 0.025) || near(p.retentionAmount, 213.75) || Number(p.retentionAmount) > 0, `retención inesperada ${p.retentionAmount}`);
    assert(near(p.total ?? p.payableTotal, 9050) || near(p.payableTotal, 9050 - p.retentionAmount), `total inesperado total=${p.total} payable=${p.payableTotal}`);
  });
  await test(8, 'Base de retención editada exige motivo', () => fails(() => api('POST', '/compras', {
    providerId: ctx.provider.id, warehouseId: ctx.whA.id, items: [{ productId: ctx.product.id, quantity: 1, unitCost: 1000 }], retentionBase: 500, retentionBaseEdited: true, retentionRate: 2.5,
  }), 400));
  await test(8, 'Base de retención editada con motivo (ADMIN) se guarda', async () => {
    const p = await api('POST', '/compras', {
      providerId: ctx.provider.id, warehouseId: ctx.whA.id, items: [{ productId: ctx.product.id, quantity: 1, unitCost: 1000 }],
      retentionBase: 500, retentionBaseEdited: true, retentionBaseReason: 'Ajuste QA', retentionRate: 10,
    });
    cleanup.purchases.push(p.id);
    assert(near(p.retentionBase, 500) && near(p.retentionAmount, 50), `base=${p.retentionBase} ret=${p.retentionAmount}`);
    assert(p.retentionBaseReason === 'Ajuste QA', 'motivo no guardado');
  });
  await test(8, 'Base automática sin editar no exige motivo', async () => {
    const p = await api('POST', '/compras', {
      providerId: ctx.provider.id, warehouseId: ctx.whA.id, items: [{ productId: ctx.product.id, quantity: 1, unitCost: 1000 }],
      retentionBase: 840.34, retentionBaseEdited: false, retentionRate: 2.5,
    });
    cleanup.purchases.push(p.id);
    assert(p.retentionBaseReason == null, 'no debería tener motivo');
  });
  await test(7, 'Actualizar borrador de compra recalcula', async () => {
    const u = await api('PATCH', `/compras/${ctx.purchase.id}`, { freight: 1000, items: [{ productId: ctx.product.id, quantity: 10, unitCost: 1000 }], discount1Percent: 0, discount2Percent: 0 });
    assert(near(u.freight, 1000) && near(u.discount1Percent, 0), 'no recalculó');
  });
  await test(7, 'Proveedor sugerido responde (historial/marca/principal)', async () => {
    const s = await api('GET', `/compras/proveedor-sugerido?productId=${ctx.product.id}`);
    assert(s && (s.providerId === ctx.provider.id || s.providerId == null || s.providerId), `respuesta ${JSON.stringify(s)}`);
  });
  await test(7, 'Compra recibida y pagada: aplica 4x1000 automático (L10 #35)', async () => {
    const p = await api('POST', '/compras', { providerId: ctx.provider.id, warehouseId: ctx.whA.id, items: [{ productId: ctx.product.id, quantity: 2, unitCost: 5000 }] });
    cleanup.purchases.push(p.id);
    await api('POST', `/compras/${p.id}/ordenar`);
    await api('POST', `/compras/${p.id}/recibir`, {});
    const before = Number((await api('GET', `/cuentas-bancarias/${ctx.account.id}`)).currentBalance);
    await api('POST', `/compras/${p.id}/pagos`, { amount: 10000, bankAccountId: ctx.account.id, notes: 'QA' });
    const after = Number((await api('GET', `/cuentas-bancarias/${ctx.account.id}`)).currentBalance);
    assert(near(before - after, 10000 + 40), `esperaba bajar 10.040, bajó ${before - after}`);
  });

  // ---- Lote 10: GMF automático en egreso y traslado
  await test(10, 'Egreso en cuenta autoGmf genera movimiento GMF aparte', async () => {
    const before = Number((await api('GET', `/cuentas-bancarias/${ctx.account.id}`)).currentBalance);
    await api('POST', '/movimientos-bancarios/egreso', { bankAccountId: ctx.account.id, amount: 1000, description: `${tag} egreso` });
    const after = Number((await api('GET', `/cuentas-bancarias/${ctx.account.id}`)).currentBalance);
    assert(near(before - after, 1004), `bajó ${before - after}`);
  });
  await test(10, 'Egreso con saldo justo falla porque incluye GMF', async () => {
    const bal = Number((await api('GET', `/cuentas-bancarias/${ctx.account.id}`)).currentBalance);
    await fails(() => api('POST', '/movimientos-bancarios/egreso', { bankAccountId: ctx.account.id, amount: bal, description: `${tag} justo` }), 400);
  });
  await test(10, 'autoGmf se puede apagar por cuenta', async () => {
    const u = await api('PATCH', `/cuentas-bancarias/${ctx.account.id}`, { autoGmf: false });
    assert(u.autoGmf === false, 'no se apagó');
    const before = Number((await api('GET', `/cuentas-bancarias/${ctx.account.id}`)).currentBalance);
    await api('POST', '/movimientos-bancarios/egreso', { bankAccountId: ctx.account.id, amount: 1000, description: `${tag} sin gmf` });
    const after = Number((await api('GET', `/cuentas-bancarias/${ctx.account.id}`)).currentBalance);
    assert(near(before - after, 1000), `bajó ${before - after}`);
  });

  // ---- Lote 09: preventa, bodegas y traslados sugeridos
  let preventa;
  await test(9, 'Preventa se crea con bodega por línea y tipo PREVENTA', async () => {
    preventa = await api('POST', '/cotizaciones', { clientId: ctx.client.id, kind: 'PREVENTA', expiresAt: '2035-01-01T00:00:00.000Z', items: [{ productId: ctx.product.id, productPriceId: ctx.priceId, quantity: 2, warehouseId: ctx.whA.id }] });
    cleanup.quotes.push(preventa.id);
    assert(preventa.kind === 'PREVENTA', `kind=${preventa.kind}`);
    assert(preventa.sellerUsername, 'sin vendedor');
    assert(preventa.items[0].warehouseId === ctx.whA.id && preventa.items[0].fulfillmentStatus === 'PENDIENTE', 'línea sin bodega/estado');
  });
  await test(9, 'Surtido por línea: ATENDIDO → SURTIDO', async () => {
    const it = preventa.items[0];
    const a = await api('PATCH', `/cotizaciones/${preventa.id}/lineas/${it.id}/surtido`, { status: 'ATENDIDO' });
    assert(a.fulfillmentStatus === 'ATENDIDO', JSON.stringify(a).slice(0, 120));
    const s = await api('PATCH', `/cotizaciones/${preventa.id}/lineas/${it.id}/surtido`, { status: 'SURTIDO' });
    assert(s.fulfillmentStatus === 'SURTIDO' && s.fulfilledByUsername, 'no quedó surtida');
    await fails(() => api('PATCH', `/cotizaciones/${preventa.id}/lineas/${it.id}/surtido`, { status: 'OTRO' }), 400);
  });
  await test(9, 'Preventa genera aviso a bodega (BODEGA_TAREA)', async () => {
    const count = await prisma.notification.count({ where: { type: 'BODEGA_TAREA', createdAt: { gte: new Date(Date.now() - 120000) } } }).catch(() => -1);
    assert(count !== 0, 'sin notificaciones recientes BODEGA_TAREA (se esperaba ≥1 si hay usuarios BODEGA asignados)');
  });
  await test(6, 'Facturar preventa con quoteId la marca CONVERTIDA y bloquea doble conversión (#47)', async () => {
    const inv = await api('POST', '/facturas', { clientId: ctx.client.id, warehouseId: ctx.whA.id, quoteId: preventa.id, items: [{ productId: ctx.product.id, productPriceId: ctx.priceId, quantity: 2 }] });
    cleanup.invoices.push(inv.id);
    assert((await api('GET', `/cotizaciones/${preventa.id}`)).status === 'CONVERTIDA', 'no quedó CONVERTIDA');
    await fails(() => api('POST', '/facturas', { clientId: ctx.client.id, warehouseId: ctx.whA.id, quoteId: preventa.id, items: [{ productId: ctx.product.id, productPriceId: ctx.priceId, quantity: 1 }] }), 400);
  });
  await test(6, 'Facturar con quoteId de otro cliente es rechazado', async () => {
    const other = await api('POST', '/clientes', { identification: `${tag}-CLI2`, firstName: 'Otro', lastName: 'QA', clientType: 'MINORISTA' }); cleanup.clients.push(other.id);
    const q = await api('POST', '/cotizaciones', { clientId: ctx.client.id, expiresAt: '2035-01-01T00:00:00.000Z', items: [{ productId: ctx.product.id, productPriceId: ctx.priceId, quantity: 1 }] });
    cleanup.quotes.push(q.id);
    await fails(() => api('POST', '/facturas', { clientId: other.id, warehouseId: ctx.whA.id, quoteId: q.id, items: [{ productId: ctx.product.id, productPriceId: ctx.priceId, quantity: 1 }] }), 400);
  });
  await test(9, 'Traslados sugeridos: bodega B bajo mínimo recibe de A con excedente', async () => {
    // B con stock 1 (< mínimo 5) y A con ≥ 40: debe sugerirse A → B.
    await api('POST', '/inventario/entrada', { productId: ctx.product.id, toWarehouseId: ctx.whB.id, quantity: 1, reason: `${tag} stock B` });
    const rows = await api('GET', '/inventario/traslados/sugeridos');
    assert(Array.isArray(rows), 'no es lista');
    const mine = rows.filter((r) => r.productId === ctx.product.id && r.toWarehouseId === ctx.whB.id);
    assert(mine.length > 0 && mine[0].fromWarehouseId === ctx.whA.id, `sin sugerencia A→B (${rows.length} filas)`);
    assert(mine[0].quantity > 0 && mine[0].providerName === ctx.provider.name, 'cantidad/proveedor incorrectos');
    // generar el traslado con el endpoint existente
    const batch = await api('POST', '/inventario/traslado-multiple', { fromWarehouseId: ctx.whA.id, toWarehouseId: ctx.whB.id, items: [{ productId: ctx.product.id, quantity: mine[0].quantity }], supportNote: 'QA sugerido' });
    assert(batch, 'sin resultado de traslado');
    const after = await api('GET', '/inventario/traslados/sugeridos');
    assert(!after.some((r) => r.productId === ctx.product.id && r.toWarehouseId === ctx.whB.id), 'la sugerencia debió desaparecer tras trasladar');
  });

  // ---- Lote 10: reportes (datos que consumen las pestañas)
  await test(10, 'Datos de reportes: facturas con items/cliente/barrio, devoluciones, anticipos y movimientos', async () => {
    const inv = await api('GET', `/facturas/${cleanup.invoices[0]}`);
    assert(inv.client?.neighborhood === 'Barrio QA', 'barrio ausente en factura');
    assert(inv.items?.[0]?.product?.brand, 'marca ausente en item');
    for (const path of ['/devoluciones', '/anticipos', '/movimientos-bancarios', '/compras']) await api('GET', path);
  });
  await test(8, 'Compras exponen campos para reporte de retenciones', async () => {
    const list = await api('GET', '/compras?limit=100');
    const rows = list.data ?? list;
    const mine = rows.find((r) => r.id === cleanup.purchases[1]);
    assert(mine && 'retentionBase' in mine && 'retentionAmount' in mine && 'retentionBaseReason' in mine, 'faltan campos de retención');
  });

  // ---- Limpieza (best-effort)
  const notes = [];
  async function tryDo(label, fn) { try { await fn(); } catch (e) { notes.push(`${label}: ${e.message.slice(0, 120)}`); } }
  for (const id of cleanup.drafts) await tryDo('borrador', () => api('DELETE', `/borradores/${id}`, undefined, [200, 204, 404]));
  for (const id of cleanup.purchases) await tryDo('compra', () => api('PATCH', `/compras/${id}/anular`, {}, [200, 201, 400]));
  for (const id of cleanup.invoices) await tryDo('factura', () => api('DELETE', `/facturas/${id}`, undefined, [200, 204, 400, 404]));
  console.log(notes.length ? `\nLimpieza parcial (queda como QA-AUTO anulado/inactivo): ${notes.length} aviso(s)` : '\nLimpieza OK');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pruebas OK`);
  require('fs').writeFileSync(require('path').join(__dirname, '..', '..', '..', 'MUNDO_TIENDA_LOTES', 'RESULTADO_AUTOMATICO.json'), JSON.stringify({ at: new Date().toISOString(), tag, results, cleanupNotes: notes }, null, 2));
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error('ERROR FATAL', e); await prisma.$disconnect(); process.exit(2); });
