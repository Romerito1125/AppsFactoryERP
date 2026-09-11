export const permissionCatalog = [
  { code: 'CLIENTS_VIEW', label: 'Consultar clientes', group: 'Archivos' },
  {
    code: 'CLIENTS_EDIT',
    label: 'Crear y modificar clientes',
    group: 'Archivos',
  },
  { code: 'PROVIDERS_VIEW', label: 'Consultar proveedores', group: 'Archivos' },
  {
    code: 'PROVIDERS_EDIT',
    label: 'Crear y modificar proveedores',
    group: 'Archivos',
  },
  { code: 'PRODUCTS_VIEW', label: 'Consultar productos', group: 'Inventario' },
  {
    code: 'PRODUCTS_EDIT',
    label: 'Crear y modificar productos',
    group: 'Inventario',
  },
  { code: 'INVENTORY_EDIT', label: 'Ajustar existencias', group: 'Inventario' },
  {
    code: 'RETENTIONS_VIEW',
    label: 'Consultar retenciones',
    group: 'Configuración',
  },
  {
    code: 'RETENTIONS_EDIT',
    label: 'Configurar retenciones',
    group: 'Configuración',
  },
  {
    code: 'USERS_MANAGE',
    label: 'Administrar usuarios y accesos',
    group: 'Configuración',
  },
  {
    code: 'PAYABLES_VIEW',
    label: 'Consultar cuentas por pagar',
    group: 'Transacciones',
  },
  {
    code: 'PAYABLES_EDIT',
    label: 'Gestionar compras por pagar',
    group: 'Transacciones',
  },
  {
    code: 'RECEIVABLES_VIEW',
    label: 'Consultar cuentas por cobrar',
    group: 'Transacciones',
  },
  {
    code: 'RECEIVABLES_EDIT',
    label: 'Registrar créditos y pagos',
    group: 'Transacciones',
  },
  {
    code: 'PURCHASES_VIEW',
    label: 'Consultar compras',
    group: 'Transacciones',
  },
  {
    code: 'PURCHASES_EDIT',
    label: 'Gestionar compras',
    group: 'Transacciones',
  },
  {
    code: 'BANKS_VIEW',
    label: 'Consultar bancos',
    group: 'Transacciones',
  },
  {
    code: 'BANKS_EDIT',
    label: 'Gestionar bancos',
    group: 'Transacciones',
  },
  { code: 'SALES_CREATE', label: 'Registrar ventas', group: 'Transacciones' },
] as const;

export const permissionCodes = permissionCatalog.map((item) => item.code);

export const defaultPermissionCodesByRole: Record<string, readonly string[]> = {
  ADMIN: permissionCodes,
  CAJERO: [
    'CLIENTS_VIEW',
    'PRODUCTS_VIEW',
    'RECEIVABLES_VIEW',
    'RECEIVABLES_EDIT',
    'BANKS_VIEW',
    'BANKS_EDIT',
    'SALES_CREATE',
  ],
  VENDEDOR: [
    'CLIENTS_VIEW',
    'CLIENTS_EDIT',
    'PRODUCTS_VIEW',
    'RECEIVABLES_VIEW',
    'RECEIVABLES_EDIT',
    'SALES_CREATE',
  ],
  BODEGA: [
    'PRODUCTS_VIEW',
    'INVENTORY_EDIT',
    'PROVIDERS_VIEW',
    'PAYABLES_VIEW',
    'PAYABLES_EDIT',
    'PURCHASES_VIEW',
    'PURCHASES_EDIT',
  ],
  CONTADOR: [
    'CLIENTS_VIEW',
    'PROVIDERS_VIEW',
    'PRODUCTS_VIEW',
    'RETENTIONS_VIEW',
    'PAYABLES_VIEW',
    'PAYABLES_EDIT',
    'RECEIVABLES_VIEW',
    'RECEIVABLES_EDIT',
    'PURCHASES_VIEW',
    'PURCHASES_EDIT',
    'BANKS_VIEW',
    'BANKS_EDIT',
  ],
  CLIENTE: [],
};

export function effectivePermissionCodes(
  role: string,
  rows: Array<{ code: string; isAllowed: boolean }> = [],
) {
  const allowed = new Set(defaultPermissionCodesByRole[role] ?? []);
  for (const row of rows) {
    if (row.isAllowed) allowed.add(row.code);
    else allowed.delete(row.code);
  }
  return [...allowed];
}
