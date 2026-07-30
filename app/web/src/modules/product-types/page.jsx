import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { ProductImage } from '@/components/product-image'
import { apiClient } from '@/lib/api-client'
import {
  formatDate,
  formatNumber,
  getRecordStatus,
  getRecordStatusVariant,
  toApiStatus,
} from '@/lib/format'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const productTypeSchema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
})

const productTypesConfig = {
  key: 'tipos-producto',
  title: 'Tipos de producto',
  description: 'Administra las clasificaciones base que usa el catalogo de productos.',
  singularLabel: 'Tipo de producto',
  badgeLabel: 'Catalogo · Maestros',
  createButtonLabel: 'Nuevo tipo',
  createTitle: 'Crear tipo de producto',
  editTitle: 'Actualizar tipo de producto',
  createDescription: 'Registra una nueva clasificacion para el catalogo.',
  editDescription: 'Ajusta el nombre o descripcion del tipo seleccionado.',
  submitCreateLabel: 'Crear tipo',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Clasificaciones disponibles',
  tableDescription: 'Tipos activos e inactivos disponibles para el catalogo.',
  searchPlaceholder: 'Buscar por nombre o descripcion...',
  emptyTitle: 'No hay tipos de producto',
  emptyDescription: 'Crea la primera clasificacion para organizar el catalogo.',
  archiveLoadingLabel: 'Desactivando tipo...',
  archiveSuccessLabel: 'Tipo desactivado',
  archiveConfirmationLabel: 'El tipo dejara de estar disponible para nuevos productos.',
  reactivateLoadingLabel: 'Reactivando tipo...',
  reactivateSuccessLabel: 'Tipo reactivado',
  reactivateConfirmationLabel: 'El tipo volvera a quedar disponible para el catalogo.',
  statusFilter: 'api',
  fields: [
    { name: 'name', label: 'Nombre', placeholder: 'Lacteos' },
    { name: 'imageUrl', label: 'URL de imagen', placeholder: 'https://...' },
    {
      name: 'description',
      label: 'Descripcion',
      type: 'textarea',
      placeholder: 'Descripcion breve del tipo',
      rows: 3,
      fullWidth: true,
    },
  ],
  createSchema: productTypeSchema,
  updateSchema: productTypeSchema,
  getDefaultValues: (_, record) => ({
    name: record?.name ?? '',
    description: record?.description ?? '',
    imageUrl: record?.imageUrl ?? '',
  }),
  fetchRecords: ({ status, search, page, limit }) =>
    apiClient.get('/tipos-producto', { estado: toApiStatus(status), q: search, page, limit }),
  createRecord: (payload) => apiClient.post('/tipos-producto', payload),
  updateRecord: (id, payload) => apiClient.patch(`/tipos-producto/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/tipos-producto/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/tipos-producto/${id}/reactivar`),
  searchResolver: (record) => [record.name, record.description, record.imageUrl],
  getSummaryCards: ({ rawRecords }) => {
    const activeCount = rawRecords.filter((record) => record.isActive).length

    return [
      {
        label: 'Tipos visibles',
        value: formatNumber(rawRecords.length),
        help: 'Total mostrado segun el filtro de estado.',
      },
      {
        label: 'Tipos activos',
        value: formatNumber(activeCount),
        help: 'Clasificaciones disponibles para productos nuevos.',
      },
      {
        label: 'Tipos inactivos',
        value: formatNumber(rawRecords.length - activeCount),
        help: 'Clasificaciones preservadas para historico.',
      },
      {
        label: 'Con descripcion',
        value: formatNumber(rawRecords.filter((record) => record.description).length),
        help: 'Registros con contexto funcional documentado.',
      },
    ]
  },
  columns: [
      {
        key: 'name',
        label: 'Tipo',
        render: (record) => (
          <div className="flex items-center gap-3">
            <ProductImage src={record.imageUrl} alt={record.name} className="size-12 rounded-lg" iconClassName="size-4" />
            <div>
            <p className="font-medium text-foreground">{record.name}</p>
            <p className="text-xs text-muted-foreground">ID #{record.id}</p>
            </div>
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
  getDetailDescription: (record) => `Tipo de producto #${record.id}`,
  getDetailSections: (record) => [
    {
      label: 'Informacion general',
        items: [
          { label: 'Nombre', value: record.name },
          { label: 'Imagen', value: <ProductImage src={record.imageUrl} alt={record.name} className="size-20 rounded-xl" iconClassName="size-5" /> },
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

export function ProductTypesPage() {
  return <CrudModulePage config={productTypesConfig} />
}
