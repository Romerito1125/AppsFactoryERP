export const permissionCatalog = [
  { code: "CLIENTS_VIEW", label: "Consultar clientes", group: "Archivos" },
  {
    code: "CLIENTS_EDIT",
    label: "Crear y modificar clientes",
    group: "Archivos",
  },
  { code: "PROVIDERS_VIEW", label: "Consultar proveedores", group: "Archivos" },
  {
    code: "PROVIDERS_EDIT",
    label: "Crear y modificar proveedores",
    group: "Archivos",
  },
  { code: "PRODUCTS_VIEW", label: "Consultar productos", group: "Inventario" },
  {
    code: "PRODUCTS_EDIT",
    label: "Crear y modificar productos",
    group: "Inventario",
  },
  { code: "INVENTORY_EDIT", label: "Ajustar existencias", group: "Inventario" },
  {
    code: "RETENTIONS_VIEW",
    label: "Consultar retenciones",
    group: "Configuración",
  },
  {
    code: "RETENTIONS_EDIT",
    label: "Configurar retenciones",
    group: "Configuración",
  },
  {
    code: "USERS_MANAGE",
    label: "Administrar usuarios y accesos",
    group: "Configuración",
  },
  {
    code: "PAYABLES_VIEW",
    label: "Consultar cuentas por pagar",
    group: "Transacciones",
  },
  {
    code: "PAYABLES_EDIT",
    label: "Gestionar compras por pagar",
    group: "Transacciones",
  },
  {
    code: "RECEIVABLES_VIEW",
    label: "Consultar cuentas por cobrar",
    group: "Transacciones",
  },
  {
    code: "RECEIVABLES_EDIT",
    label: "Registrar créditos y pagos",
    group: "Transacciones",
  },
  {
    code: "PURCHASES_VIEW",
    label: "Consultar compras",
    group: "Transacciones",
  },
  {
    code: "PURCHASES_EDIT",
    label: "Gestionar compras",
    group: "Transacciones",
  },
  {
    code: "BANKS_VIEW",
    label: "Consultar bancos",
    group: "Transacciones",
  },
  {
    code: "BANKS_EDIT",
    label: "Gestionar bancos",
    group: "Transacciones",
  },
  { code: "SALES_CREATE", label: "Registrar ventas", group: "Transacciones" },
  { code: "OFFERS_VIEW", label: "Consultar ofertas", group: "Ventas" },
  { code: "OFFERS_EDIT", label: "Gestionar ofertas", group: "Ventas" },
  { code: "REFERRALS_VIEW", label: "Consultar referidos", group: "Ventas" },
  { code: "REFERRALS_EDIT", label: "Configurar referidos", group: "Ventas" },
  { code: "REPORTS_VIEW", label: "Consultar reportes", group: "Reportes" },
  { code: "DELIVERIES_VIEW", label: "Consultar domicilios", group: "Domicilios" },
  { code: "DELIVERIES_EDIT", label: "Gestionar domicilios", group: "Domicilios" },
  { code: "DELIVERIES_DISPATCH", label: "Actualizar entregas asignadas", group: "Domicilios" },
];

export const defaultPermissionCodesByRole = {
  ADMIN: permissionCatalog.map((item) => item.code),
  CAJERO: [
    "CLIENTS_VIEW",
    "PRODUCTS_VIEW",
    "RECEIVABLES_VIEW",
    "RECEIVABLES_EDIT",
    "BANKS_VIEW",
    "BANKS_EDIT",
    "SALES_CREATE",
  ],
  VENDEDOR: [
    "CLIENTS_VIEW",
    "CLIENTS_EDIT",
    "PRODUCTS_VIEW",
    "RECEIVABLES_VIEW",
    "RECEIVABLES_EDIT",
    "SALES_CREATE",
  ],
  BODEGA: [
    "PRODUCTS_VIEW",
    "INVENTORY_EDIT",
    "PROVIDERS_VIEW",
    "PAYABLES_VIEW",
    "PAYABLES_EDIT",
    "PURCHASES_VIEW",
    "PURCHASES_EDIT",
    "DELIVERIES_VIEW",
    "DELIVERIES_DISPATCH",
  ],
  CONTADOR: [
    "CLIENTS_VIEW",
    "PROVIDERS_VIEW",
    "PRODUCTS_VIEW",
    "RETENTIONS_VIEW",
    "PAYABLES_VIEW",
    "PAYABLES_EDIT",
    "RECEIVABLES_VIEW",
    "RECEIVABLES_EDIT",
    "PURCHASES_VIEW",
    "PURCHASES_EDIT",
    "BANKS_VIEW",
    "BANKS_EDIT",
    "OFFERS_VIEW",
    "REFERRALS_VIEW",
    "REPORTS_VIEW",
  ],
  DOMICILIARIO: ["DELIVERIES_VIEW", "DELIVERIES_DISPATCH"],
  CLIENTE: [],
};

export function effectivePermissionCodes(role, rows = []) {
  const allowed = new Set(defaultPermissionCodesByRole[role] ?? []);
  rows.forEach((row) => {
    if (row.isAllowed) allowed.add(row.code);
    else allowed.delete(row.code);
  });
  return [...allowed];
}

export function buildPermissionDraft(role, rows = []) {
  const allowed = new Set(effectivePermissionCodes(role, rows));
  return Object.fromEntries(
    permissionCatalog.map((item) => [item.code, allowed.has(item.code)]),
  );
}

export function permissionOverrides(role, draft) {
  const defaults = new Set(defaultPermissionCodesByRole[role] ?? []);
  return permissionCatalog
    .filter((item) => Boolean(draft[item.code]) !== defaults.has(item.code))
    .map((item) => ({ code: item.code, isAllowed: Boolean(draft[item.code]) }));
}

export function permissionSelections(draft) {
  return permissionCatalog.map((item) => ({
    code: item.code,
    isAllowed: Boolean(draft[item.code]),
  }));
}
