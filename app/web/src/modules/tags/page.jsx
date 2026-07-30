import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Controller } from 'react-hook-form'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  productIds: z.array(z.number()).optional(),
  offerIds: z.array(z.number()).optional(),
})

function MultiSelectTargetField({ field: configField, control }) {
  const [query, setQuery] = useState('')
  const items = configField.items ?? []

  return (
    <Controller
      name={configField.name}
      control={control}
      render={({ field }) => {
        const selectedIds = Array.isArray(field.value) ? field.value : []
        const filteredItems = query.trim()
          ? items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
          : items

        function toggleItem(id) {
          if (selectedIds.includes(id)) {
            field.onChange(selectedIds.filter((item) => item !== id))
            return
          }

          field.onChange([...selectedIds, id])
        }

        return (
          <div className="grid gap-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={configField.searchPlaceholder ?? `Buscar ${configField.label.toLowerCase()}...`}
            />
            <div className="max-h-44 overflow-y-auto rounded-2xl border border-border/70 bg-muted/15 p-3">
              {filteredItems.length ? (
                <div className="flex flex-wrap gap-2">
                  {filteredItems.map((item) => {
                    const active = selectedIds.includes(item.id)

                    return (
                      <Button
                        key={item.id}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        className="rounded-full"
                        onClick={() => toggleItem(item.id)}
                      >
                        {item.label}
                      </Button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{configField.emptyLabel ?? 'No hay registros disponibles'}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedIds.length ? `${formatNumber(selectedIds.length)} seleccionados` : 'Sin elementos asociados.'}
            </p>
          </div>
        )
      }}
    />
  )
}

function createTagsConfig(products, offers) {
  return {
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
    {
      name: 'productIds',
      label: 'Productos asociados',
      render: MultiSelectTargetField,
      fullWidth: true,
      items: products.map((item) => ({ id: item.id, label: `${item.name} · ${item.brand ?? 'Sin marca'}` })),
      searchPlaceholder: 'Buscar productos por nombre o marca...',
      emptyLabel: 'No hay productos disponibles',
    },
    {
      name: 'offerIds',
      label: 'Ofertas asociadas',
      render: MultiSelectTargetField,
      fullWidth: true,
      items: offers.map((item) => ({ id: item.id, label: item.name })),
      searchPlaceholder: 'Buscar ofertas por nombre...',
      emptyLabel: 'No hay ofertas disponibles',
    },
  ],
  createSchema: tagSchema,
  updateSchema: tagSchema,
  getDefaultValues: (_, record) => ({
    name: record?.name ?? '',
    description: record?.description ?? '',
    productIds: record?.products?.map((item) => item.product.id) ?? [],
    offerIds: record?.offers?.map((item) => item.offer.id) ?? [],
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
    const inUseCount = rawRecords.filter(
      (record) => Number(record._count?.products ?? 0) > 0 || Number(record._count?.offers ?? 0) > 0,
    ).length

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
      {
        label: 'Etiquetas en uso',
        value: formatNumber(inUseCount),
        help: 'Etiquetas actualmente asociadas a productos u ofertas.',
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
      key: 'usage',
      label: 'Uso',
      render: (record) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatNumber(record._count?.products ?? 0)} productos</Badge>
          <Badge variant="outline">{formatNumber(record._count?.offers ?? 0)} ofertas</Badge>
        </div>
      ),
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
          { label: 'Productos vinculados', value: formatNumber(record._count?.products ?? 0) },
          { label: 'Ofertas vinculadas', value: formatNumber(record._count?.offers ?? 0) },
          { label: 'Estado', value: getRecordStatus(record) },
        ],
      },
      {
        label: 'Relaciones actuales',
        items: [
          {
            label: 'Productos',
            value: record.products?.length
              ? record.products.map((item) => item.product.name).join(' · ')
              : 'Sin productos asociados',
          },
          {
            label: 'Ofertas',
            value: record.offers?.length
              ? record.offers.map((item) => item.offer.name).join(' · ')
              : 'Sin ofertas asociadas',
          },
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
}

export function TagsPage() {
  const productsQuery = useQuery({
    queryKey: ['etiquetas-productos'],
    queryFn: () => apiClient.getAllPages('/productos'),
  })

  const offersQuery = useQuery({
    queryKey: ['etiquetas-ofertas'],
    queryFn: () => apiClient.getAllPages('/ofertas'),
  })

  return (
    <CrudModulePage
      config={createTagsConfig(productsQuery.data ?? [], offersQuery.data ?? [])}
      lookupsLoading={productsQuery.isLoading || offersQuery.isLoading}
    />
  )
}
