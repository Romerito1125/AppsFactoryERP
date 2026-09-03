import { useRef } from 'react'
import { Controller } from 'react-hook-form'
import { z } from 'zod'
import { FileImage, UploadCloud, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const optionalImageSchema = z
  .custom(
    (value) => value === undefined || value === null || (typeof File !== 'undefined' && value instanceof File),
    'Selecciona una imagen valida',
  )
  .optional()
  .refine((file) => !file || file.size <= 5 * 1024 * 1024, 'La imagen no puede superar 5 MB')
  .refine((file) => !file || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type), 'Usa una imagen JPG, PNG o WEBP')

const productTypeSchema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  description: z.string().optional(),
  image: optionalImageSchema,
  clearImage: z.boolean().optional(),
})

function buildProductTypeFormData(values) {
  const formData = new FormData()

  if (values.name) formData.append('name', values.name)
  if (values.description) formData.append('description', values.description)
  if (values.image instanceof File) formData.append('image', values.image)
  if (values.clearImage) formData.append('clearImage', 'true')

  return formData
}

function ProductTypeImageField({ field: configField, control, setValue, record }) {
  const inputRef = useRef(null)

  return (
    <Controller
      name={configField.name}
      control={control}
      render={({ field }) => {
        const hasCurrentImage = Boolean(record?.imageUrl)
        const selectedFile = field.value instanceof File ? field.value : null

        return (
          <div className="grid gap-3">
            {hasCurrentImage ? (
              <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                <ProductImage src={record.imageUrl} alt={record?.name ?? 'Tipo de producto'} className="size-16 rounded-lg" iconClassName="size-4" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Imagen actual</p>
                  <p className="text-xs text-muted-foreground">Puedes reemplazarla o quitarla.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      field.onChange(undefined)
                      setValue('clearImage', true, { shouldDirty: true, shouldValidate: true })
                      if (inputRef.current) {
                        inputRef.current.value = ''
                      }
                    }}
                  >
                    <X className="mr-2 size-4" />
                    Quitar
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/15 p-3 transition-colors hover:border-primary/50 hover:bg-primary/[0.03]">
              <input
                ref={inputRef}
                id={configField.name}
                type="file"
                accept={configField.accept}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? undefined
                  field.onChange(file)
                  if (file) {
                    setValue('clearImage', false, { shouldDirty: true, shouldValidate: true })
                  }
                }}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileImage className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {selectedFile?.name ?? 'Añade una imagen'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedFile ? `${Math.ceil(selectedFile.size / 1024)} KB · lista para subir` : 'JPG, PNG o WEBP · máximo 5 MB'}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => inputRef.current?.click()}>
                  <UploadCloud className="mr-2 size-4" />
                  {selectedFile ? 'Cambiar imagen' : 'Seleccionar imagen'}
                </Button>
              </div>
            </div>
          </div>
        )
      }}
    />
  )
}

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
    {
      name: 'image',
      label: 'Imagen',
      render: ProductTypeImageField,
      accept: 'image/jpeg,image/png,image/webp',
      fullWidth: true,
      getPreviewValue: (record) => record?.imageUrl,
    },
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
    image: undefined,
    clearImage: false,
  }),
  fetchRecords: ({ status, search, page, limit }) =>
    apiClient.get('/tipos-producto', { estado: toApiStatus(status), q: search, page, limit }),
  createRecord: (payload) => apiClient.post('/tipos-producto', buildProductTypeFormData(payload)),
  updateRecord: (id, payload) => apiClient.patch(`/tipos-producto/${id}`, buildProductTypeFormData(payload)),
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
