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

const warehouseSchema = z.object({
  location: z.string().min(4, 'Minimo 4 caracteres'),
})

const warehousesConfig = {
  key: 'bodegas',
  title: 'Bodegas',
  description:
    'Controla las ubicaciones operativas donde se concentra el inventario de la empresa.',
  singularLabel: 'Bodega',
  badgeLabel: 'Inventario · Infraestructura',
  createButtonLabel: 'Nueva bodega',
  createTitle: 'Crear bodega',
  editTitle: 'Actualizar bodega',
  createDescription: 'Registra una nueva ubicacion de almacenamiento.',
  editDescription: 'Ajusta nombre o estado de la ubicacion fisica.',
  submitCreateLabel: 'Crear bodega',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Mapa de ubicaciones',
  tableDescription: 'Vista de las bodegas creadas y su vigencia operativa.',
  searchPlaceholder: 'Buscar por ubicacion...',
  emptyTitle: 'No hay bodegas cargadas',
  emptyDescription: 'Crea una bodega para empezar a asignar productos.',
  archiveLoadingLabel: 'Desactivando bodega...',
  archiveSuccessLabel: 'Bodega desactivada',
  archiveConfirmationLabel:
    'La bodega dejara de estar disponible para nuevas asignaciones pero conserva su historial.',
  reactivateLoadingLabel: 'Reactivando bodega...',
  reactivateSuccessLabel: 'Bodega reactivada',
  reactivateConfirmationLabel:
    'La bodega volvera a estar disponible para recibir productos.',
  statusFilter: 'api',
  fields: [{ name: 'location', label: 'Ubicacion', placeholder: 'Bodega principal Bogota' }],
  createSchema: warehouseSchema,
  updateSchema: warehouseSchema,
  getDefaultValues: (_, record) => ({
    location: record?.location ?? '',
  }),
  fetchRecords: ({ status, search, page, limit }) =>
    apiClient.get('/bodegas', { estado: toApiStatus(status), q: search, page, limit }),
  createRecord: (payload) => apiClient.post('/bodegas', payload),
  updateRecord: (id, payload) => apiClient.patch(`/bodegas/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/bodegas/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/bodegas/${id}/reactivar`),
  searchResolver: (record) => [record.location],
  getSummaryCards: ({ rawRecords }) => {
    const activeCount = rawRecords.filter((record) => record.isActive).length
    const warehousesWithStock = rawRecords.filter((record) => Number(record._count?.products ?? 0) > 0).length
    const recentlyCreated = rawRecords.filter((record) => {
      const createdAt = new Date(record.createdAt)
      const difference = Date.now() - createdAt.getTime()
      return difference <= 1000 * 60 * 60 * 24 * 30
    }).length

    return [
      {
        label: 'Bodegas visibles',
        value: formatNumber(rawRecords.length),
        help: 'Cantidad mostrada segun el filtro de estado seleccionado.',
      },
      {
        label: 'Bodegas activas',
        value: formatNumber(activeCount),
        help: 'Ubicaciones disponibles para inventario nuevo.',
      },
      {
        label: 'Bodegas inactivas',
        value: formatNumber(rawRecords.length - activeCount),
        help: 'Ubicaciones preservadas para trazabilidad historica.',
      },
      {
        label: 'Creadas este mes',
        value: formatNumber(recentlyCreated),
        help: 'Nuevas ubicaciones registradas en los ultimos 30 dias.',
      },
      {
        label: 'Con productos',
        value: formatNumber(warehousesWithStock),
        help: 'Bodegas que hoy tienen productos visibles con stock.',
      },
    ]
  },
  columns: [
    {
      key: 'location',
      label: 'Ubicacion',
      render: (record) => (
        <div>
          <p className="font-medium text-foreground">{record.location}</p>
          <p className="text-xs text-muted-foreground">ID #{record.id}</p>
        </div>
      ),
    },
    {
      key: 'usage',
      label: 'Productos visibles',
      render: (record) => formatNumber(record._count?.products ?? 0),
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
      label: 'Ultima actualizacion',
      render: (record) => formatDate(record.updatedAt),
    },
  ],
  getDetailTitle: (record) => record.location,
  getDetailDescription: (record) => `Bodega operativa #${record.id}`,
  getDetailSections: (record) => [
    {
      label: 'Ubicacion',
        items: [
          { label: 'Nombre', value: record.location },
          { label: 'Productos visibles', value: formatNumber(record._count?.products ?? 0) },
          {
            label: 'Top productos',
            value: record.products?.length
              ? record.products
                  .map((item) => `${item.product?.name ?? `Producto #${item.productId}`} (${formatNumber(item.quantity)})`)
                  .join(' · ')
              : 'Sin productos con stock en esta bodega',
          },
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

export function WarehousesPage() {
  return <CrudModulePage config={warehousesConfig} />
}
