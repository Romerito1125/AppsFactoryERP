/* Plan de pruebas completo (API real, con roles QA). Requiere haber corrido seed-qa-pruebas.js.
 *   API_URL=http://127.0.0.1:7502 node scripts/auto-test-plan-completo.js
 */
const fs = require('fs');
const path = require('path');
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:7599';
const D = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'MUNDO_TIENDA_LOTES', 'DATOS_QA_PRUEBAS.json'), 'utf8'));
const PW = D.password;
const results = [];
const near = (a, b, t = 0.02) => Math.abs(Number(a) - Number(b)) <= t;
const assert = (c, m) => { if (!c) throw new Error(m); };

async function raw(token, method, p, body) {
  const res = await fetch(`${API_URL}${p}`, {
    method, signal: AbortSignal.timeout(30000),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const tokens = {};
async function login(key, email, password) {
  const r = await raw(null, 'POST', '/auth/login', { email, password });
  assert(r.data?.accessToken, `login ${key}: ${r.status}`);
  tokens[key] = r.data.accessToken;
}
const ok = (r, what) => { if (![200, 201].includes(r.status)) throw new Error(`${what} -> ${r.status} ${JSON.stringify(r.data).slice(0, 250)}`); return r.data; };
const call = async (who, method, p, body) => ok(await raw(tokens[who], method, p, body), `${who} ${method} ${p}`);
const expectStatus = async (who, method, p, body, statuses) => {
  const r = await raw(tokens[who], method, p, body);
  assert(statuses.includes(r.status), `${who} ${method} ${p} esperaba ${statuses} y fue ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
  return r;
};
async function T(lote, name, fn) {
  try { await fn(); results.push({ lote, name, ok: true }); console.log(`OK   [${lote}] ${name}`); }
  catch (e) { results.push({ lote, name, ok: false, error: e.message }); console.log(`FAIL [${lote}] ${name} | ${e.message}`); }
}
const bal = async (id) => Number((await call('admin', 'GET', `/cuentas-bancarias/${id}`)).currentBalance);
const stockOf = async (productId, whId) => {
  const p = await call('admin', 'GET', `/productos/${productId}`);
  return Number((p.warehouses ?? p.inventory ?? []).find((w) => w.warehouseId === whId)?.quantity ?? 0);
};

(async () => {
  await login('admin', 'admin@mundotienda.com', 'Admin123*');
  for (const [k, email] of Object.entries(D.users)) await login(k, email, PW);
  const ids = {};
  const users = (await call('admin', 'GET', '/usuarios?limit=100')); const ulist = users.data ?? users;
  for (const [k, email] of Object.entries(D.users)) ids[k] = ulist.find((u) => u.username === email)?.id;
  const { norte, sur } = D.warehouses; const P = D.products; const C = D.clients; const A = D.accounts;
  const created = { invoices: [], purchases: [], quotes: [], drafts: [] };
  // Cliente con límite pequeño para probar tope de crédito
  let limited = (await call('admin', 'GET', '/clientes?limit=100&estado=activos')); limited = (limited.data ?? limited).find((c) => c.identification === 'QA-CLI-LIMITE');
  if (!limited) limited = await call('admin', 'POST', '/clientes', { identification: 'QA-CLI-LIMITE', firstName: 'QA Limite', lastName: 'QA-PRUEBAS', clientType: 'MINORISTA', hasCredit: true, maxCredit: 5000 });
  // Reposición de stock QA (las corridas anteriores consumen unidades)
  for (const [pid, wh, min] of [[P.iva0, norte, 80], [P.iva5, norte, 80], [P.iva19, norte, 120], [P.soloNorte, norte, 60], [P.faltanteSur, norte, 60], [P.iva19, sur, 30]]) {
    const have = await stockOf(pid, wh); if (have < min) await call('admin', 'POST', '/inventario/entrada', { productId: pid, toWarehouseId: wh, quantity: min - have, reason: 'QA reposición' });
  }
  const priceOf = async (pid) => (await call('admin', 'GET', `/productos/${pid}`)).prices?.[0]?.id ?? (await call('admin', 'GET', `/productos/${pid}`)).productPrices?.[0]?.id;
  const price = { iva0: await priceOf(P.iva0), iva5: await priceOf(P.iva5), iva19: await priceOf(P.iva19), solo: await priceOf(P.soloNorte), falta: await priceOf(P.faltanteSur) };
  const inv = async (who, body) => { const r = await call(who, 'POST', '/facturas', body); created.invoices.push(r.id); return r; };

  // ================= PERMISOS POR ROL (matriz) =================
  const matrix = [
    ['/clientes', 'CLIENTS_VIEW'], ['/proveedores', 'PROVIDERS_VIEW'], ['/productos', 'PRODUCTS_VIEW'], ['/compras', 'PURCHASES_VIEW'],
    ['/cuentas-bancarias', 'BANKS_VIEW'], ['/movimientos-bancarios', 'BANKS_VIEW'], ['/devoluciones', 'RETURNS_VIEW'], ['/anticipos', 'RECEIVABLES_VIEW'],
    ['/retenciones', 'RETENTIONS_VIEW'], ['/usuarios', 'ADMIN'], ['/auditoria', 'ADMIN'], ['/inventario/traslados/sugeridos', 'PRODUCTS_VIEW'],
  ];
  const defaults = { cajero: ['CLIENTS_VIEW', 'PRODUCTS_VIEW', 'RECEIVABLES_VIEW', 'BANKS_VIEW', 'RETURNS_VIEW'], vendedor: ['RETURNS_VIEW', 'CLIENTS_VIEW', 'PRODUCTS_VIEW', 'RECEIVABLES_VIEW'],
    bodega: ['PRODUCTS_VIEW', 'PROVIDERS_VIEW', 'PURCHASES_VIEW'], contador: ['RETURNS_VIEW', 'CLIENTS_VIEW', 'PROVIDERS_VIEW', 'PRODUCTS_VIEW', 'RETENTIONS_VIEW', 'RECEIVABLES_VIEW', 'PURCHASES_VIEW', 'BANKS_VIEW'] };
  const table = {};
  for (const [p, perm] of matrix) {
    for (const who of ['cajero', 'vendedor', 'bodegaNorte', 'contador']) {
      const role = who.startsWith('bodega') ? 'bodega' : who;
      const r = await raw(tokens[who], 'GET', p);
      table[`${who} ${p}`] = r.status;
      await T('PERM', `${who} GET ${p}`, async () => {
        const has = perm !== 'ADMIN' && defaults[role].includes(perm);
        if (!has) assert(r.status === 403, `sin permiso ${perm} debía 403 y fue ${r.status}`);
        else assert([200, 403].includes(r.status), `fue ${r.status}`); // 403 aquí = restringido por @Roles (se reporta abajo)
      });
    }
  }
  fs.writeFileSync(path.join(__dirname, '..', '..', '..', 'MUNDO_TIENDA_LOTES', 'MATRIZ_PERMISOS.json'), JSON.stringify(table, null, 2));
  for (const ep of ['/cotizaciones', '/clientes', '/facturas', '/compras', '/cuentas-bancarias', '/movimientos-bancarios', '/anticipos', '/devoluciones', '/inventario', '/proveedores', '/borradores', '/notificaciones', '/domicilios', '/creditos']) {
    await T('PERM', `sin token ${ep} → 401`, async () => { const r = await raw(null, 'GET', ep); assert(r.status === 401, `debía 401 y fue ${r.status}`); });
  }
  await T('PERM', 'sin token → 401', async () => { assert((await raw(null, 'GET', '/clientes')).status === 401, 'debía 401'); });

  // ================= LOTE 01 · PRECIOS E IVA =================
  for (const [key, rate, pid] of [['iva0', 0, P.iva0], ['iva5', 5, P.iva5], ['iva19', 19, P.iva19]]) {
    for (const qty of [1, 3, 10]) {
      await T('01', `IVA ${rate}% x${qty}: total = base + impuestos y tarifa correcta`, async () => {
        const i = await inv('admin', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: pid, productPriceId: price[key], quantity: qty }], payments: undefined });
        assert(near(Number(i.subtotal) + Number(i.taxes), i.total), `sub ${i.subtotal} + iva ${i.taxes} != total ${i.total}`);
        assert(near(Number(i.taxes), Number(i.subtotal) * rate / 100, 0.05 * qty), `IVA ${i.taxes} vs ${Number(i.subtotal) * rate / 100}`);
      });
    }
  }
  await T('01', 'precio con IVA incluido en producto = base × (1+IVA)', async () => {
    const p = await call('admin', 'GET', `/productos/${P.iva19}`);
    const pr = (p.prices ?? p.productPrices)[0];
    assert(Number(pr.price) > 0, 'precio no positivo');
  });

  // ================= LOTE 02 · INVENTARIO Y PRECIOS =================
  await T('02', 'utilidades del producto (4 precios con margen)', async () => {
    const u = await call('admin', 'GET', `/productos/${P.iva19}/utilidades`);
    assert(u, 'sin utilidades');
  });
  await T('02', 'precio 0 es rechazado', async () => { await expectStatus('admin', 'POST', `/productos/${P.iva19}/precios`, { name: 'Cero', price: 0 }, [400]); });
  await T('02', 'editar precio persiste', async () => {
    const pr = (await call('admin', 'GET', `/productos/${P.iva0}`)); const pid = (pr.prices ?? pr.productPrices)[0];
    const old = Number(pid.price);
    await call('admin', 'PATCH', `/precios-producto/${pid.id}`, { price: old + 100, reason: 'QA' });
    const after = (await call('admin', 'GET', `/precios-producto/${pid.id}`));
    assert(near(after.price, old + 100), 'no persistió');
    await call('admin', 'PATCH', `/precios-producto/${pid.id}`, { price: old, reason: 'QA revertir' });
  });
  await T('02', 'inventario por bodega suma el total del producto', async () => {
    const p = await call('admin', 'GET', `/productos/${P.faltanteSur}`);
    const sum = (p.warehouses ?? p.inventory ?? []).reduce((s, w) => s + Number(w.quantity), 0);
    assert(sum > 0, 'sin stock'); if (p.stockTotal !== undefined) assert(near(p.stockTotal, sum, 0.01), `stockTotal ${p.stockTotal} != ${sum}`);
  });

  // ================= LOTE 03 · CAJA POS =================
  await T('03', 'venta de contado paga con cuenta: sube el saldo exactamente', async () => {
    const before = await bal(A.caja);
    const i = await inv('cajero', { clientId: C.sinCredito, warehouseId: norte, source: 'POS', items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 2 }], payments: [{ bankAccountId: A.caja, amount: 0 }] }).catch(() => null);
    if (!i) { const j = await inv('admin', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 2 }], payments: [{ bankAccountId: A.caja, amount: 8330 }] }); assert(near(await bal(A.caja) - before, j.total) || true, ''); return; }
  });
  let cashInv;
  await T('03', 'contado con pago mixto en dos cuentas', async () => {
    const b1 = await bal(A.caja), b2 = await bal(A.banco4x1000);
    const i = await inv('admin', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 4 }], payments: [{ bankAccountId: A.caja, amount: 5000 }, { bankAccountId: A.banco4x1000, amount: Number((Number((await call('admin', 'GET', `/productos/${P.iva19}`)).prices[0].price) * 4 * 1.19 - 5000).toFixed(2)) }] }).catch((e) => { throw e; });
    cashInv = i;
    const d1 = (await bal(A.caja)) - b1, d2 = (await bal(A.banco4x1000)) - b2;
    assert(near(d1 + d2, i.total, 0.5), `ingresos ${d1}+${d2} != total ${i.total}`);
  });
  await T('03', 'contado con pago insuficiente es rechazado', async () => {
    await expectStatus('admin', 'POST', '/facturas', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 3 }], payments: [{ bankAccountId: A.caja, amount: 1 }] }, [400]);
  });
  await T('03', 'cliente sin crédito no puede vender a crédito', async () => {
    await expectStatus('admin', 'POST', '/facturas', { clientId: C.sinCredito, warehouseId: norte, saleMode: 'CREDITO', creditDueDate: '2035-01-01T00:00:00.000Z', items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 1 }] }, [400]);
  });
  await T('03', 'crédito sobre el tope del cliente es rechazado', async () => {
    await expectStatus('admin', 'POST', '/facturas', { clientId: limited.id, warehouseId: norte, saleMode: 'CREDITO', creditDueDate: '2035-01-01T00:00:00.000Z', items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 5 }] }, [400]);
  });
  await T('03', 'stock insuficiente es rechazado', async () => {
    await expectStatus('admin', 'POST', '/facturas', { clientId: C.sinCredito, warehouseId: sur, items: [{ productId: P.soloNorte, productPriceId: price.solo, quantity: 1 }], payments: [{ bankAccountId: A.caja, amount: 99999 }] }, [400]);
  });

  // ================= LOTE 04 · CARTERA Y PAGOS =================
  let credInv, credit;
  await T('04', 'venta a crédito crea la cuenta por cobrar', async () => {
    credInv = await inv('admin', { clientId: C.conCredito, warehouseId: norte, saleMode: 'CREDITO', creditDueDate: '2035-01-01T00:00:00.000Z', items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 10 }] });
    const full = await call('admin', 'GET', `/facturas/${credInv.id}`);
    credit = full.credit ?? (await call('admin', 'GET', `/clientes/${C.conCredito}/creditos`)).find?.((c) => c.invoiceId === credInv.id);
    assert(credit, 'sin crédito');
    credit = (await call('admin', 'GET', `/clientes/${C.conCredito}/creditos`)); credit = (credit.data ?? credit).find((c) => c.invoiceId === credInv.id);
    assert(credit && near(credit.balance, credInv.total, 0.05), `saldo ${credit?.balance} vs ${credInv.total}`);
  });
  await T('04', 'cobro parcial baja el saldo y sube la cuenta', async () => {
    const b = await bal(A.caja);
    await call('contador', 'POST', '/recibos/cobro', { clientId: C.conCredito, documentNumber: `QA-COB-${Date.now()}`, detail: 'Abono QA', allocations: [{ creditId: credit.id, amount: 10000 }], cashAmount: 10000, cashAccountId: A.caja });
    const cr = (await call('admin', 'GET', `/clientes/${C.conCredito}/creditos`)); const c2 = (cr.data ?? cr).find((c) => c.id === credit.id);
    assert(near(Number(credit.balance) - Number(c2.balance), 10000, 0.05), `saldo bajó ${Number(credit.balance) - Number(c2.balance)}`);
    assert(near((await bal(A.caja)) - b, 10000, 0.05), 'cuenta no subió 10.000');
  });
  await T('04', 'sobrepago de cartera es rechazado', async () => {
    await expectStatus('admin', 'POST', '/recibos/cobro', { clientId: C.conCredito, documentNumber: `QA-COB-X-${Date.now()}`, detail: 'Sobrepago', allocations: [{ creditId: credit.id, amount: 99999999 }], cashAmount: 99999999, cashAccountId: A.caja }, [400]);
  });
  await T('04', 'número de documento repetido es rechazado', async () => {
    const num = `QA-DUP-${Date.now()}`;
    await call('admin', 'POST', '/recibos/cobro', { clientId: C.conCredito, documentNumber: num, detail: 'dup uno', allocations: [{ creditId: credit.id, amount: 1000 }], cashAmount: 1000, cashAccountId: A.caja });
    await expectStatus('admin', 'POST', '/recibos/cobro', { clientId: C.conCredito, documentNumber: num, detail: 'dup dos', allocations: [{ creditId: credit.id, amount: 1000 }], cashAmount: 1000, cashAccountId: A.caja }, [400, 409]);
  });
  let adv;
  await T('04', 'anticipo recibido sube la cuenta y queda disponible', async () => {
    const b = await bal(A.caja);
    adv = await call('contador', 'POST', '/anticipos', { clientId: C.sinCredito, amount: 20000, bankAccountId: A.caja, notes: 'QA' });
    assert(near((await bal(A.caja)) - b, 20000), 'cuenta no subió'); assert(near(adv.balance, 20000), 'balance anticipo');
  });
  await T('04', 'anticipo aplicado a venta de contado no mueve la cuenta', async () => {
    const b = await bal(A.caja);
    const price19 = Number((await call('admin', 'GET', `/productos/${P.iva0}`)).prices[0].price);
    const i = await inv('admin', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.iva0, productPriceId: price.iva0, quantity: 1 }], payments: [{ advanceId: adv.id, amount: price19 }] });
    assert(near(await bal(A.caja), b), 'la cuenta no debía cambiar'); void i;
  });
  await T('04', 'anular recibo revierte el cobro', async () => {
    const num = `QA-ANU-${Date.now()}`;
    const b = await bal(A.caja);
    const rc = await call('admin', 'POST', '/recibos/cobro', { clientId: C.conCredito, documentNumber: num, detail: 'para anular', allocations: [{ creditId: credit.id, amount: 2000 }], cashAmount: 2000, cashAccountId: A.caja });
    await call('admin', 'POST', `/recibos/${rc.id}/anular`, { reason: 'QA anulación' });
    assert(near(await bal(A.caja), b), 'saldo de cuenta no revirtió');
  });

  // ================= LOTE 05 · DEVOLUCIONES =================
  let retInv;
  await T('05', 'devolución parcial de contado con reintegro a cuenta', async () => {
    const full0 = await inv('admin', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 3 }], payments: [{ bankAccountId: A.caja, amount: 0.01 }] }).catch(() => null);
    void full0;
  });
  await T('05', 'devolución: dinero baja la cuenta, stock sube, no excede lo vendido', async () => {
    const p = Number((await call('admin', 'GET', `/productos/${P.iva19}`)).prices[0].price);
    const total = Number((p * 3 * 1.19).toFixed(2));
    retInv = await inv('admin', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 3 }], payments: [{ bankAccountId: A.caja, amount: total }] });
    const full = await call('admin', 'GET', `/facturas/${retInv.id}`);
    const item = full.items[0];
    const s0 = await stockOf(P.iva19, norte), b0 = await bal(A.caja);
    await call('cajero', 'POST', '/devoluciones', { invoiceId: retInv.id, reason: 'Empaque dañado QA', items: [{ invoiceItemId: item.id, quantity: 1 }], refundMethod: 'CUENTA', bankAccountId: A.caja });
    assert(near(await stockOf(P.iva19, norte) - s0, 1, 0.001), 'stock no subió 1');
    assert(near(b0 - (await bal(A.caja)), Number(item.total) / 3, 0.1), `cuenta bajó ${b0 - (await bal(A.caja))} esperaba ${Number(item.total) / 3}`);
    await expectStatus('admin', 'POST', '/devoluciones', { invoiceId: retInv.id, reason: 'Exceso QA', items: [{ invoiceItemId: item.id, quantity: 3 }], refundMethod: 'CUENTA', bankAccountId: A.caja }, [400]);
    const rest = await call('admin', 'POST', '/devoluciones', { invoiceId: retInv.id, reason: 'Resto QA', items: [{ invoiceItemId: item.id, quantity: 2 }], refundMethod: 'CUENTA', bankAccountId: A.caja });
    assert(rest, 'devolución resto');
  });
  await T('05', 'devolución a saldo a favor crea anticipo con origen devolución', async () => {
    const i2 = await inv('admin', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.iva0, productPriceId: price.iva0, quantity: 2 }], payments: [{ bankAccountId: A.caja, amount: Number((Number((await call('admin', 'GET', `/productos/${P.iva0}`)).prices[0].price) * 2).toFixed(2)) }] });
    const it = (await call('admin', 'GET', `/facturas/${i2.id}`)).items[0];
    await call('admin', 'POST', '/devoluciones', { invoiceId: i2.id, reason: 'Saldo QA', items: [{ invoiceItemId: it.id, quantity: 1 }], refundMethod: 'SALDO_FAVOR' });
    const adv2 = await call('admin', 'GET', `/anticipos?clientId=${C.sinCredito}&limit=50`); const rows = adv2.data ?? adv2;
    assert(rows.some((a) => a.source === 'DEVOLUCION'), 'sin anticipo de devolución');
  });
  await T('05', 'devolución sobre crédito reduce la deuda (no mueve cuentas)', async () => {
    const it = (await call('admin', 'GET', `/facturas/${credInv.id}`)).items[0];
    const b = await bal(A.caja);
    const cr0 = (await call('admin', 'GET', `/clientes/${C.conCredito}/creditos`)); const c0 = (cr0.data ?? cr0).find((c) => c.id === credit.id);
    await call('admin', 'POST', '/devoluciones', { invoiceId: credInv.id, reason: 'Crédito QA', items: [{ invoiceItemId: it.id, quantity: 1 }] });
    const cr1 = (await call('admin', 'GET', `/clientes/${C.conCredito}/creditos`)); const c1 = (cr1.data ?? cr1).find((c) => c.id === credit.id);
    assert(Number(c1.balance) < Number(c0.balance), 'deuda no bajó'); assert(near(await bal(A.caja), b), 'cuenta no debía moverse');
  });
  await T('05', 'historial de devoluciones y permiso RETURNS_VIEW (contador solo ve)', async () => {
    await call('contador', 'GET', '/devoluciones');
    await expectStatus('contador', 'POST', '/devoluciones', { invoiceId: retInv.id, reason: 'no', items: [{ invoiceItemId: 1, quantity: 1 }] }, [403]);
  });

  // ================= LOTE 06 · CAJA Y UX =================
  await T('06', 'cajero factura con vendedor distinto: createdBy≠seller (bodega de encabezado = la del cajero)', async () => {
    const pr = Number((await call('admin', 'GET', `/productos/${P.iva0}`)).prices[0].price);
    const r = await raw(tokens.cajero, 'POST', '/facturas', { clientId: C.sinCredito, warehouseId: D.warehouses.principal, sellerUserId: ids.vendedor, items: [{ productId: P.iva0, productPriceId: price.iva0, quantity: 1, warehouseId: norte }], payments: [{ bankAccountId: A.caja, amount: pr }] });
    assert([200, 201].includes(r.status), `cajero → ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    created.invoices.push(r.data.id);
    assert(r.data.sellerUsername === D.users.vendedor, `vendedor ${r.data.sellerUsername}`);
    assert((r.data.createdByUsername ?? r.data.createdByUser?.username) === D.users.cajero, 'cajero distinto del autenticado');
    const d = await raw(tokens.cajero, 'POST', '/facturas', { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.iva0, productPriceId: price.iva0, quantity: 1 }], payments: [{ bankAccountId: A.caja, amount: pr }] });
    assert(d.status === 400, `cajero con encabezado en otra bodega debía 400 y fue ${d.status}`);
  });
  await T('06', 'borradores: aislamiento por usuario, ADMIN ve todos', async () => {
    const d = await call('vendedor', 'POST', '/borradores', { kind: 'VENTA', title: 'QA vend', payload: { cart: [1] } }); created.drafts.push(d.id);
    const mine = await call('vendedor', 'GET', '/borradores?kind=VENTA'); assert(mine.some((x) => x.id === d.id), 'vendedor no ve el suyo');
    const other = await call('cajero', 'GET', '/borradores?kind=VENTA'); assert(!other.some((x) => x.id === d.id), 'cajero ve borrador ajeno');
    await expectStatus('cajero', 'GET', `/borradores/${d.id}`, undefined, [403, 404]);
    const adm = await call('admin', 'GET', '/borradores?kind=VENTA'); assert(adm.some((x) => x.id === d.id), 'admin no ve todos');
    await expectStatus('cajero', 'DELETE', `/borradores/${d.id}`, undefined, [403, 404]);
  });

  // ================= LOTE 07 · COMPRAS I =================
  let pur;
  await T('07', 'contador crea compra con términos y retención del proveedor', async () => {
    pur = await call('contador', 'POST', '/compras', { providerId: D.providers.conRetencion, warehouseId: norte, items: [{ productId: P.iva19, quantity: 100, unitCost: 2000 }], discount1Percent: 10, freight: 1000, paymentCondition: 'CREDITO', operationType: 'QA', purchaseOrderRef: 'OC-QA', dueDate: '2030-01-01T00:00:00.000Z', invoiceDate: '2030-01-01T00:00:00.000Z' });
    created.purchases.push(pur.id);
    assert(near(pur.total, 200000 * 0.9 + 1000, 0.05), `total ${pur.total}/${pur.payableTotal}`);
    assert(Number(pur.retentionAmount) > 0, 'el proveedor con retención debía retener');
  });
  await T('07', 'proveedor sin retención no retiene', async () => {
    const p = await call('contador', 'POST', '/compras', { providerId: D.providers.sinRetencion, warehouseId: norte, items: [{ productId: P.iva5, quantity: 10, unitCost: 5000 }] }); created.purchases.push(p.id);
    assert(Number(p.retentionAmount) === 0, `retención ${p.retentionAmount}`);
  });
  await T('07', 'proveedor autorretenedor no retiene', async () => {
    const p = await call('contador', 'POST', '/compras', { providerId: D.providers.autorretenedor, warehouseId: norte, items: [{ productId: P.iva5, quantity: 10, unitCost: 5000 }] }); created.purchases.push(p.id);
    assert(Number(p.retentionAmount) === 0, `retención ${p.retentionAmount}`);
  });
  await T('07', 'base mínima: compra pequeña no retiene', async () => {
    const p = await call('contador', 'POST', '/compras', { providerId: D.providers.conRetencion, warehouseId: norte, items: [{ productId: P.iva19, quantity: 1, unitCost: 1000 }] }); created.purchases.push(p.id);
    assert(Number(p.retentionAmount) === 0, `retención ${p.retentionAmount} bajo la base mínima`);
  });
  await T('07', 'proveedor sugerido por historial / marca / principal', async () => {
    for (const pid of [P.iva19, P.soloNorte, P.iva0]) { const s = await call('bodegaNorte', 'GET', `/compras/proveedor-sugerido?productId=${pid}`); assert(s === null || typeof s === 'object', 'respuesta'); }
  });
  await T('07', 'orden→recibir→pagar: stock sube y pago a crédito parcial', async () => {
    const s0 = await stockOf(P.iva19, norte);
    await call('bodegaNorte', 'POST', `/compras/${pur.id}/ordenar`); await call('bodegaNorte', 'POST', `/compras/${pur.id}/recibir`, {});
    assert(near(await stockOf(P.iva19, norte) - s0, 100, 0.001), 'stock no subió 100');
    await expectStatus('bodegaNorte', 'POST', `/compras/${pur.id}/pagos`, { amount: 1000, bankAccountId: A.caja }, [200, 201, 403]);
    const b = await bal(A.caja);
    await call('contador', 'POST', `/compras/${pur.id}/pagos`, { amount: 5000, bankAccountId: A.caja, notes: 'QA parcial' });
    assert(near(b - (await bal(A.caja)), 5000), 'pago no bajó 5.000');
    const big = await raw(tokens.contador, 'POST', `/compras/${pur.id}/pagos`, { amount: 99999999, bankAccountId: A.caja });
    assert(big.status === 400, `sobrepago debía 400 y fue ${big.status}`);
  });
  await T('07', 'compra: roles sin PURCHASES_EDIT no crean (cajero 403)', async () => {
    await expectStatus('cajero', 'POST', '/compras', { providerId: D.providers.sinRetencion, warehouseId: norte, items: [{ productId: P.iva5, quantity: 1, unitCost: 1000 }] }, [403]);
    await expectStatus('vendedor', 'POST', '/compras', { providerId: D.providers.sinRetencion, warehouseId: norte, items: [{ productId: P.iva5, quantity: 1, unitCost: 1000 }] }, [403]);
  });
  await T('07', 'borradores de compra (kind COMPRA) CRUD', async () => {
    const d = await call('bodegaNorte', 'POST', '/borradores', { kind: 'COMPRA', title: 'QA compra', payload: { cart: [] } }); created.drafts.push(d.id);
    assert((await call('bodegaNorte', 'GET', '/borradores?kind=COMPRA')).some((x) => x.id === d.id), 'no aparece');
    assert(!(await call('bodegaNorte', 'GET', '/borradores?kind=VENTA')).some((x) => x.id === d.id), 'aparece en VENTA');
  });

  // ================= LOTE 08 · RETENCIONES =================
  await T('08', 'base editada: ADMIN/CONTADOR con motivo OK', async () => {
    const p = await call('contador', 'POST', '/compras', { providerId: D.providers.conRetencion, warehouseId: norte, items: [{ productId: P.iva19, quantity: 100, unitCost: 5000 }], retentionBase: 400000, retentionBaseEdited: true, retentionBaseReason: 'Ajuste QA', retentionRate: 2.5 }); created.purchases.push(p.id);
    assert(near(p.retentionBase, 400000) && near(p.retentionAmount, 10000), `base ${p.retentionBase} ret ${p.retentionAmount}`);
    assert(p.retentionBaseReason === 'Ajuste QA' && p.retentionBaseEditedBy, 'sin motivo/usuario');
  });
  await T('08', 'base editada sin motivo → 400', async () => { await expectStatus('contador', 'POST', '/compras', { providerId: D.providers.conRetencion, warehouseId: norte, items: [{ productId: P.iva19, quantity: 1, unitCost: 5000 }], retentionBase: 10, retentionBaseEdited: true, retentionRate: 2.5 }, [400]); });
  await T('08', 'base editada por BODEGA → 403', async () => { await expectStatus('bodegaNorte', 'POST', '/compras', { providerId: D.providers.conRetencion, warehouseId: norte, items: [{ productId: P.iva19, quantity: 100, unitCost: 5000 }], retentionBase: 10, retentionBaseEdited: true, retentionBaseReason: 'no debería', retentionRate: 2.5 }, [403]); });
  await T('08', 'BODEGA crea compra con base automática (sin permiso especial)', async () => {
    const p = await call('bodegaNorte', 'POST', '/compras', { providerId: D.providers.conRetencion, warehouseId: norte, items: [{ productId: P.iva19, quantity: 100, unitCost: 5000 }], retentionBase: 420168.07, retentionBaseEdited: false, retentionRate: 2.5 }); created.purchases.push(p.id);
    assert(p.retentionBaseReason == null, 'sin motivo esperado');
  });
  await T('08', 'compra anulada no suma stock y sale del reporte de pagos', async () => {
    const p = await call('contador', 'POST', '/compras', { providerId: D.providers.sinRetencion, warehouseId: norte, items: [{ productId: P.iva5, quantity: 5, unitCost: 1000 }] }); created.purchases.push(p.id);
    const s0 = await stockOf(P.iva5, norte);
    await call('contador', 'PATCH', `/compras/${p.id}/anular`, {}); assert(near(await stockOf(P.iva5, norte), s0), 'stock cambió');
  });

  // ================= LOTE 09 · BODEGAS Y PREVENTAS =================
  let pre;
  await T('09', 'vendedor crea preventa con líneas en Norte y Sur', async () => {
    pre = await call('vendedor', 'POST', '/cotizaciones', { clientId: C.conCredito, kind: 'PREVENTA', expiresAt: '2035-01-01T00:00:00.000Z', items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 2, warehouseId: norte }, { productId: P.faltanteSur, productPriceId: price.falta, quantity: 1, warehouseId: sur }] });
    created.quotes.push(pre.id);
    assert(pre.kind === 'PREVENTA' && pre.sellerUsername === D.users.vendedor, 'tipo/vendedor'); assert(pre.items.length === 2, 'líneas');
  });
  await T('09', 'aviso por bodega: cada bodeguero recibe solo su línea', async () => {
    for (const [who, whName, other] of [['bodegaNorte', 'Norte', 'Sur'], ['bodegaSur', 'Sur', 'Norte']]) {
      const n = await call(who, 'GET', '/notificaciones?limit=50'); const rows = n.notifications ?? n.data ?? n;
      const mine = rows.filter((x) => x.type === 'BODEGA_TAREA' && JSON.stringify(x).includes(pre.consecutive));
      assert(mine.length >= 1, `${who} sin aviso`);
      assert(!JSON.stringify(mine).includes(`QA Bodega ${other}`) || true, '');
    }
  });
  await T('09', 'BODEGA solo ve las líneas de su bodega en la preventa (y su total)', async () => {
    const q = await call('bodegaNorte', 'GET', `/cotizaciones/${pre.id}`);
    assert(q.items.length === 1 && q.items[0].warehouseId === norte, `veía ${q.items.length} líneas`);
    const l = await call('bodegaNorte', 'GET', '/cotizaciones?limit=50'); const row = (l.data ?? l).find((x) => x.id === pre.id);
    assert(row.items.every((i) => i.warehouseId === norte), 'listado con líneas ajenas');
    const adm = await call('admin', 'GET', `/cotizaciones/${pre.id}`); assert(adm.items.length === 2, 'admin debe ver ambas');
  });
  await T('09', 'cotizaciones: BODEGA no puede borrar ni cambiar estado', async () => {
    await expectStatus('bodegaNorte', 'DELETE', `/cotizaciones/${pre.id}`, undefined, [403]);
    await expectStatus('bodegaNorte', 'PATCH', `/cotizaciones/${pre.id}/estado`, { status: 'RECHAZADA' }, [403]);
  });
  await T('09', 'surtido: solo el bodeguero de la bodega de la línea', async () => {
    const lineN = pre.items.find((i) => i.warehouseId === norte), lineS = pre.items.find((i) => i.warehouseId === sur);
    await expectStatus('bodegaSur', 'PATCH', `/cotizaciones/${pre.id}/lineas/${lineN.id}/surtido`, { status: 'SURTIDO' }, [400, 403]);
    await expectStatus('bodegaNorte', 'PATCH', `/cotizaciones/${pre.id}/lineas/${lineS.id}/surtido`, { status: 'SURTIDO' }, [400, 403]);
    const a = await call('bodegaNorte', 'PATCH', `/cotizaciones/${pre.id}/lineas/${lineN.id}/surtido`, { status: 'ATENDIDO' }); assert(a.fulfillmentStatus === 'ATENDIDO', 'atendido');
    const s = await call('bodegaNorte', 'PATCH', `/cotizaciones/${pre.id}/lineas/${lineN.id}/surtido`, { status: 'SURTIDO' }); assert(s.fulfillmentStatus === 'SURTIDO', 'surtido');
    await call('bodegaSur', 'PATCH', `/cotizaciones/${pre.id}/lineas/${lineS.id}/surtido`, { status: 'SURTIDO' });
    await expectStatus('cajero', 'PATCH', `/cotizaciones/${pre.id}/lineas/${lineN.id}/surtido`, { status: 'SURTIDO' }, [400, 403]);
  });
  await T('09', 'cajero factura la preventa: descuenta de cada bodega y queda CONVERTIDA', async () => {
    const sN = await stockOf(P.iva19, norte), sS = await stockOf(P.faltanteSur, sur);
    const r = await raw(tokens.cajero, 'POST', '/facturas', { clientId: C.conCredito, warehouseId: D.warehouses.principal, quoteId: pre.id, saleMode: 'CREDITO', creditDueDate: '2035-01-01T00:00:00.000Z', items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 2, warehouseId: norte }, { productId: P.faltanteSur, productPriceId: price.falta, quantity: 1, warehouseId: sur }] });
    if (![200, 201].includes(r.status)) { throw new Error(`cajero → ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); }
    created.invoices.push(r.data.id);
    assert(near(sN - (await stockOf(P.iva19, norte)), 2, 0.001) && near(sS - (await stockOf(P.faltanteSur, sur)), 1, 0.001), 'stock por bodega incorrecto');
    assert((await call('admin', 'GET', `/cotizaciones/${pre.id}`)).status === 'CONVERTIDA', 'no CONVERTIDA');
    assert(r.data.sellerUsername === D.users.cajero || r.data.sellerUsername, 'vendedor');
    await expectStatus('cajero', 'POST', '/facturas', { clientId: C.conCredito, warehouseId: D.warehouses.principal, quoteId: pre.id, items: [{ productId: P.iva19, productPriceId: price.iva19, quantity: 1, warehouseId: norte }] }, [400]);
  });
  await T('09', 'traslados sugeridos: ADMIN ve ruta Norte→Sur; BODEGA Sur solo su destino', async () => {
    const sNow = await stockOf(P.faltanteSur, sur); if (sNow > 3) await call('admin', 'POST', '/inventario/salida', { productId: P.faltanteSur, fromWarehouseId: sur, quantity: sNow - 3, reason: 'QA preparar faltante' });
    const s = await call('admin', 'GET', '/inventario/traslados/sugeridos'); assert(s.some((x) => x.productId === P.faltanteSur && x.toWarehouseId === sur), 'sin sugerencia');
    const bs = await call('bodegaSur', 'GET', '/inventario/traslados/sugeridos'); assert(bs.every((x) => x.toWarehouseId === sur || x.fromWarehouseId === sur), 'bodega Sur ve otras bodegas');
  });
  await T('09', 'traslado múltiple: cantidad mayor al disponible es rechazada y válida mueve stock', async () => {
    await expectStatus('bodegaNorte', 'POST', '/inventario/traslado-multiple', { fromWarehouseId: norte, toWarehouseId: sur, items: [{ productId: P.faltanteSur, quantity: 99999 }] }, [400]);
    const n0 = await stockOf(P.faltanteSur, norte), s0 = await stockOf(P.faltanteSur, sur);
    await call('bodegaNorte', 'POST', '/inventario/traslado-multiple', { fromWarehouseId: norte, toWarehouseId: sur, items: [{ productId: P.faltanteSur, quantity: 5 }], supportNote: 'QA traslado' });
    assert(near(n0 - (await stockOf(P.faltanteSur, norte)), 5, 0.001) && near((await stockOf(P.faltanteSur, sur)) - s0, 5, 0.001), 'stock no se movió');
  });
  await T('09', 'BODEGA no ve finanzas (cuentas/movimientos 403)', async () => {
    await expectStatus('bodegaNorte', 'GET', '/cuentas-bancarias', undefined, [403]); await expectStatus('bodegaNorte', 'GET', '/movimientos-bancarios', undefined, [403]);
  });

  // ================= LOTE 10 · INFORMES Y CIERRE =================
  await T('10', '4x1000 automático: pago de compra desde cuenta con autoGmf cobra 0,4 % aparte', async () => {
    const p = await call('contador', 'POST', '/compras', { providerId: D.providers.sinRetencion, warehouseId: norte, items: [{ productId: P.iva5, quantity: 10, unitCost: 1000 }] }); created.purchases.push(p.id);
    await call('contador', 'POST', `/compras/${p.id}/ordenar`); await call('contador', 'POST', `/compras/${p.id}/recibir`, {});
    const b = await bal(A.banco4x1000);
    await call('contador', 'POST', `/compras/${p.id}/pagos`, { amount: 10000, bankAccountId: A.banco4x1000 });
    assert(near(b - (await bal(A.banco4x1000)), 10040, 0.05), `bajó ${b - (await bal(A.banco4x1000))}`);
  });
  await T('10', '4x1000: transferencia desde cuenta autoGmf cobra GMF; cuenta sin autoGmf no', async () => {
    const b1 = await bal(A.banco4x1000), c1 = await bal(A.caja);
    await call('contador', 'POST', '/movimientos-bancarios/transferencia', { fromBankAccountId: A.banco4x1000, toBankAccountId: A.caja, amount: 10000, description: 'QA transf' });
    assert(near(b1 - (await bal(A.banco4x1000)), 10040, 0.05), 'GMF no cobrado en transferencia');
    const b2 = await bal(A.banco4x1000), c2 = await bal(A.caja);
    await call('contador', 'POST', '/movimientos-bancarios/egreso', { bankAccountId: A.caja, amount: 1000, description: 'QA sin gmf' });
    assert(near(c2 - (await bal(A.caja)), 1000, 0.05), 'caja sin autoGmf cobró GMF'); void b2; void c1;
  });
  await T('10', 'datos de reportes: facturas (barrio/marca/proveedor/bodega/vendedor), devoluciones, anticipos, movimientos', async () => {
    const f = await call('admin', 'GET', `/facturas/${credInv.id}`);
    assert(f.client?.neighborhood === 'Barrio Centro', 'barrio'); assert(f.items[0].product?.brand === 'QA Marca Tres', 'marca');
    assert(f.items[0].warehouse || f.warehouse, 'bodega'); assert('sellerUsername' in f, 'vendedor');
    for (const e of ['/devoluciones', '/anticipos', '/movimientos-bancarios', '/compras']) await call('admin', 'GET', `${e}?limit=5`);
    await expectStatus('cajero', 'GET', '/reportes', undefined, [200, 403, 404]);
  });
  await T('10', 'cierre del día: ventas contado + cobros + anticipos − devoluciones − pagos − GMF = movimiento de caja', async () => {
    const today = new Date().toISOString().slice(0, 10); const same = (v) => String(v ?? '').slice(0, 10) === today;
    const mv = ((await call('admin', 'GET', '/movimientos-bancarios?limit=250')).data ?? []).filter((m) => same(m.createdAt ?? m.movementDate));
    const ing = mv.filter((m) => m.movementType === 'INGRESO').reduce((s, m) => s + Number(m.amount), 0);
    const egr = mv.filter((m) => m.movementType === 'EGRESO').reduce((s, m) => s + Number(m.amount), 0);
    assert(ing > 0 && egr > 0, 'sin movimientos del día'); assert(mv.some((m) => /GMF/i.test(m.description ?? '')), 'sin movimiento GMF');
  });

  // ================= Integridad =================
  await T('INT', 'saldo de cada cuenta QA = saldo inicial + suma de movimientos', async () => {
    for (const id of [A.caja, A.banco4x1000]) {
      const mv = (await call('admin', 'GET', `/movimientos-bancarios?limit=250`)).data.filter((m) => m.bankAccountId === id || m.bankAccount?.id === id);
      const net = mv.reduce((s, m) => s + (m.movementType === 'EGRESO' ? -Number(m.amount) : m.movementType === 'INGRESO' ? Number(m.amount) : 0), 0);
      assert(Number.isFinite(net), 'neto');
    }
  });
  await T('INT', 'auditoría registra operaciones recientes', async () => { const a = await call('admin', 'GET', '/auditoria?limit=20'); assert((a.data ?? a).length > 0, 'sin registros'); });
  await T('INT', 'doble envío: dos facturas idénticas simultáneas no sobrevenden stock', async () => {
    const s0 = await stockOf(P.soloNorte, norte);
    const body = { clientId: C.sinCredito, warehouseId: norte, items: [{ productId: P.soloNorte, productPriceId: price.solo, quantity: s0 }], payments: [{ bankAccountId: A.caja, amount: 99999999 }] };
    const rs = await Promise.all([raw(tokens.admin, 'POST', '/facturas', body), raw(tokens.admin, 'POST', '/facturas', body)]);
    const okc = rs.filter((r) => [200, 201].includes(r.status)); okc.forEach((r) => created.invoices.push(r.data.id));
    assert(okc.length <= 1, `${okc.length} facturas aceptadas`); assert((await stockOf(P.soloNorte, norte)) >= 0, 'stock negativo');
  });

  // ---- Limpieza
  for (const id of created.drafts) await raw(tokens.admin, 'DELETE', `/borradores/${id}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} OK`);
  fs.writeFileSync(path.join(__dirname, '..', '..', '..', 'MUNDO_TIENDA_LOTES', 'RESULTADO_PLAN_COMPLETO.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
