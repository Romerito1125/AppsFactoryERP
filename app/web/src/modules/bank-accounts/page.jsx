import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  getRecordStatus,
  getRecordStatusVariant,
  toApiStatus,
} from '@/lib/format'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const createBankAccountSchema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  bankName: z.string().min(2, 'Minimo 2 caracteres'),
  accountNumber: z.string().optional(),
  accountType: z.string().optional(),
  currentBalance: z.number({ message: 'Saldo inicial obligatorio' }).min(0, 'No puede ser negativo'),
})

const updateBankAccountSchema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  bankName: z.string().min(2, 'Minimo 2 caracteres'),
  accountNumber: z.string().optional(),
  accountType: z.string().optional(),
})

const bankAccountsConfig = {
  key: 'cuentas-bancarias',
  title: 'Cuentas bancarias',
  description: 'Administra las cuentas financieras que usa tesoreria para recaudos y egresos.',
  singularLabel: 'Cuenta bancaria',
  badgeLabel: 'Tesoreria · Bancos',
  createButtonLabel: 'Nueva cuenta',
  createTitle: 'Crear cuenta bancaria',
  editTitle: 'Actualizar cuenta bancaria',
  createDescription: 'Registra una cuenta con banco, numero y saldo inicial.',
  editDescription: 'Ajusta datos descriptivos de la cuenta seleccionada.',
  submitCreateLabel: 'Crear cuenta',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Directorio de cuentas',
  tableDescription: 'Consulta cuentas activas e inactivas con su saldo actual.',
  searchPlaceholder: 'Buscar por nombre, banco o numero de cuenta...',
  emptyTitle: 'No hay cuentas registradas',
  emptyDescription: 'Crea la primera cuenta bancaria para empezar a registrar movimientos.',
  archiveLoadingLabel: 'Desactivando cuenta...',
  archiveSuccessLabel: 'Cuenta desactivada',
  archiveConfirmationLabel: 'La cuenta dejara de estar disponible para movimientos nuevos.',
  reactivateLoadingLabel: 'Reactivando cuenta...',
  reactivateSuccessLabel: 'Cuenta reactivada',
  reactivateConfirmationLabel: 'La cuenta volvera a quedar disponible para tesoreria.',
  statusFilter: 'api',
  fields: [
    { name: 'name', label: 'Nombre', placeholder: 'Caja principal' },
    { name: 'bankName', label: 'Banco', placeholder: 'Bancolombia' },
    { name: 'accountNumber', label: 'Numero de cuenta', placeholder: '1234567890' },
    { name: 'accountType', label: 'Tipo de cuenta', placeholder: 'AHORROS' },
    {
      name: 'currentBalance',
      label: 'Saldo inicial',
      type: 'number',
      placeholder: '500000',
      hiddenOnEdit: true,
    },
  ],
  createSchema: createBankAccountSchema,
  updateSchema: updateBankAccountSchema,
  getDefaultValues: (_, record) => ({
    name: record?.name ?? '',
    bankName: record?.bankName ?? '',
    accountNumber: record?.accountNumber ?? '',
    accountType: record?.accountType ?? '',
    currentBalance: Number(record?.currentBalance ?? 0),
  }),
  fetchRecords: (status) => apiClient.get('/cuentas-bancarias', { estado: toApiStatus(status) }),
  createRecord: (payload) => apiClient.post('/cuentas-bancarias', payload),
  updateRecord: (id, payload) => apiClient.patch(`/cuentas-bancarias/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/cuentas-bancarias/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/cuentas-bancarias/${id}/reactivar`),
  searchResolver: (record) => [record.name, record.bankName, record.accountNumber, record.accountType],
  getSummaryCards: ({ rawRecords }) => {
    const activeCount = rawRecords.filter((record) => record.isActive).length
    const totalBalance = rawRecords.reduce((sum, record) => sum + Number(record.currentBalance ?? 0), 0)

    return [
      {
        label: 'Cuentas visibles',
        value: formatNumber(rawRecords.length),
        help: 'Total mostrado segun el filtro actual.',
      },
      {
        label: 'Cuentas activas',
        value: formatNumber(activeCount),
        help: 'Disponibles para tesoreria operativa.',
      },
      {
        label: 'Saldo consolidado',
        value: formatCurrency(totalBalance),
        help: 'Suma de saldos actuales de las cuentas cargadas.',
      },
      {
        label: 'Cuentas inactivas',
        value: formatNumber(rawRecords.length - activeCount),
        help: 'Cuentas preservadas para historico.',
      },
    ]
  },
  columns: [
    {
      key: 'account',
      label: 'Cuenta',
      render: (record) => (
        <div>
          <p className="font-medium text-foreground">{record.name}</p>
          <p className="text-xs text-muted-foreground">{record.bankName}</p>
        </div>
      ),
    },
    {
      key: 'details',
      label: 'Detalle',
      render: (record) => (
        <div>
          <p>{record.accountNumber ?? 'Sin numero'}</p>
          <p className="text-xs text-muted-foreground">{record.accountType ?? 'Sin tipo'}</p>
        </div>
      ),
    },
    {
      key: 'balance',
      label: 'Saldo',
      render: (record) => formatCurrency(record.currentBalance),
    },
    {
      key: 'status',
      label: 'Estado',
      render: (record) => (
        <Badge variant={getRecordStatusVariant(record)}>{getRecordStatus(record)}</Badge>
      ),
    },
  ],
  getDetailTitle: (record) => record.name,
  getDetailDescription: (record) => `${record.bankName} · ${record.accountNumber ?? 'Sin numero'}`,
  getDetailSections: (record) => [
    {
      label: 'Cuenta',
      items: [
        { label: 'Banco', value: record.bankName },
        { label: 'Numero', value: record.accountNumber ?? 'Sin numero' },
        { label: 'Tipo', value: record.accountType ?? 'Sin tipo' },
        { label: 'Saldo actual', value: formatCurrency(record.currentBalance) },
      ],
    },
    {
      label: 'Trazabilidad',
      items: [
        { label: 'Estado', value: getRecordStatus(record) },
        { label: 'Creado', value: formatDate(record.createdAt) },
        { label: 'Actualizado', value: formatDate(record.updatedAt) },
        { label: 'Eliminado', value: record.deletedAt ? formatDate(record.deletedAt) : 'No' },
      ],
    },
  ],
}

export function BankAccountsPage() {
  return <CrudModulePage config={bankAccountsConfig} />
}
