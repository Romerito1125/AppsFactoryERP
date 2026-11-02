/* Siembra idempotente de datos para el plan de pruebas completo (usa la API real).
 *   API_URL=http://127.0.0.1:7502 node scripts/seed-qa-pruebas.js
 * Todo lleva prefijo/identificador "QA-PRUEBAS" para poder localizarlo y limpiarlo. */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:7502';
const PASSWORD = 'Qa123456*';
let token;

async function api(method, path, body, expected = [200, 201]) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!expected.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const list = async (path, params = '') => {
  const out = [];
  for (let page = 1; page < 20; page += 1) {
    const r = await api('GET', `${path}?${params}&page=${page}&limit=100`);
    const rows = r?.data ?? r ?? [];
    out.push(...rows);
    if (!r?.meta || page >= (r.meta.totalPages ?? 1)) break;
  }
  return out;
};
const log = (msg) => console.log(msg);
const summary = [];

async function ensure(label, finder, creator) {
  let item = await finder();
  if (item) { log(`= ${label} (ya existía)`); return item; }
  item = await creator();
  log(`+ ${label}`);
  return item;
}

(async () => {
  const login = await api('POST', '/auth/login', { email: 'admin@mundotienda.com', password: 'Admin123*' });
  token = login.accessToken;

  // ---- Bodegas
  const warehouses = await list('/bodegas');
  const wh = async (name) => ensure(`Bodega ${name}`, async () => warehouses.find((w) => w.location === name), () => api('POST', '/bodegas', { location: name }));
  const norte = await wh('QA Bodega Norte');
  const sur = await wh('QA Bodega Sur');
  const principal = warehouses.find((w) => w.location === 'Bodega Principal') ?? warehouses[0];

  // ---- Usuarios (login exige correo)
  const users = await list('/usuarios');
  const user = (email, role, warehouseId) => ensure(`Usuario ${role} ${email}`, async () => users.find((u) => u.username === email || u.email === email),
    () => api('POST', '/usuarios', { email, password: PASSWORD, role, ...(warehouseId ? { warehouseId } : {}) }));
  const accounts = {
    cajero: await user('qa.cajero@mundotienda.com', 'CAJERO', principal?.id),
    cajero2: await user('qa.cajero2@mundotienda.com', 'CAJERO', principal?.id),
    vendedor: await user('qa.vendedor@mundotienda.com', 'VENDEDOR', principal?.id),
    vendedor2: await user('qa.vendedor2@mundotienda.com', 'VENDEDOR', principal?.id),
    bodegaNorte: await user('qa.bodega.norte@mundotienda.com', 'BODEGA', norte.id),
    bodegaSur: await user('qa.bodega.sur@mundotienda.com', 'BODEGA', sur.id),
    contador: await user('qa.contador@mundotienda.com', 'CONTADOR', null),
  };
  // Asegura la bodega de los bodegueros aunque ya existieran.
  for (const [key, w] of [['bodegaNorte', norte], ['bodegaSur', sur]]) {
    const u = accounts[key];
    if (u?.id && u.warehouseId !== w.id) await api('PATCH', `/usuarios/${u.id}`, { warehouseId: w.id }).catch((e) => log(`  ! ${key}: ${e.message}`));
  }

  // ---- Proveedores
  const providers = await list('/proveedores');
  const prov = (name, extra) => ensure(`Proveedor ${name}`, async () => providers.find((p) => p.name === name),
    () => api('POST', '/proveedores', { name, taxId: `NIT-${name.replace(/\W/g, '').slice(0, 14)}`, providerType: 'Juridico', description: 'QA-PRUEBAS', address: 'Calle QA 1', creditDays: 30, ...extra }));
  const provRet = await prov('QA Proveedor con retencion', { hasIslrWithholding: true, withholdingType: 'Retefuente 2.5%', withholdingRate: 2.5, withholdingMinimumBase: 100000 });
  const provSin = await prov('QA Proveedor sin retencion', {});
  const provAuto = await prov('QA Proveedor autorretenedor', { hasIslrWithholding: true, isSelfWithholding: true, withholdingRate: 2.5 });

  // ---- Tipo de producto
  const types = await list('/tipos-producto');
  const type = await ensure('Tipo QA', async () => types.find((t) => t.name === 'QA Tipo'), () => api('POST', '/tipos-producto', { name: 'QA Tipo', description: 'QA-PRUEBAS' }));

  // ---- Productos: IVA 0 / 5 / 19, marcas y proveedores distintos
  const products = await list('/productos');
  const prod = (name, tax, brand, provider, price, extra = {}) => ensure(`Producto ${name}`, async () => products.find((p) => p.name === name),
    () => api('POST', '/productos', {
      productTypeId: type.id, providerId: provider.id, name, description: 'QA-PRUEBAS', taxRate: tax, brand,
      minimumStock: 10, maximumStock: 60, quantity: 0, warehouseId: norte.id,
      prices: [0, 1, 2, 3].map((level) => ({ name: `Precio ${level}`, priceLevel: level, price: price - level * 100, isDefault: level === 0 })),
      cost: Math.round(price * 0.6), ...extra,
    }));
  const pIva0 = await prod('QA Arroz IVA 0', 0, 'QA Marca Uno', provRet, 5000);
  const pIva5 = await prod('QA Aceite IVA 5', 5, 'QA Marca Dos', provSin, 12000);
  const pIva19 = await prod('QA Gaseosa IVA 19', 19, 'QA Marca Tres', provRet, 3500);
  const pSolo = await prod('QA Solo en Norte', 19, 'QA Marca Dos', provSin, 8000);
  const pFalta = await prod('QA Faltante en Sur', 19, 'QA Marca Uno', provRet, 6000);

  // ---- Stock (solo si está vacío, para ser idempotente)
  async function stock(product, warehouse, qty) {
    const full = await api('GET', `/productos/${product.id}`);
    const rows = full.warehouses ?? full.inventory ?? [];
    const current = Number(rows.find((r) => r.warehouseId === warehouse.id)?.quantity ?? 0);
    if (current >= qty) return log(`= Stock ${product.name} @ ${warehouse.location}: ${current}`);
    await api('POST', '/inventario/entrada', { productId: product.id, toWarehouseId: warehouse.id, quantity: qty - current, reason: 'QA-PRUEBAS stock inicial' });
    log(`+ Stock ${product.name} @ ${warehouse.location}: ${qty}`);
  }
  for (const p of [pIva0, pIva5, pIva19]) { await stock(p, norte, 60); await stock(p, sur, 30); }
  await stock(pSolo, norte, 40); // sin stock en Sur: prueba de "otra bodega"
  await stock(pFalta, norte, 50);
  await stock(pFalta, sur, 3); // bajo el mínimo (10): genera traslado sugerido desde Norte

  // ---- Clientes
  const clients = await list('/clientes', 'estado=activos');
  const cli = (identification, firstName, extra) => ensure(`Cliente ${firstName}`, async () => clients.find((c) => c.identification === identification),
    () => api('POST', '/clientes', { identification, firstName, lastName: 'QA-PRUEBAS', phone: '3001112233', address: 'Dir QA', clientType: 'MINORISTA', ...extra }));
  const cConCredito = await cli('QA-CLI-CREDITO', 'QA Con Credito', { hasCredit: true, maxCredit: 2000000, neighborhood: 'Barrio Centro' });
  const cSinCredito = await cli('QA-CLI-SIN', 'QA Sin Credito', { hasCredit: false, neighborhood: 'Barrio Norte' });
  const cMayorista = await cli('QA-CLI-MAYOR', 'QA Mayorista', { hasCredit: true, maxCredit: 8000000, neighborhood: 'Barrio Sur', clientType: 'MAYORISTA', priceLevel: 2 });

  // ---- Cuentas bancarias
  const banks = await list('/cuentas-bancarias');
  const bank = (name, extra) => ensure(`Cuenta ${name}`, async () => banks.find((b) => b.name === name),
    () => api('POST', '/cuentas-bancarias', { name, bankName: 'QA Banco', accountNumber: `QA-${name.replace(/\W/g, '').slice(0, 10)}`, accountType: 'CORRIENTE', currentBalance: 3000000, ...extra }));
  const caja = await bank('QA Caja efectivo', {});
  const gmf = await bank('QA Banco con 4x1000', { autoGmf: true });

  const out = {
    password: PASSWORD,
    users: Object.fromEntries(Object.entries(accounts).map(([k, u]) => [k, u?.username ?? u?.email])),
    warehouses: { norte: norte.id, sur: sur.id, principal: principal?.id },
    providers: { conRetencion: provRet.id, sinRetencion: provSin.id, autorretenedor: provAuto.id },
    products: { iva0: pIva0.id, iva5: pIva5.id, iva19: pIva19.id, soloNorte: pSolo.id, faltanteSur: pFalta.id },
    clients: { conCredito: cConCredito.id, sinCredito: cSinCredito.id, mayorista: cMayorista.id },
    accounts: { caja: caja.id, banco4x1000: gmf.id },
  };
  summary.push(out);
  console.log('\nRESUMEN');
  console.log(JSON.stringify(out, null, 2));
  require('fs').writeFileSync(require('path').join(__dirname, '..', '..', '..', 'MUNDO_TIENDA_LOTES', 'DATOS_QA_PRUEBAS.json'), JSON.stringify(out, null, 2));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
