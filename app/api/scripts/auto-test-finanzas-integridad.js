/* Pruebas de integridad de Finanzas (paso 3 del plan COP/Finanzas). Usa la API real.
 *   ADMIN_PASSWORD=... API_URL=http://127.0.0.1:7599 node scripts/auto-test-finanzas-integridad.js
 * Crea una cuenta QA-FIN-<timestamp>, prueba saldo inicial, ajustes firmados, motivo y auditoría,
 * y la desactiva al final. */
const path = require('path');
const fs = require('fs');

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:7599';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('Define ADMIN_PASSWORD con la contraseña del administrador de pruebas.');
  process.exit(2);
}
const tag = `QA-FIN-${Date.now()}`;
const results = [];
let token;

async function raw(method, route, body) {
  const res = await fetch(`${API_URL}${route}`, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const ok = (r, what) => {
  if (![200, 201].includes(r.status)) throw new Error(`${what} -> ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

async function T(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`OK   ${name}`); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`FAIL ${name} | ${e.message}`); }
}

async function balanceOf(id) {
  return Number(ok(await raw('GET', `/cuentas-bancarias/${id}`), 'leer cuenta').currentBalance);
}

async function movementsOf(id) {
  const page = ok(await raw('GET', `/movimientos-bancarios?limit=250`), 'listar movimientos');
  return (page.data ?? page).filter((m) => m.bankAccountId === id);
}

async function auditEntries() {
  const page = ok(await raw('GET', `/auditoria?limit=200`), 'listar auditoría');
  return page.data ?? page;
}

(async () => {
  const login = ok(await raw('POST', '/auth/login', { email: 'admin@mundotienda.com', password: ADMIN_PASSWORD }), 'login');
  token = login.accessToken;

  let accountId;
  await T('crear cuenta con saldo inicial genera movimiento «Saldo inicial»', async () => {
    const account = ok(await raw('POST', '/cuentas-bancarias', { name: tag, bankName: 'Banco QA', accountNumber: `${tag}-1`, accountType: 'AHORROS', currentBalance: 500000 }), 'crear cuenta');
    accountId = account.id;
    assert(near(await balanceOf(accountId), 500000), 'el saldo inicial no quedó en la cuenta');
    const movements = await movementsOf(accountId);
    assert(movements.some((m) => m.description === 'Saldo inicial' && near(m.totalAmount, 500000)), 'no hay movimiento de saldo inicial');
  });

  await T('PATCH con currentBalance no cambia el saldo (validación en lista blanca)', async () => {
    ok(await raw('PATCH', `/cuentas-bancarias/${accountId}`, { name: `${tag} editada`, currentBalance: 999 }), 'editar cuenta');
    assert(near(await balanceOf(accountId), 500000), 'el saldo cambió al editar la cuenta');
  });

  await T('ajuste a la baja guarda la diferencia con signo negativo', async () => {
    const movement = ok(await raw('POST', '/movimientos-bancarios/ajuste', { bankAccountId: accountId, balance: 450000, description: 'Conteo QA' }), 'ajuste');
    assert(near(movement.totalAmount, -50000), `total del ajuste ${movement.totalAmount}, se esperaba -50000`);
    assert(near(await balanceOf(accountId), 450000), 'el saldo no bajó a 450.000');
  });

  await T('ajuste a la alza guarda la diferencia con signo positivo', async () => {
    const movement = ok(await raw('POST', '/movimientos-bancarios/ajuste', { bankAccountId: accountId, balance: 460000, description: 'Recuento QA' }), 'ajuste');
    assert(near(movement.totalAmount, 10000), `total del ajuste ${movement.totalAmount}, se esperaba 10000`);
    assert(near(await balanceOf(accountId), 460000), 'el saldo no subió a 460.000');
  });

  await T('ajuste sin motivo útil es rechazado', async () => {
    const r = await raw('POST', '/movimientos-bancarios/ajuste', { bankAccountId: accountId, balance: 470000, description: 'x' });
    assert(r.status === 400, `esperaba 400 y fue ${r.status}`);
  });

  await T('ajuste al mismo valor es rechazado', async () => {
    const r = await raw('POST', '/movimientos-bancarios/ajuste', { bankAccountId: accountId, balance: 460000, description: 'Sin cambio QA' });
    assert(r.status === 400, `esperaba 400 y fue ${r.status}`);
  });

  await T('ingreso y egreso manuales se auditan con el usuario', async () => {
    ok(await raw('POST', '/movimientos-bancarios/ingreso', { bankAccountId: accountId, amount: 1000, description: `${tag} ingreso` }), 'ingreso');
    ok(await raw('POST', '/movimientos-bancarios/egreso', { bankAccountId: accountId, amount: 500, description: `${tag} egreso` }), 'egreso');
    const entries = await auditEntries();
    const ingreso = entries.find((e) => e.module === 'BANCOS' && e.action === 'INGRESO' && e.description === `${tag} ingreso`);
    const egreso = entries.find((e) => e.module === 'BANCOS' && e.action === 'EGRESO' && e.description === `${tag} egreso`);
    assert(ingreso, 'no hay auditoría del ingreso');
    assert(egreso, 'no hay auditoría del egreso');
    assert(ingreso.username === 'admin@mundotienda.com', `usuario de auditoría ${ingreso.username}`);
  });

  await T('el ajuste queda en auditoría', async () => {
    const entries = await auditEntries();
    assert(entries.some((e) => e.module === 'BANCOS' && e.action === 'AJUSTE' && e.description === 'Conteo QA'), 'sin auditoría del ajuste');
  });

  await T('cambios de cuenta (crear, editar, desactivar) quedan en auditoría', async () => {
    const entries = await auditEntries();
    assert(entries.some((e) => e.module === 'BANCOS' && e.action === 'CREAR_CUENTA' && String(e.entityLabel ?? e.description).includes(tag)), 'sin auditoría de creación');
    assert(entries.some((e) => e.module === 'BANCOS' && e.action === 'EDITAR_CUENTA'), 'sin auditoría de edición');
    ok(await raw('DELETE', `/cuentas-bancarias/${accountId}`), 'desactivar');
    const after = await auditEntries();
    assert(after.some((e) => e.module === 'BANCOS' && e.action === 'DESACTIVAR_CUENTA'), 'sin auditoría de desactivación');
  });

  await T('saldo final = inicial + ajustes + ingreso − egreso (conciliación)', async () => {
    // 500.000 → 450.000 (−50.000) → 460.000 (+10.000) → +1.000 −500 = 460.500
    assert(near(await balanceOf(accountId), 460500), `saldo ${await balanceOf(accountId)}, se esperaba 460.500`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} OK`);
  fs.writeFileSync(
    path.join(__dirname, '..', '..', '..', 'MUNDO_TIENDA_LOTES', 'RESULTADO_FINANZAS_INTEGRIDAD.json'),
    JSON.stringify({ at: new Date().toISOString(), tag, results }, null, 2),
  );
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
