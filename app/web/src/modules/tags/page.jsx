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

const tagSchema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  description: z.string().optional(),
})

const tagsConfig = {
  key: 'etiquetas',
  title: 'Etiquetas',
  description: 'Agrupa productos y reglas comerciales mediante etiquetas reutilizables.',
  singularLabel: 'Etiqueta',
  badgeLabel: 'Catalogo · Segmentacion',
  createButtonLabel: 'Nueva etiqueta',
  createTitle: 'Crear etiqueta',
  editTitle: 'Actualizar etiqueta',
  createDescription: 'Registra una nueva etiqueta para clasificar productos y ofertas.',
  editDescription: 'Ajusta el nombre o descripcion de la etiqueta seleccionada.',
  submitCreateLabel: 'Crear etiqueta',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Etiquetas disponibles',
  tableDescription: 'Vista centralizada de etiquetas activas e inactivas.',
  searchPlaceholder: 'Buscar por nombre o descripcion...',
  emptyTitle: 'No hay etiquetas registradas',
  emptyDescription: 'Crea la primera etiqueta para empezar a segmentar el catalogo.',
  archiveLoadingLabel: 'Desactivando etiqueta...',
  archiveSuccessLabel: 'Etiqueta desactivada',
  archiveConfirmationLabel: 'La etiqueta dejara de estar disponible para nuevas relaciones.',
  reactivateLoadingLabel: 'Reactivando etiqueta...',
  reactivateSuccessLabel: 'Etiqueta reactivada',
  reactivateConfirmationLabel: 'La etiqueta volvera a quedar disponible para el catalogo.',
  statusFilter: 'api',
  fields: [
    { name: 'name', label: 'Nombre', placeholder: 'Promocion' },
    {
      name: 'description',
      label: 'Descripcion',
      type: 'textarea',
      placeholder: 'Descripcion breve de la etiqueta',
      rows: 3,
      fullWidth: true,
    },
  ],
  createSchema: tagSchema,
  updateSchema: tagSchema,
  getDefaultValues: (_, record) => ({
    name: record?.name ?? '',
    description: record?.description ?? '',
  }),
  fetchRecords: ({ status, search, page, limit }) =>
    apiClient.get('/etiquetas', { estado: toApiStatus(status), q: search, page, limit }),
  createRecord: (payload) => apiClient.post('/etiquetas', payload),
  updateRecord: (id, payload) => apiClient.patch(`/etiquetas/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/etiquetas/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/etiquetas/${id}/reactivar`),
  searchResolver: (record) => [record.name, record.description],
  getSummaryCards: ({ rawRecords }) => {
    const activeCount = rawRecords.filter((record) => record.isActive).length

    return [
      {
        label: 'Etiquetas visibles',
        value: formatNumber(rawRecords.length),
        help: 'Total mostrado segun el filtro de estado.',
      },
      {
        label: 'Etiquetas activas',
        value: formatNumber(activeCount),
        help: 'Disponibles para productos y ofertas.',
      },
      {
        label: 'Etiquetas inactivas',
        value: formatNumber(rawRecords.length - activeCount),
        help: 'Registros preservados para trazabilidad.',
      },
      {
        label: 'Con descripcion',
        value: formatNumber(rawRecords.filter((record) => record.description).length),
        help: 'Etiquetas con contexto funcional documentado.',
      },
    ]
  },
  columns: [
    {
      key: 'name',
      label: 'Etiqueta',
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
  getDetailDescription: (record) => `Etiqueta #${record.id}`,
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

export function TagsPage() {
  return <CrudModulePage config={tagsConfig} />
}
