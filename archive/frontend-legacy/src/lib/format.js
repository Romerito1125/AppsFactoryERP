const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
})

const numberFormatter = new Intl.NumberFormat('es-CO')

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const roleLabels = {
  ADMIN: 'Administrador',
  CAJERO: 'Cajero',
  VENDEDOR: 'Vendedor',
  BODEGA: 'Bodega',
  CONTADOR: 'Contador',
}

const clientTypeLabels = {
  MAYORISTA: 'Mayorista',
  MINORISTA: 'Minorista',
}

const invoiceStatusLabels = {
  ACTIVA: 'Activa',
  ANULADA: 'Anulada',
}

const invoiceSourceLabels = {
  ADMIN: 'Administrador',
  POS: 'POS',
  APP_MOVIL: 'App movil',
}

export const statusOptions = [
  { value: 'activos', label: 'Activos' },
  { value: 'inactivos', label: 'Inactivos' },
  { value: 'todos', label: 'Todos' },
]

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value ?? 0))
}

export function formatNumber(value) {
  return numberFormatter.format(Number(value ?? 0))
}

export function formatDate(value) {
  if (!value) {
    return 'Sin fecha'
  }

  return dateFormatter.format(new Date(value))
}

export function formatRole(value) {
  return roleLabels[value] ?? value ?? 'Sin rol'
}

export function formatClientType(value) {
  return clientTypeLabels[value] ?? value ?? 'Sin tipo'
}

export function formatInvoiceStatus(value) {
  return invoiceStatusLabels[value] ?? value ?? 'Sin estado'
}

export function formatInvoiceSource(value) {
  return invoiceSourceLabels[value] ?? value ?? 'Sin origen'
}

export function getRecordStatus(record) {
  return record?.isActive === false ? 'Inactivo' : 'Activo'
}

export function getRecordStatusVariant(record) {
  return record?.isActive === false ? 'secondary' : 'default'
}

export function toApiStatus(status) {
  return status === 'activos' ? undefined : status
}

export function toNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function matchesSearch(record, search, resolver) {
  if (!search) {
    return true
  }

  const haystack = normalizeSearchText(
    resolver(record)
      .filter(Boolean)
      .join(' '),
  )

  return haystack.includes(normalizeSearchText(search))
}

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function monthLabel(value) {
  return new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(
    new Date(value),
  )
}
