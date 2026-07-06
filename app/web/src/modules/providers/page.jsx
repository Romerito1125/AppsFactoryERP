import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import {
  formatDate,
  formatNumber,
  getRecordStatus,
  getRecordStatusVariant,
  toApiStatus,
} from '@/lib/format'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const providerSchema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  description: z.string().optional(),
})

const providersConfig = {
  key: 'proveedores',
  title: 'Proveedores',
  description: 'Centraliza los proveedores operativos asociados al catalogo de productos.',
  singularLabel: 'Proveedor',
  badgeLabel: 'Catalogo · Compras',
  createButtonLabel: 'Nuevo proveedor',
  createTitle: 'Crear proveedor',
  editTitle: 'Actualizar proveedor',
  createDescription: 'Registra un nuevo proveedor para el catalogo y abastecimiento.',
  editDescription: 'Ajusta el nombre o descripcion del proveedor seleccionado.',
  submitCreateLabel: 'Crear proveedor',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Directorio de proveedores',
  tableDescription: 'Vista centralizada de proveedores activos e inactivos.',
  searchPlaceholder: 'Buscar por nombre o descripcion...',
  emptyTitle: 'No hay proveedores registrados',
  emptyDescription: 'Crea el primer proveedor para empezar a relacionar productos.',
  archiveLoadingLabel: 'Desactivando proveedor...',
  archiveSuccessLabel: 'Proveedor desactivado',
  archiveConfirmationLabel: 'El proveedor dejara de estar disponible para productos nuevos.',
  reactivateLoadingLabel: 'Reactivando proveedor...',
  reactivateSuccessLabel: 'Proveedor reactivado',
  reactivateConfirmationLabel: 'El proveedor volvera a quedar disponible en el catalogo.',
  statusFilter: 'api',
  fields: [
    { name: 'name', label: 'Nombre', placeholder: 'Proveedor principal' },
    {
      name: 'description',
      label: 'Descripcion',
      type: 'textarea',
      placeholder: 'Descripcion breve del proveedor',
      rows: 3,
      fullWidth: true,
    },
  ],
  createSchema: providerSchema,
  updateSchema: providerSchema,
  getDefaultValues: (_, record) => ({
    name: record?.name ?? '',
    description: record?.description ?? '',
  }),
  fetchRecords: ({ status, search, page, limit }) =>
    apiClient.get('/proveedores', { estado: toApiStatus(status), q: search, page, limit }),
  createRecord: (payload) => apiClient.post('/proveedores', payload),
  updateRecord: (id, payload) => apiClient.patch(`/proveedores/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/proveedores/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/proveedores/${id}/reactivar`),
  searchResolver: (record) => [record.name, record.description],
  getSummaryCards: ({ rawRecords }) => {
    const activeCount = rawRecords.filter((record) => record.isActive).length

    return [
      {
        label: 'Proveedores visibles',
        value: formatNumber(rawRecords.length),
        help: 'Total mostrado segun el filtro de estado.',
      },
      {
        label: 'Proveedores activos',
        value: formatNumber(activeCount),
        help: 'Disponibles para asignar a productos nuevos.',
      },
      {
        label: 'Proveedores inactivos',
        value: formatNumber(rawRecords.length - activeCount),
        help: 'Registros preservados para trazabilidad.',
      },
      {
        label: 'Con descripcion',
        value: formatNumber(rawRecords.filter((record) => record.description).length),
        help: 'Proveedores con contexto adicional documentado.',
      },
    ]
  },
  columns: [
    {
      key: 'name',
      label: 'Proveedor',
      render: (record) => (
        <div>
          <p className="font-medium text-foreground">{record.name}</p>
          <p className="text-xs text-muted-foreground">ID #{record.id}</p>
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Descripcion',
      render: (record) => record.description ?? 'Sin descripcion',
    },
    {
      key: 'status',
      label: 'Estado',
      render: (record) => (
        <Badge variant={getRecordStatusVariant(record)}>{getRecordStatus(record)}</Badge>
      ),
    },
    {
      key: 'updatedAt',
      label: 'Actualizado',
      render: (record) => formatDate(record.updatedAt),
    },
  ],
  getDetailTitle: (record) => record.name,
  getDetailDescription: (record) => `Proveedor #${record.id}`,
  getDetailSections: (record) => [
    {
      label: 'Informacion general',
      items: [
        { label: 'Nombre', value: record.name },
        { label: 'Descripcion', value: record.description ?? 'Sin descripcion' },
        { label: 'Estado', value: getRecordStatus(record) },
      ],
    },
    {
      label: 'Trazabilidad',
      items: [
        { label: 'Creado', value: formatDate(record.createdAt) },
        { label: 'Actualizado', value: formatDate(record.updatedAt) },
        { label: 'Eliminado', value: record.deletedAt ? formatDate(record.deletedAt) : 'No' },
      ],
    },
  ],
}

export function ProvidersPage() {
  return <CrudModulePage config={providersConfig} />
}
