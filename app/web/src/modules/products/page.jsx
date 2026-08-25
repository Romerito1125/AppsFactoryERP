import { useEffect, useMemo, useState } from 'react'
import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { ImageUp, Plus, ScanLine, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { BarcodeReaderDialog } from '@/components/barcode-reader-dialog'
import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog'
import { ProductImage } from '@/components/product-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatNumber, getRecordStatus, getRecordStatusVariant, toApiStatus, toNumber } from '@/lib/format'
import { readBarcodeFromImage } from '@/lib/barcode-reader'
import { barcodeTypeOptions } from '@/lib/barcodes'
import { cn } from '@/lib/utils'
import { InvoiceOcrImportAction } from '@/modules/products/invoice-ocr-import-dialog'
import { ProductBarcodesField } from '@/modules/products/barcodes-field'
import { buildCreateProductFormData, buildProductFormData } from '@/modules/products/product-form-data'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const barcodeTypeValues = barcodeTypeOptions.map((option) => option.value)
const barcodeTypeLabels = Object.fromEntries(barcodeTypeOptions.map((option) => [option.value, option.label]))
const packagingProfileSchema = z.object({
  unitsPerPackage: z.number().int().positive('Debe ser mayor a cero').optional(),
  packagesPerBox: z.number().int().positive('Debe ser mayor a cero').optional(),
  saleByUnitOnly: z.boolean().optional(),
  notes: z.string().optional(),
})

const optionalImageSchema = z
  .custom(
    (value) => value === undefined || value === null || (typeof File !== 'undefined' && value instanceof File),
    'Selecciona una imagen valida',
  )
  .optional()
  .refine((file) => !file || file.size <= 5 * 1024 * 1024, 'La imagen no puede superar 5 MB')
  .refine((file) => !file || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type), 'Usa una imagen JPG, PNG o WEBP')

const createProductSchema = z
  .object({
    productTypeId: z.number({ message: 'Selecciona un tipo' }).int().positive('Selecciona un tipo'),
    providerId: z.number({ message: 'Selecciona un proveedor principal' }).int().positive('Selecciona un proveedor principal'),
    providerIds: z.array(z.number().int().positive()).optional(),
    name: z.string().min(2, 'Minimo 2 caracteres'),
    description: z.string().optional(),
    brand: z.string().min(1, 'La marca es obligatoria'),
    taxRate: z.number({ message: 'Impuesto obligatorio' }).min(0, 'No puede ser negativo'),
    minimumStock: z.number({ message: 'Stock minimo obligatorio' }).int().min(0, 'No puede ser negativo'),
    maximumStock: z.number().int().min(0, 'No puede ser negativo').optional(),
    image: optionalImageSchema,
    prices: z.array(
      z.object({
        name: z.string().min(2, 'Minimo 2 caracteres'),
        price: z.number({ message: 'Precio obligatorio' }).positive('Debe ser mayor a cero'),
        isDefault: z.boolean(),
      }),
    ).min(1, 'Agrega al menos un precio'),
    initialWarehouseId: z.number({ message: 'Selecciona una bodega' }).int().positive('Selecciona una bodega'),
    initialQuantity: z.number({ message: 'Cantidad obligatoria' }).int().positive('Debe ser mayor a cero'),
    packaging: packagingProfileSchema.optional(),
    barcodes: z
      .array(
        z.object({
          code: z.string().trim().min(1, 'Ingresa el codigo'),
          type: z.enum(barcodeTypeValues),
          isPrimary: z.boolean().optional(),
        }),
      )
      .optional(),
  })
  .refine((values) => values.maximumStock === undefined || values.maximumStock >= values.minimumStock, {
    path: ['maximumStock'],
    message: 'El stock maximo no puede ser menor al minimo',
  })
  .refine((values) => (values.prices?.filter((price) => price.isDefault).length ?? 0) <= 1, {
    path: ['prices'],
    message: 'Solo puede existir un precio principal por producto',
  })
  .refine((values) => (values.barcodes?.filter((barcode) => barcode.isPrimary).length ?? 0) <= 1, {
    path: ['barcodes'],
    message: 'Solo puede existir un codigo principal por producto',
  })

const updateProductSchema = z
  .object({
    productTypeId: z.number({ message: 'Selecciona un tipo' }).int().positive('Selecciona un tipo'),
    providerId: z.number({ message: 'Selecciona un proveedor principal' }).int().positive('Selecciona un proveedor principal'),
    providerIds: z.array(z.number().int().positive()).optional(),
    name: z.string().min(2, 'Minimo 2 caracteres'),
    description: z.string().optional(),
    brand: z.string().min(1, 'La marca es obligatoria'),
    taxRate: z.number({ message: 'Impuesto obligatorio' }).min(0, 'No puede ser negativo'),
    minimumStock: z.number({ message: 'Stock minimo obligatorio' }).int().min(0, 'No puede ser negativo'),
    maximumStock: z.number().int().min(0, 'No puede ser negativo').optional(),
    image: optionalImageSchema,
    packaging: packagingProfileSchema.optional(),
  })
  .refine((values) => values.maximumStock === undefined || values.maximumStock >= values.minimumStock, {
    path: ['maximumStock'],
    message: 'El stock maximo no puede ser menor al minimo',
  })

function getDefaultPrice(product) {
  return product.prices?.find((price) => price.isDefault) ?? product.prices?.[0] ?? null
}

function getPrimaryBarcode(product) {
  return product.barcodes?.find((barcode) => barcode.isPrimary) ?? product.barcodes?.[0] ?? null
}

function getAssociatedProviders(product) {
  return Array.isArray(product?.providers) && product.providers.length
    ? product.providers
    : product?.provider
      ? [{ ...product.provider, isPrimary: true }]
      : []
}

function getSelectableProviders(lookups) {
  return (lookups.providers ?? []).filter((provider) => provider.isActive !== false)
}

function getSelectableProductTypes(lookups) {
  return (lookups.productTypes ?? []).filter((productType) => productType.isActive !== false)
}

function getSecondaryProviderIds(product) {
  return getAssociatedProviders(product)
    .filter((provider) => !provider.isPrimary)
    .map((provider) => provider.id)
}

function normalizeProductPrices(prices) {
  const resolved = (prices ?? []).map((price) => ({
    name: price?.name ?? '',
    price: price?.price,
    isDefault: Boolean(price?.isDefault),
  }))

  if (!resolved.length) {
    return [{ name: '', price: undefined, isDefault: true }]
  }

  if (!resolved.some((price) => price.isDefault)) {
    resolved[0].isDefault = true
  }

  return resolved.map((price, index) => ({
    ...price,
    isDefault: resolved.findIndex((item) => item.isDefault) === index,
  }))
}

function matchesProviderAssociation(product, providerId) {
  return getAssociatedProviders(product).some((provider) => provider.id === providerId)
}

function formatProviderSummary(product) {
  const providers = getAssociatedProviders(product)

  if (!providers.length) {
    return 'Sin proveedor'
  }

  const primaryProvider = providers.find((provider) => provider.isPrimary) ?? providers[0]
  const additionalCount = Math.max(0, providers.length - 1)

  return additionalCount ? `${primaryProvider.name} · +${additionalCount} secundario(s)` : primaryProvider.name
}

function formatProviderList(product) {
  const providers = getAssociatedProviders(product)

  if (!providers.length) {
    return 'Sin proveedores secundarios'
  }

  return providers.map((provider) => `${provider.name}${provider.isPrimary ? ' (principal)' : ''}`).join(' · ')
}

function formatBarcodeType(type) {
  return barcodeTypeLabels[type] ?? type ?? 'Sin tipo'
}

function formatBarcodeSummary(product) {
  if (!product.barcodes?.length) {
    return 'Sin codigos registrados'
  }

  return product.barcodes.map((barcode) => `${barcode.code}${barcode.isPrimary ? ' (principal)' : ''}`).join(' · ')
}

function getTotalStock(product) {
  return (product.warehouses ?? []).reduce((total, item) => total + Number(item.quantity ?? 0), 0)
}

function formatWarehouseStock(product) {
  if (!product.warehouses?.length) {
    return 'Sin stock asignado'
  }

  return product.warehouses
    .map((item) => `${item.warehouse?.location ?? `Bodega #${item.warehouseId}`}: ${formatNumber(item.quantity)}`)
    .join(' · ')
}

function getStockSignal(product) {
  const totalStock = getTotalStock(product)
  const minimumStock = Number(product.minimumStock ?? 0)
  const maximumStock = product.maximumStock === null || product.maximumStock === undefined ? null : Number(product.maximumStock)
  const warningThreshold = maximumStock !== null ? Math.max(minimumStock + 1, maximumStock * 0.45) : Math.max(6, minimumStock * 2)

  if (totalStock <= minimumStock) {
    return {
      label: 'Falta stock',
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
    }
  }

  if (totalStock <= warningThreshold) {
    return {
      label: 'Stock regular',
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }

  return {
    label: 'Buen stock',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  }
}

const productStockFilterOptions = [
  { value: 'TODOS', label: 'Todo el stock' },
  { value: 'CON_STOCK', label: 'Con stock' },
  { value: 'SIN_STOCK', label: 'Sin stock' },
  { value: 'BAJO_MINIMO', label: 'Bajo minimo' },
  { value: 'EN_RANGO', label: 'En rango' },
  { value: 'SOBRE_MAXIMO', label: 'Sobre maximo' },
]

function filterFavoriteProducts(records, status, filters) {
  const brand = filters.brand?.trim().toLowerCase()
  const barcode = filters.barcode?.trim().toLowerCase()

  return records.filter((record) => {
    if (status === 'inactivos') {
      return false
    }
    if (filters.productTypeId !== 'TODOS' && record.productTypeId !== Number(filters.productTypeId)) {
      return false
    }
    if (filters.providerId !== 'TODOS' && !matchesProviderAssociation(record, Number(filters.providerId))) {
      return false
    }
    if (filters.warehouseId !== 'TODOS' && !record.warehouses?.some((item) => item.warehouseId === Number(filters.warehouseId))) {
      return false
    }
    if (brand && !record.brand?.toLowerCase().includes(brand)) {
      return false
    }
    if (barcode && !record.barcodes?.some((item) => item.isActive !== false && item.code.toLowerCase().includes(barcode))) {
      return false
    }

    const totalStock = getTotalStock(record)
    const minimumStock = Number(record.minimumStock ?? 0)
    const maximumStock = record.maximumStock == null ? null : Number(record.maximumStock)

    if (filters.stockStatus === 'CON_STOCK') return totalStock > 0
    if (filters.stockStatus === 'SIN_STOCK') return totalStock <= 0
    if (filters.stockStatus === 'BAJO_MINIMO') return totalStock <= minimumStock
    if (filters.stockStatus === 'EN_RANGO') {
      return totalStock > minimumStock && (maximumStock === null || totalStock < maximumStock)
    }
    if (filters.stockStatus === 'SOBRE_MAXIMO') {
      return maximumStock !== null && totalStock >= maximumStock
    }

    return true
  })
}

function SearchableSelectField({ field: configField, control }) {
  const [query, setQuery] = useState('')
  const options = configField.options ?? []

  return (
    <Controller
      name={configField.name}
      control={control}
      render={({ field }) => {
        const selectedOption = options.find((option) => option.value === field.value)
        const normalizedQuery = query.trim().toLowerCase()
        const filteredOptions = normalizedQuery
          ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
          : options

        return (
          <div className="grid gap-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar ${configField.label.toLowerCase()}...`}
            />

            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-sm">
              <p className="font-medium text-foreground">{selectedOption?.label ?? configField.placeholder ?? 'Sin seleccionar'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedOption ? 'Seleccion actual del formulario.' : 'Escribe para filtrar y luego haz clic para seleccionar.'}
              </p>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-border/70 p-2">
              <div className="grid gap-2">
                {filteredOptions.length ? (
                  filteredOptions.map((option) => {
                    const isSelected = option.value === field.value

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => field.onChange(option.value)}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-left text-sm transition',
                          isSelected
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border/70 bg-background hover:border-primary/40 hover:bg-primary/5',
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })
                ) : (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No hay resultados para esta busqueda.</p>
                )}
              </div>
            </div>
          </div>
        )
      }}
    />
  )
}

function ProductProvidersField({ field: configField, control, setValue }) {
  const primaryProviderId = useWatch({ control, name: 'providerId' })
  const selectedProviderIds = useWatch({ control, name: configField.name })
  const options = configField.options ?? []
  const [candidateProviderId, setCandidateProviderId] = useState('')

  useEffect(() => {
    const currentValue = Array.isArray(selectedProviderIds) ? selectedProviderIds : []

    if (!primaryProviderId) {
      if (currentValue.length) {
        setValue(configField.name, [], { shouldDirty: true, shouldValidate: true })
      }
      return
    }

    const normalizedValue = currentValue.filter((providerId) => providerId !== Number(primaryProviderId))

    if (normalizedValue.length !== currentValue.length) {
      setValue(configField.name, normalizedValue, { shouldDirty: true, shouldValidate: true })
    }
  }, [configField.name, primaryProviderId, selectedProviderIds, setValue])

  useEffect(() => {
    const currentValue = Array.isArray(selectedProviderIds) ? selectedProviderIds : []
    const availableProviders = primaryProviderId
      ? options.filter((provider) => provider.value !== Number(primaryProviderId) && !currentValue.includes(provider.value))
      : []

    if (!availableProviders.some((provider) => String(provider.value) === candidateProviderId)) {
      setCandidateProviderId(availableProviders[0] ? String(availableProviders[0].value) : '')
    }
  }, [candidateProviderId, options, primaryProviderId, selectedProviderIds])

  return (
    <Controller
      name={configField.name}
      control={control}
      render={({ field }) => {
        const value = Array.isArray(field.value) ? field.value : []
        const availableProviders = primaryProviderId
          ? options.filter((provider) => provider.value !== Number(primaryProviderId) && !value.includes(provider.value))
          : []
        const selectedProviders = options.filter((provider) => value.includes(provider.value))

        return (
          <div className="grid gap-3">
            <div className="rounded-xl border border-border/70 bg-muted/15 p-3 text-xs text-muted-foreground">
              {primaryProviderId
                ? 'Agrega aqui los proveedores secundarios desde el mismo listado del proveedor principal.'
                : 'Primero selecciona el proveedor principal para habilitar los proveedores secundarios.'}
            </div>

            <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/80 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="grid gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Agregar secundario</p>
                  <Select value={candidateProviderId || undefined} onValueChange={setCandidateProviderId} disabled={!primaryProviderId || !availableProviders.length}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={primaryProviderId ? 'Selecciona otro proveedor' : 'Selecciona primero el principal'} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProviders.map((provider) => (
                        <SelectItem key={provider.value} value={String(provider.value)}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  className="md:min-w-32"
                  disabled={!primaryProviderId || !candidateProviderId}
                  onClick={() => {
                    const nextProviderId = Number(candidateProviderId)
                    if (!nextProviderId || value.includes(nextProviderId)) {
                      return
                    }
                    field.onChange([...value, nextProviderId])
                  }}
                >
                  <Plus className="mr-2 size-4" />
                  Agregar
                </Button>
              </div>

              <div className="grid gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Seleccionados</p>
                {selectedProviders.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedProviders.map((provider) => (
                      <div key={provider.value} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/10 px-3 py-2">
                        <p className="min-w-0 text-sm font-medium text-foreground">{provider.label}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => field.onChange(value.filter((item) => item !== provider.value))}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                    {primaryProviderId ? 'Todavia no agregaste proveedores secundarios.' : 'Selecciona primero el proveedor principal.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }}
    />
  )
}

function CreateInventoryLayoutField({ field: configField, control, register, errors }) {
  const warehouseOptions = configField.options ?? []
  const { fields, append, replace } = useFieldArray({
    control,
    name: 'prices',
  })
  const prices = useWatch({ control, name: 'prices' }) ?? []

  function handleAddPrice() {
    append({
      name: '',
      price: undefined,
      isDefault: fields.length === 0,
    })
  }

  function handleSetDefaultPrice(targetIndex) {
    replace(
      normalizeProductPrices(
        prices.map((price, index) => ({
          ...price,
          isDefault: index === targetIndex,
        })),
      ),
    )
  }

  function handleRemovePrice(targetIndex) {
    const nextPrices = normalizeProductPrices(prices.filter((_, index) => index !== targetIndex))
    replace(nextPrices)
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.35fr)]">
        <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/10 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Control de stock</p>
            <p className="mt-1 text-xs text-muted-foreground">Define los rangos operativos y la cantidad con la que arranca el producto.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label htmlFor="minimumStock" className="text-sm font-medium text-foreground">Stock minimo</label>
              <Input id="minimumStock" type="number" placeholder="10" {...register('minimumStock', { setValueAs: toNumber })} />
              {errors.minimumStock?.message ? <p className="text-xs text-destructive">{String(errors.minimumStock.message)}</p> : null}
            </div>

            <div className="grid gap-2">
              <label htmlFor="maximumStock" className="text-sm font-medium text-foreground">Stock maximo</label>
              <Input id="maximumStock" type="number" placeholder="100" {...register('maximumStock', { setValueAs: toNumber })} />
              {errors.maximumStock?.message ? <p className="text-xs text-destructive">{String(errors.maximumStock.message)}</p> : null}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <label htmlFor="initialQuantity" className="text-sm font-medium text-foreground">Stock inicial</label>
              <Input id="initialQuantity" type="number" placeholder="50" {...register('initialQuantity', { setValueAs: toNumber })} />
              {errors.initialQuantity?.message ? <p className="text-xs text-destructive">{String(errors.initialQuantity.message)}</p> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-border/70 bg-background p-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Precios iniciales</p>
                <p className="mt-1 text-xs text-muted-foreground">Crea uno o varios precios desde el arranque y marca uno como principal.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleAddPrice}>
                <Plus className="mr-2 size-4" />
                Agregar precio
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="taxRate" className="text-sm font-medium text-foreground">Impuesto %</label>
              <Input id="taxRate" type="number" placeholder="19" {...register('taxRate', { setValueAs: toNumber })} />
              {errors.taxRate?.message ? <p className="text-xs text-destructive">{String(errors.taxRate.message)}</p> : null}
            </div>

            {fields.length ? (
              <div className="grid gap-3">
                {fields.map((item, index) => (
                  <div key={item.id} className="grid gap-3 rounded-xl border border-border/70 bg-muted/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">Precio #{index + 1}</p>
                        <p className="text-xs text-muted-foreground">
                          {prices[index]?.isDefault ? 'Principal para ventas y facturacion.' : 'Precio adicional del producto.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={prices[index]?.isDefault ? 'default' : 'outline'}
                          onClick={() => handleSetDefaultPrice(index)}
                        >
                          <Star className="mr-2 size-4" />
                          {prices[index]?.isDefault ? 'Principal' : 'Marcar principal'}
                        </Button>
                        <Button type="button" size="icon-sm" variant="destructive" onClick={() => handleRemovePrice(index)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_200px]">
                      <div className="grid gap-2">
                        <label htmlFor={`prices.${index}.name`} className="text-sm font-medium text-foreground">Nombre del precio</label>
                        <Input id={`prices.${index}.name`} placeholder="Precio base" {...register(`prices.${index}.name`, { setValueAs: (value) => (typeof value === 'string' ? value.trim() : value) })} />
                        {errors?.prices?.[index]?.name?.message ? <p className="text-xs text-destructive">{String(errors.prices[index].name.message)}</p> : null}
                      </div>

                      <div className="grid gap-2">
                        <label htmlFor={`prices.${index}.price`} className="text-sm font-medium text-foreground">Valor</label>
                        <Input id={`prices.${index}.price`} type="number" placeholder="25000" {...register(`prices.${index}.price`, { setValueAs: toNumber })} />
                        {errors?.prices?.[index]?.price?.message ? <p className="text-xs text-destructive">{String(errors.prices[index].price.message)}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {errors?.prices?.message ? <p className="text-xs text-destructive">{String(errors.prices.message)}</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border/70 bg-background p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Bodega inicial</p>
          <p className="mt-1 text-xs text-muted-foreground">Selecciona dónde se registrará el stock de arranque del producto.</p>
        </div>

        <Controller
          name="initialWarehouseId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value === undefined || field.value === null ? undefined : String(field.value)}
              onValueChange={(value) => field.onChange(Number(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una bodega" />
              </SelectTrigger>
              <SelectContent>
                {warehouseOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.initialWarehouseId?.message ? <p className="text-xs text-destructive">{String(errors.initialWarehouseId.message)}</p> : null}
      </div>
    </div>
  )
}

function PackagingProfileField({ control, register, errors }) {
  const hasPackaging = useWatch({ control, name: 'packaging' })

  return (
    <div className="grid gap-4 rounded-2xl border border-border/70 bg-background p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Perfil de empaque</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Permite cuadrar cajas, paquetes y unidades en movimientos y reportes del inventario.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="packaging.unitsPerPackage" className="text-sm font-medium text-foreground">Unidades por paquete</label>
          <Input id="packaging.unitsPerPackage" type="number" placeholder="12" {...register('packaging.unitsPerPackage', { setValueAs: toNumber })} />
          {errors?.packaging?.unitsPerPackage?.message ? <p className="text-xs text-destructive">{String(errors.packaging.unitsPerPackage.message)}</p> : null}
        </div>

        <div className="grid gap-2">
          <label htmlFor="packaging.packagesPerBox" className="text-sm font-medium text-foreground">Paquetes por caja</label>
          <Input id="packaging.packagesPerBox" type="number" placeholder="6" {...register('packaging.packagesPerBox', { setValueAs: toNumber })} />
          {errors?.packaging?.packagesPerBox?.message ? <p className="text-xs text-destructive">{String(errors.packaging.packagesPerBox.message)}</p> : null}
        </div>

        <div className="grid gap-2 md:col-span-2">
          <label htmlFor="packaging.notes" className="text-sm font-medium text-foreground">Notas de empaque</label>
          <Input id="packaging.notes" placeholder="Ej. 1 caja = 6 paquetes de 12 unidades" {...register('packaging.notes')} />
        </div>

        <div className="grid gap-2 md:col-span-2">
          <label htmlFor="packaging.saleByUnitOnly" className="text-sm font-medium text-foreground">Venta solo por unidad</label>
          <Controller
            name="packaging.saleByUnitOnly"
            control={control}
            render={({ field }) => (
              <Select value={String(Boolean(field.value))} onValueChange={(value) => field.onChange(value === 'true')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Si</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {!hasPackaging?.unitsPerPackage && !hasPackaging?.packagesPerBox && !hasPackaging?.notes ? (
        <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
          Si no completas este bloque, el producto quedara sin conversion de empaques.
        </div>
      ) : null}
    </div>
  )
}

function createProductsConfig(lookups, barcodeSearch, favorites) {
  const selectableProductTypes = getSelectableProductTypes(lookups)
  const selectableProviders = getSelectableProviders(lookups)

  return {
    key: 'productos',
    dialogContentClassName: 'sm:max-w-5xl',
    title: 'Productos',
    description:
      'Gestiona el catalogo real con tipo, proveedor principal, proveedores secundarios, codigos de barras, precios iniciales e inventario asociado a bodegas.',
    singularLabel: 'Producto',
    badgeLabel: 'Catalogo · Inventario',
    createButtonLabel: 'Nuevo producto',
    createTitle: 'Crear producto',
    editTitle: 'Actualizar producto',
    createDescription: 'Registra un producto con su precio inicial, sus codigos de barras opcionales y stock inicial por bodega.',
    editDescription: 'Ajusta datos comerciales base del producto seleccionado.',
    submitCreateLabel: 'Crear producto',
    submitEditLabel: 'Guardar cambios',
    tableTitle: 'Catalogo operativo',
    tableDescription: 'Vista consolidada de tipo, proveedores, precio vigente y stock disponible.',
    searchPlaceholder: 'Buscar por nombre, marca, codigo, tipo, proveedor o bodega...',
    emptyTitle: 'No hay productos disponibles',
    emptyDescription: 'Crea el primer producto para empezar a operar inventario.',
    archiveLoadingLabel: 'Desactivando producto...',
    archiveSuccessLabel: 'Producto desactivado',
    archiveConfirmationLabel: 'El producto no se eliminara fisicamente y conservara su historial de facturacion.',
    reactivateLoadingLabel: 'Reactivando producto...',
    reactivateSuccessLabel: 'Producto reactivado',
    reactivateConfirmationLabel: 'El producto volvera a quedar disponible para facturar y operar.',
    statusFilter: 'api',
    formSteps: [
      { id: 'basico', title: 'Basico', description: 'Define el tipo, nombre y marca del producto.' },
      { id: 'proveedores', title: 'Proveedor', description: 'Selecciona el proveedor principal y luego marca otros proveedores del mismo listado.' },
      { id: 'catalogo', title: 'Catalogo', description: 'Completa la descripcion, imagen y codigos del producto.' },
      { id: 'inventario', title: 'Inventario', description: 'Configura impuesto, precio inicial, bodega y stock.' },
    ],
    getInitialFilters: () => ({
      productTypeId: 'TODOS',
      providerId: 'TODOS',
      warehouseId: 'TODOS',
      stockStatus: 'TODOS',
      favoriteFilter: 'TODOS',
      brand: '',
      barcode: '',
    }),
    renderTableFilters: ({ filters, updateFilters }) => (
      <>
        <Select value={filters.productTypeId} onValueChange={(value) => updateFilters((current) => ({ ...current, productTypeId: value }))}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los tipos</SelectItem>
            {selectableProductTypes.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.providerId} onValueChange={(value) => updateFilters((current) => ({ ...current, providerId: value }))}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los proveedores</SelectItem>
            {lookups.providers.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.warehouseId} onValueChange={(value) => updateFilters((current) => ({ ...current, warehouseId: value }))}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Bodega" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas las bodegas</SelectItem>
            {lookups.warehouses.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.stockStatus} onValueChange={(value) => updateFilters((current) => ({ ...current, stockStatus: value }))}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            {productStockFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.favoriteFilter}
          onValueChange={(value) => updateFilters((current) => ({ ...current, favoriteFilter: value }))}
        >
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Favoritos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los productos</SelectItem>
            <SelectItem value="FAVORITOS">Solo favoritos</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={filters.brand}
          onChange={(event) =>
            updateFilters((current) => ({
              ...current,
              brand: event.target.value,
            }))
          }
          placeholder="Filtrar marca..."
          className="w-full md:w-[180px]"
        />

        <Input
          value={filters.barcode}
          onChange={(event) =>
            updateFilters((current) => ({
              ...current,
              barcode: event.target.value,
            }))
          }
          placeholder="Filtrar codigo..."
          className="w-full md:w-[180px]"
        />

        <input id="product-barcode-image-input" type="file" accept="image/*" className="hidden" onChange={barcodeSearch.onReadImage} />

        <Button type="button" variant="outline" onClick={() => barcodeSearch.onOpenScanner(updateFilters)}>
          <ScanLine className="mr-2 size-4" />
          Escanear codigo
        </Button>

        <Button type="button" variant="outline" onClick={() => barcodeSearch.onOpenReader(updateFilters)}>
          <ScanLine className="mr-2 size-4" />
          Escanear con lector
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => barcodeSearch.onOpenImagePicker(updateFilters)}
          disabled={barcodeSearch.scanLoading}
        >
          <ImageUp className="mr-2 size-4" />
          {barcodeSearch.scanLoading ? 'Leyendo...' : 'Leer imagen'}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            updateFilters({
              productTypeId: 'TODOS',
              providerId: 'TODOS',
              warehouseId: 'TODOS',
              stockStatus: 'TODOS',
              favoriteFilter: 'TODOS',
              brand: '',
              barcode: '',
            })
          }
        >
          Limpiar filtros
        </Button>
      </>
    ),
    fields: [
      {
        name: 'productTypeId',
        label: 'Tipo de producto',
        render: SearchableSelectField,
        placeholder: 'Selecciona un tipo',
        stepId: 'basico',
        options: selectableProductTypes.map((item) => ({
          value: item.id,
          label: item.name,
        })),
      },
      {
        name: 'providerId',
        label: 'Proveedor principal',
        render: SearchableSelectField,
        placeholder: 'Selecciona un proveedor principal',
        stepId: 'proveedores',
        options: selectableProviders.map((item) => ({
          value: item.id,
          label: item.name,
        })),
      },
      {
        name: 'providerIds',
        label: 'Otros proveedores',
        render: ProductProvidersField,
        fullWidth: true,
        stepId: 'proveedores',
        options: selectableProviders.map((item) => ({
          value: item.id,
          label: item.name,
        })),
      },
      { name: 'name', label: 'Nombre', placeholder: 'Cafe premium', stepId: 'basico' },
      { name: 'brand', label: 'Marca', placeholder: 'Marca propia', stepId: 'basico' },
      {
        name: 'image',
        label: 'Imagen del producto',
        type: 'file',
        accept: 'image/jpeg,image/png,image/webp',
        helpText: 'JPG, PNG o WEBP. Maximo 5 MB.',
        fullWidth: true,
        getPreviewValue: (record) => record?.imageUrl,
        stepId: 'catalogo',
      },
      {
        name: 'description',
        label: 'Descripcion',
        type: 'textarea',
        placeholder: 'Descripcion corta del producto',
        rows: 3,
        fullWidth: true,
        stepId: 'catalogo',
      },
      {
        name: 'barcodes',
        label: 'Codigos de barras',
        render: ProductBarcodesField,
        fullWidth: true,
        hiddenOnEdit: true,
        stepId: 'catalogo',
      },
      {
        name: 'packaging',
        label: 'Perfil de empaque',
        render: PackagingProfileField,
        fullWidth: true,
        hideLabel: true,
        stepId: 'catalogo',
      },
      {
        name: 'inventorySetup',
        label: 'Inventario inicial',
        render: CreateInventoryLayoutField,
        fullWidth: true,
        hideLabel: true,
        hiddenOnEdit: true,
        stepId: 'inventario',
        options: lookups.warehouses.map((item) => ({
          value: item.id,
          label: item.location,
        })),
      },
      {
        name: 'taxRate',
        label: 'Impuesto %',
        type: 'number',
        placeholder: '19',
        hiddenOnCreate: true,
        stepId: 'inventario',
      },
      {
        name: 'minimumStock',
        label: 'Stock minimo',
        type: 'number',
        placeholder: '10',
        hiddenOnCreate: true,
        stepId: 'inventario',
      },
      {
        name: 'maximumStock',
        label: 'Stock maximo',
        type: 'number',
        placeholder: '100',
        hiddenOnCreate: true,
        stepId: 'inventario',
      },
      {
        name: 'initialPriceName',
        label: 'Nombre del precio inicial',
        placeholder: 'Precio base',
        hiddenOnCreate: true,
        hiddenOnEdit: true,
        stepId: 'inventario',
      },
      {
        name: 'initialPrice',
        label: 'Precio inicial',
        type: 'number',
        placeholder: '25000',
        hiddenOnCreate: true,
        hiddenOnEdit: true,
        stepId: 'inventario',
      },
      {
        name: 'initialWarehouseId',
        label: 'Bodega inicial',
        render: SearchableSelectField,
        placeholder: 'Selecciona una bodega',
        options: lookups.warehouses.map((item) => ({
          value: item.id,
          label: item.location,
        })),
        hiddenOnCreate: true,
        hiddenOnEdit: true,
        stepId: 'inventario',
      },
      {
        name: 'initialQuantity',
        label: 'Stock inicial',
        type: 'number',
        placeholder: '50',
        hiddenOnCreate: true,
        hiddenOnEdit: true,
        stepId: 'inventario',
      },
    ],
    createSchema: createProductSchema,
    updateSchema: updateProductSchema,
      getDefaultValues: (_, record) => ({
        productTypeId: record?.productTypeId ?? undefined,
        providerId: record?.providerId ?? undefined,
        providerIds: getSecondaryProviderIds(record),
        name: record?.name ?? '',
      description: record?.description ?? '',
      brand: record?.brand ?? '',
        image: undefined,
        taxRate: Number(record?.taxRate ?? 0),
        minimumStock: Number(record?.minimumStock ?? 0),
        maximumStock: record && record.maximumStock !== null && record.maximumStock !== undefined ? Number(record.maximumStock) : undefined,
        packaging: record?.packagingProfile
          ? {
              unitsPerPackage: record.packagingProfile.unitsPerPackage ? Number(record.packagingProfile.unitsPerPackage) : undefined,
              packagesPerBox: record.packagingProfile.packagesPerBox ? Number(record.packagingProfile.packagesPerBox) : undefined,
              saleByUnitOnly: Boolean(record.packagingProfile.saleByUnitOnly),
              notes: record.packagingProfile.notes ?? '',
            }
          : undefined,
        prices: [{ name: 'Precio base', price: undefined, isDefault: true }],
        initialWarehouseId: undefined,
        initialQuantity: undefined,
        barcodes: [],
      }),
    prepareValues: (mode, values) => {
      const normalizedValues = { ...values }

      if (normalizedValues.packaging && !normalizedValues.packaging.unitsPerPackage && !normalizedValues.packaging.packagesPerBox && !normalizedValues.packaging.notes && !normalizedValues.packaging.saleByUnitOnly) {
        normalizedValues.packaging = undefined
      }

      if (mode === 'edit') {
        const payload = { ...normalizedValues }
        delete payload.prices
        delete payload.initialPriceName
        delete payload.initialPrice
        delete payload.initialWarehouseId
        delete payload.initialQuantity
        delete payload.barcodes
        return buildProductFormData(payload)
      }

      return buildCreateProductFormData(normalizedValues)
    },
    renderHeaderActions: ({ invalidateRecords }) => <InvoiceOcrImportAction lookups={lookups} onImported={invalidateRecords} />,
    fetchRecords: ({ status, search, page, limit, filters }) => {
      if (filters.favoriteFilter === 'FAVORITOS') {
        return apiClient.get('/productos/favoritos/mios').then((records) => filterFavoriteProducts(records, status, filters))
      }

      return apiClient.get('/productos', {
        estado: toApiStatus(status),
        q: search,
        page,
        limit,
        productTypeId: filters.productTypeId === 'TODOS' ? undefined : Number(filters.productTypeId),
        providerId: filters.providerId === 'TODOS' ? undefined : Number(filters.providerId),
        warehouseId: filters.warehouseId === 'TODOS' ? undefined : Number(filters.warehouseId),
        stockStatus: filters.stockStatus === 'TODOS' ? undefined : filters.stockStatus,
        brand: filters.brand?.trim() || undefined,
        barcode: filters.barcode?.trim() || undefined,
      })
    },
    createRecord: (payload) => apiClient.post('/productos', payload),
    updateRecord: (id, payload) => apiClient.patch(`/productos/${id}`, payload),
    archiveRecord: (id) => apiClient.delete(`/productos/${id}`),
    reactivateRecord: (id) => apiClient.patch(`/productos/${id}/reactivar`),
    searchResolver: (record) => [
      record.name,
      record.brand,
      record.description,
      record.productType?.name,
      ...getAssociatedProviders(record).map((provider) => provider.name),
      ...(record.barcodes ?? []).map((barcode) => barcode.code),
      ...(record.warehouses ?? []).map((item) => item.warehouse?.location),
    ],
    getSummaryCards: ({ rawRecords }) => {
      const inventoryValue = rawRecords.reduce((total, record) => {
        const defaultPrice = getDefaultPrice(record)
        return total + Number(defaultPrice?.price ?? 0) * getTotalStock(record)
      }, 0)
      const stockUnits = rawRecords.reduce((total, record) => total + getTotalStock(record), 0)

      return [
        {
          label: 'Productos visibles',
          value: formatNumber(rawRecords.length),
          help: 'Productos visibles segun el filtro de estado aplicado.',
        },
        {
          label: 'Stock total',
          value: formatNumber(stockUnits),
          help: 'Unidades disponibles sumando todas las bodegas registradas.',
        },
        {
          label: 'Valor inventario',
          value: formatCurrency(inventoryValue),
          help: 'Aproximacion usando precio default por stock total.',
        },
        {
          label: 'Mis favoritos',
          value: formatNumber(favorites.count),
          help: 'Productos guardados en tu cuenta para acceso rapido.',
        },
      ]
    },
    columns: [
      {
        key: 'favorite',
        label: 'Favorito',
        className: 'w-20',
        render: (record) => {
          const isFavorite = favorites.isFavorite(record.id)
          const isPending = favorites.pendingId === record.id

          return (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              disabled={isPending}
              aria-label={isFavorite ? `Quitar ${record.name} de favoritos` : `Agregar ${record.name} a favoritos`}
              aria-pressed={isFavorite}
              onClick={() => favorites.onToggle(record, isFavorite)}
            >
              <Star className={cn('size-4', isFavorite && 'fill-current text-amber-500')} />
            </Button>
          )
        },
      },
      {
        key: 'product',
        label: 'Producto',
        render: (record) => (
          <div className="flex items-center gap-3">
            <ProductImage src={record.imageUrl} alt={record.name} className="size-12 rounded-lg" iconClassName="size-4" />
            <div>
              <p className="font-medium text-foreground">{record.name}</p>
              <p className="text-xs text-muted-foreground">
                {record.brand} · {record.productType?.name ?? 'Sin tipo'}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: 'provider',
        label: 'Proveedor',
        render: (record) => (
          <div>
            <p className="font-medium text-foreground">{formatProviderSummary(record)}</p>
            <p className="text-xs text-muted-foreground">{getAssociatedProviders(record).length} proveedor(es) vinculados</p>
          </div>
        ),
      },
      {
        key: 'price',
        label: 'Precio default',
        render: (record) => {
          const defaultPrice = getDefaultPrice(record)
          return defaultPrice ? formatCurrency(defaultPrice.price) : 'Sin precio'
        },
      },
      {
        key: 'stock',
        label: 'Stock total',
        render: (record) => (
          <div>
            <p>{formatNumber(getTotalStock(record))}</p>
            <p className="text-xs text-muted-foreground">
              Min {formatNumber(record.minimumStock)}
              {record.maximumStock !== null && record.maximumStock !== undefined ? ` · Max ${formatNumber(record.maximumStock)}` : ''}
            </p>
            <Badge variant="outline" className={`mt-2 ${getStockSignal(record).className}`}>
              {getStockSignal(record).label}
            </Badge>
          </div>
        ),
      },
      {
        key: 'barcode',
        label: 'Codigo principal',
        render: (record) => {
          const primaryBarcode = getPrimaryBarcode(record)

          if (!primaryBarcode) {
            return 'Sin codigo'
          }

          return (
            <div>
              <p className="font-medium text-foreground">{primaryBarcode.code}</p>
              <p className="text-xs text-muted-foreground">
                {formatBarcodeType(primaryBarcode.type)}
                {record.barcodes?.length > 1 ? ` · +${record.barcodes.length - 1} adicional(es)` : ''}
              </p>
            </div>
          )
        },
      },
      {
        key: 'status',
        label: 'Estado',
        render: (record) => <Badge variant={getRecordStatusVariant(record)}>{getRecordStatus(record)}</Badge>,
      },
    ],
    getDetailTitle: (record) => record.name,
    getDetailDescription: (record) => `${record.brand} · ${record.productType?.name ?? 'Sin tipo'}`,
    getDetailSections: (record) => {
      const defaultPrice = getDefaultPrice(record)

      return [
        {
          label: 'Ficha comercial',
          items: [
            {
              label: 'Imagen',
              value: <ProductImage src={record.imageUrl} alt={record.name} className="size-20 rounded-xl" iconClassName="size-5" />,
            },
            { label: 'Tipo', value: record.productType?.name ?? 'Sin tipo' },
            {
              label: 'Proveedor principal',
              value: record.provider?.name ?? 'Sin proveedor',
            },
            { label: 'Total proveedores', value: formatNumber(getAssociatedProviders(record).length) },
            { label: 'Todos los proveedores', value: formatProviderList(record) },
            { label: 'Marca', value: record.brand },
            { label: 'IVA', value: `${record.taxRate}%` },
            {
              label: 'Perfil de empaque',
              value: record.packagingProfile
                ? `Paquete: ${record.packagingProfile.unitsPerPackage ?? 'N/D'} unidad(es) · Caja: ${record.packagingProfile.packagesPerBox ?? 'N/D'} paquete(s)`
                : 'Sin perfil de empaque',
            },
          ],
        },
        {
          label: 'Inventario',
          items: [
            {
              label: 'Stock total',
              value: formatNumber(getTotalStock(record)),
            },
            { label: 'Stock minimo', value: formatNumber(record.minimumStock) },
            {
              label: 'Stock maximo',
              value: record.maximumStock === null || record.maximumStock === undefined ? 'Sin definir' : formatNumber(record.maximumStock),
            },
            {
              label: 'Semaforo',
              value: (
                <Badge variant="outline" className={getStockSignal(record).className}>
                  {getStockSignal(record).label}
                </Badge>
              ),
            },
            { label: 'Bodegas', value: formatWarehouseStock(record) },
            {
              label: 'Conversion actual',
              value: record.packagingSummary
                ? `${record.packagingSummary.boxes} caja(s) · ${record.packagingSummary.packages} paquete(s) · ${record.packagingSummary.units} unidad(es)`
                : 'Sin conversion disponible',
            },
          ],
        },
        {
          label: 'Codigos de barras',
          items: [
            {
              label: 'Principal',
              value: getPrimaryBarcode(record)?.code ?? 'Sin codigo principal',
            },
            {
              label: 'Tipo principal',
              value: formatBarcodeType(getPrimaryBarcode(record)?.type),
            },
            {
              label: 'Total registrados',
              value: record.barcodes?.length ? formatNumber(record.barcodes.length) : '0',
            },
            {
              label: 'Todos los codigos',
              value: formatBarcodeSummary(record),
            },
          ],
        },
        {
          label: 'Precios y trazabilidad',
          items: [
            {
              label: 'Precio default',
              value: defaultPrice ? `${defaultPrice.name} · ${formatCurrency(defaultPrice.price)}` : 'Sin precio',
            },
            {
              label: 'Precios registrados',
              value: record.prices?.length ? formatNumber(record.prices.length) : '0',
            },
            { label: 'Estado', value: getRecordStatus(record) },
            { label: 'Actualizado', value: formatDate(record.updatedAt) },
          ],
        },
      ]
    },
  }
}

export function ProductsPage() {
  const queryClient = useQueryClient()
  const [barcodeFilterApply, setBarcodeFilterApply] = useState(null)
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [barcodeReaderOpen, setBarcodeReaderOpen] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)

  const productTypesQuery = useQuery({
    queryKey: ['productos-tipos-lookup'],
    queryFn: () => apiClient.getAllPages('/tipos-producto'),
  })

  const providersQuery = useQuery({
    queryKey: ['productos-proveedores-lookup'],
    queryFn: () => apiClient.getAllPages('/proveedores'),
  })

  const warehousesQuery = useQuery({
    queryKey: ['productos-bodegas-lookup'],
    queryFn: () => apiClient.getAllPages('/bodegas'),
  })

  const favoritesQuery = useQuery({
    queryKey: ['productos-favoritos-mios'],
    queryFn: () => apiClient.getAllPages('/productos/favoritos/mios'),
  })

  const favoriteProductIds = useMemo(() => new Set((favoritesQuery.data ?? []).map((product) => product.id)), [favoritesQuery.data])

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }) =>
      isFavorite ? apiClient.delete(`/productos/${id}/favorito`) : apiClient.put(`/productos/${id}/favorito`),
    onMutate: async ({ record, isFavorite }) => {
      await queryClient.cancelQueries({
        queryKey: ['productos-favoritos-mios'],
      })
      const previousFavorites = queryClient.getQueryData(['productos-favoritos-mios']) ?? []

      queryClient.setQueryData(
        ['productos-favoritos-mios'],
        isFavorite
          ? previousFavorites.filter((product) => product.id !== record.id)
          : [{ ...record, isFavorite: true }, ...previousFavorites],
      )

      return { previousFavorites }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(['productos-favoritos-mios'], context?.previousFavorites ?? [])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['productos-favoritos-mios'] }),
  })

  const lookups = {
    productTypes: productTypesQuery.data ?? [],
    providers: providersQuery.data ?? [],
    warehouses: warehousesQuery.data ?? [],
  }

  function applyScannedBarcode(code) {
    const normalizedCode = String(code ?? '').trim()

    if (!normalizedCode) {
      return
    }

    barcodeFilterApply?.((current) => ({
      ...current,
      barcode: normalizedCode,
    }))
    toast.success(`Filtro por codigo aplicado: ${normalizedCode}`)
  }

  async function handleBarcodeImageSelection(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setScanLoading(true)

    try {
      const result = await readBarcodeFromImage(file)
      applyScannedBarcode(result.code)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setScanLoading(false)
    }
  }

  async function handleToggleFavorite(record, isFavorite) {
    await toast.promise(favoriteMutation.mutateAsync({ id: record.id, isFavorite, record }), {
      loading: isFavorite ? 'Quitando de favoritos...' : 'Agregando a favoritos...',
      success: isFavorite ? 'Producto eliminado de favoritos' : 'Producto agregado a favoritos',
      error: (error) => error.message,
    })
  }

  const productsConfig = createProductsConfig(
    lookups,
    {
      scanLoading,
      onReadImage: handleBarcodeImageSelection,
      onOpenScanner(updateFilters) {
        setBarcodeFilterApply(() => updateFilters)
        setBarcodeScannerOpen(true)
      },
      onOpenReader(updateFilters) {
        setBarcodeFilterApply(() => updateFilters)
        setBarcodeReaderOpen(true)
      },
      onOpenImagePicker(updateFilters) {
        setBarcodeFilterApply(() => updateFilters)
        document.getElementById('product-barcode-image-input')?.click()
      },
    },
    {
      count: favoriteProductIds.size,
      isFavorite: (productId) => favoriteProductIds.has(productId),
      pendingId: favoriteMutation.isPending ? favoriteMutation.variables?.id : null,
      onToggle: handleToggleFavorite,
    },
  )

  return (
    <>
      <CrudModulePage
        config={productsConfig}
        lookupsLoading={productTypesQuery.isLoading || providersQuery.isLoading || warehousesQuery.isLoading || favoritesQuery.isLoading}
      />

      <BarcodeScannerDialog
        open={barcodeScannerOpen}
        onOpenChange={setBarcodeScannerOpen}
        onDetected={(result) => applyScannedBarcode(result.code)}
        title="Escanear codigo para buscar producto"
        description="Lee el codigo desde camara para aplicarlo al filtro de productos."
      />

      <BarcodeReaderDialog
        open={barcodeReaderOpen}
        onOpenChange={setBarcodeReaderOpen}
        onDetected={(result) => applyScannedBarcode(result.code)}
        title="Escanear código para buscar producto"
        description="Usa el lector conectado al computador para aplicar el código al filtro de productos."
      />
    </>
  )
}
