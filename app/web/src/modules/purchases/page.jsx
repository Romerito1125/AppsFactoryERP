import { useDeferredValue, useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Box, CalendarClock, ClipboardList, MoreHorizontal, PackageCheck, Plus, Search, Trash2, Truck, WalletCards } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { LocalPagination } from '@/modules/shared/local-pagination'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'

const PAGE_SIZE = 20

const purchaseStatusLabels = {
  BORRADOR: 'Borrador',
  ORDENADA: 'Ordenada',
  RECIBIDA: 'Recibida',
  ANULADA: 'Anulada',
}

const purchaseStatusVariants = {
  BORRADOR: 'outline',
  ORDENADA: 'secondary',
  RECIBIDA: 'default',
  ANULADA: 'destructive',
}

const purchaseSchema = z.object({
  providerId: z.number({ message: 'Selecciona un proveedor' }).int().positive('Selecciona un proveedor'),
  warehouseId: z.number({ message: 'Selecciona una bodega' }).int().positive('Selecciona una bodega'),
  orderedAt: z.string().min(1, 'Selecciona la fecha de compra'),
  expectedAt: z.string().optional(),
  externalReference: z.string().max(100, 'Maximo 100 caracteres').optional(),
  notes: z.string().max(500, 'Maximo 500 caracteres').optional(),
  items: z
    .array(
      z.object({
        productId: z.number({ message: 'Selecciona un producto' }).int().positive('Selecciona un producto'),
        quantity: z.number({ message: 'Cantidad obligatoria' }).int().positive('Minimo 1 unidad'),
        unitCost: z.number({ message: 'Costo obligatorio' }).positive('El costo debe ser mayor que cero'),
        taxRate: z.number({ message: 'Impuesto obligatorio' }).min(0, 'Minimo 0%').max(100, 'Maximo 100%'),
      }),
    )
    .min(1, 'Agrega al menos una linea'),
})

function todayInputValue() {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60 * 1000
  return new Date(today.getTime() - offset).toISOString().slice(0, 10)
}

function toInputDate(value) {
  return value ? String(value).slice(0, 10) : ''
}

function getDefaultValues(purchase) {
  return {
    providerId: purchase?.providerId ?? purchase?.provider?.id ?? undefined,
    warehouseId: purchase?.warehouseId ?? purchase?.warehouse?.id ?? undefined,
    orderedAt: toInputDate(purchase?.orderedAt) || todayInputValue(),
    expectedAt: toInputDate(purchase?.expectedAt),
    externalReference: purchase?.externalReference ?? '',
    notes: purchase?.notes ?? '',
    items: purchase?.items?.length
      ? purchase.items.map((item) => ({
          productId: item.productId ?? item.product?.id,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
          taxRate: Number(item.taxRate),
        }))
      : [{ productId: undefined, quantity: 1, unitCost: 0, taxRate: 0 }],
  }
}

function getProviderName(purchase) {
  return purchase.provider?.name ?? `Proveedor #${purchase.providerId}`
}

function getWarehouseName(purchase) {
  return purchase.warehouse?.location ?? `Bodega #${purchase.warehouseId}`
}

function getProductProviders(product) {
  return Array.isArray(product?.providers) && product.providers.length
    ? product.providers
    : product?.provider
      ? [{ ...product.provider, isPrimary: true }]
      : []
}

function productSupportsProvider(product, providerId) {
  return getProductProviders(product).some((provider) => provider.id === Number(providerId))
}

function getPurchaseStatus(value) {
  return purchaseStatusLabels[value] ?? value ?? 'Sin estado'
}

function PurchaseSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[520px] rounded-2xl" />
    </div>
  )
}

function FieldError({ error }) {
  return error ? <p className="text-xs text-destructive">{String(error.message)}</p> : null
}

function SearchableOptionSelect({ items, value, onChange, placeholder, searchPlaceholder, getDescription }) {
  const [query, setQuery] = useState('')
  const filteredItems = query.trim()
    ? items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
    : items
  const selectedItem = items.find((item) => item.id === value)

  return (
    <div className="grid gap-3">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-sm">
        <p className="font-medium text-foreground">{selectedItem?.label ?? placeholder}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {selectedItem ? getDescription?.(selectedItem) ?? 'Seleccion actual del formulario.' : 'Busca y selecciona una opcion.'}
        </p>
      </div>
      <div className="max-h-52 overflow-y-auto rounded-xl border border-border/70 p-2">
        <div className="grid gap-2">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                item.id === value ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-background hover:border-primary/40 hover:bg-primary/5'
              }`}
            >
              <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
              {getDescription ? <p className="truncate text-xs text-muted-foreground">{getDescription(item)}</p> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PurchaseFormDialog({
  open,
  onOpenChange,
  mode,
  purchase,
  providers,
  warehouses,
  products,
  lookupsLoading,
  onSubmit,
  isSubmitting,
}) {
  const form = useForm({
    resolver: zodResolver(purchaseSchema),
    defaultValues: getDefaultValues(purchase),
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })
  const selectedProviderId = useWatch({
    control: form.control,
    name: 'providerId',
  })
  const watchedItems = useWatch({ control: form.control, name: 'items' })

  useEffect(() => {
    if (open) form.reset(getDefaultValues(purchase))
  }, [form, open, purchase])

  const providerProducts = selectedProviderId
    ? products.filter((product) => productSupportsProvider(product, selectedProviderId))
    : products
  const productById = new Map(products.map((product) => [product.id, product]))
  const preview = (watchedItems ?? []).reduce(
    (summary, item) => {
      const subtotal = Number(item?.quantity ?? 0) * Number(item?.unitCost ?? 0)
      const taxes = subtotal * (Number(item?.taxRate ?? 0) / 100)
      return {
        subtotal: summary.subtotal + subtotal,
        taxes: summary.taxes + taxes,
      }
    },
    { subtotal: 0, taxes: 0 },
  )

  function closeDialog(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) form.reset(getDefaultValues())
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nueva compra' : 'Editar compra'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Registra el borrador de una compra antes de enviarla al proveedor.'
              : 'Actualiza los datos del borrador antes de generar la orden.'}
          </DialogDescription>
        </DialogHeader>

        {lookupsLoading ? (
          <div className="grid gap-3 py-2">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        ) : (
          <form
            className="grid gap-5"
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit({
                ...values,
                expectedAt: values.expectedAt || undefined,
                externalReference: values.externalReference || undefined,
                notes: values.notes || undefined,
              })
              form.reset(getDefaultValues())
            })}
          >
            <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/10 p-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="grid gap-2 md:col-span-2 xl:col-span-1">
                <Label>Proveedor</Label>
                  <Controller
                    name="providerId"
                    control={form.control}
                    render={({ field }) => (
                      <SearchableOptionSelect
                        items={providers
                          .filter((provider) => provider.isActive !== false)
                          .map((provider) => ({ id: provider.id, label: provider.name, description: provider.description ?? 'Proveedor activo' }))}
                        value={field.value}
                        onChange={(nextProviderId) => {
                          field.onChange(nextProviderId)
                          const currentItems = form.getValues('items')
                          currentItems.forEach((item, index) => {
                            const product = productById.get(item.productId)
                            if (product && !productSupportsProvider(product, nextProviderId)) {
                              form.setValue(`items.${index}.productId`, undefined)
                            }
                          })
                        }}
                        placeholder="Selecciona un proveedor"
                        searchPlaceholder="Buscar proveedor..."
                        getDescription={(item) => item.description}
                      />
                    )}
                  />
                <FieldError error={form.formState.errors.providerId} />
              </div>

              <div className="grid gap-2 md:col-span-2 xl:col-span-1">
                <Label>Bodega de recepcion</Label>
                  <Controller
                    name="warehouseId"
                    control={form.control}
                    render={({ field }) => (
                      <SearchableOptionSelect
                        items={warehouses
                          .filter((warehouse) => warehouse.isActive !== false)
                          .map((warehouse) => ({
                            id: warehouse.id,
                            label: warehouse.location,
                            description: `${formatNumber(warehouse._count?.products ?? 0)} productos visibles`,
                          }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Selecciona una bodega"
                        searchPlaceholder="Buscar bodega..."
                        getDescription={(item) => item.description}
                      />
                    )}
                  />
                <FieldError error={form.formState.errors.warehouseId} />
              </div>

              <div className="grid gap-2">
                <Label>Fecha de compra</Label>
                <Input type="date" {...form.register('orderedAt')} />
                <FieldError error={form.formState.errors.orderedAt} />
              </div>

              <div className="grid gap-2">
                <Label>Entrega esperada</Label>
                <Input type="date" {...form.register('expectedAt')} />
                <FieldError error={form.formState.errors.expectedAt} />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label>Referencia del proveedor</Label>
                <Input {...form.register('externalReference')} placeholder="Cotizacion, factura proforma o referencia" />
                <FieldError error={form.formState.errors.externalReference} />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label>Notas</Label>
                <Textarea rows={3} {...form.register('notes')} placeholder="Condiciones, contacto o instrucciones de recepcion" />
                <FieldError error={form.formState.errors.notes} />
              </div>
            </div>

            <div className="grid gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Lineas de compra</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Productos del proveedor, cantidades, costo e impuesto.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    append({
                      productId: undefined,
                      quantity: 1,
                      unitCost: 0,
                      taxRate: 0,
                    })
                  }
                >
                  <Plus className="mr-2 size-4" />
                  Agregar linea
                </Button>
              </div>

              {fields.map((itemField, index) => {
                const product = productById.get(watchedItems?.[index]?.productId)
                const lineSubtotal = Number(watchedItems?.[index]?.quantity ?? 0) * Number(watchedItems?.[index]?.unitCost ?? 0)
                const lineTotal = lineSubtotal * (1 + Number(watchedItems?.[index]?.taxRate ?? 0) / 100)

                return (
                  <div
                    key={itemField.id}
                    className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4 md:grid-cols-2 xl:grid-cols-[1.5fr_0.55fr_0.75fr_0.55fr_0.8fr_auto] xl:items-end"
                  >
                    <div className="grid gap-2 md:col-span-2 xl:col-span-1">
                      <Label>Producto</Label>
                        <Controller
                          name={`items.${index}.productId`}
                          control={form.control}
                          render={({ field }) => (
                            <SearchableOptionSelect
                              items={providerProducts
                                .filter((item) => item.isActive !== false)
                                .map((item) => ({
                                  id: item.id,
                                  label: item.name,
                                  description: `${item.brand} · ${item.productType?.name ?? 'Sin tipo'}`,
                                }))}
                              value={field.value}
                              onChange={(productId) => {
                                const selectedProduct = productById.get(productId)
                                const activeCost = selectedProduct?.costs?.find((cost) => cost.isActive)
                                field.onChange(productId)
                                form.setValue(`items.${index}.taxRate`, Number(selectedProduct?.taxRate ?? 0), { shouldValidate: true })
                                if (activeCost) {
                                  form.setValue(`items.${index}.unitCost`, Number(activeCost.cost), { shouldValidate: true })
                                }
                              }}
                              placeholder={selectedProviderId ? 'Selecciona un producto' : 'Selecciona primero el proveedor'}
                              searchPlaceholder={selectedProviderId ? 'Buscar producto...' : 'Selecciona primero el proveedor'}
                              getDescription={(item) => item.description}
                            />
                          )}
                        />
                      <FieldError error={form.formState.errors.items?.[index]?.productId} />
                    </div>

                    <div className="grid gap-2">
                      <Label>Cantidad</Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        {...form.register(`items.${index}.quantity`, {
                          setValueAs: Number,
                        })}
                      />
                      <FieldError error={form.formState.errors.items?.[index]?.quantity} />
                    </div>

                    <div className="grid gap-2">
                      <Label>Costo unitario</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        {...form.register(`items.${index}.unitCost`, {
                          setValueAs: Number,
                        })}
                      />
                      <FieldError error={form.formState.errors.items?.[index]?.unitCost} />
                    </div>

                    <div className="grid gap-2">
                      <Label>Impuesto %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        {...form.register(`items.${index}.taxRate`, {
                          setValueAs: Number,
                        })}
                      />
                      <FieldError error={form.formState.errors.items?.[index]?.taxRate} />
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Total linea</p>
                      <p className="mt-1 text-sm font-semibold">{formatCurrency(lineTotal)}</p>
                      <p className="text-xs text-muted-foreground">{product?.unit ?? 'UND'}</p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label={`Eliminar linea ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )
              })}
              <FieldError error={form.formState.errors.items?.root ?? form.formState.errors.items} />
            </div>

            <div className="grid gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="mt-1 font-semibold">{formatCurrency(preview.subtotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Impuestos</p>
                <p className="mt-1 font-semibold">{formatCurrency(preview.taxes)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total estimado</p>
                <p className="mt-1 text-lg font-semibold text-primary">{formatCurrency(preview.subtotal + preview.taxes)}</p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Crear borrador' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PurchaseDetail({ purchase, onAction }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Resumen</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Proveedor</p>
            <p className="mt-1 text-sm font-medium">{getProviderName(purchase)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Bodega</p>
            <p className="mt-1 text-sm font-medium">{getWarehouseName(purchase)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fecha de compra</p>
            <p className="mt-1 text-sm font-medium">{formatDate(purchase.orderedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Entrega esperada</p>
            <p className="mt-1 text-sm font-medium">{purchase.expectedAt ? formatDate(purchase.expectedAt) : 'Sin fecha'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Recibida el</p>
            <p className="mt-1 text-sm font-medium">{purchase.receivedAt ? formatDate(purchase.receivedAt) : 'Pendiente'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Referencia</p>
            <p className="mt-1 text-sm font-medium">{purchase.externalReference ?? 'Sin referencia'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Notas</p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{purchase.notes ?? 'Sin notas'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary uppercase">Productos</p>
        <div className="grid gap-3">
          {(purchase.items ?? []).map((item) => (
            <div key={item.id ?? item.productId} className="rounded-xl border border-border/70 bg-muted/10 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{item.product?.name ?? `Producto #${item.productId}`}</p>
                  <p className="text-xs text-muted-foreground">{item.product?.brand ?? item.unit ?? 'UND'}</p>
                </div>
                <p className="text-sm font-semibold">{formatCurrency(item.total)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <span>Pedido: {formatNumber(item.quantity)}</span>
                <span>Recibido: {formatNumber(item.receivedQuantity)}</span>
                <span>Costo: {formatCurrency(item.unitCost)}</span>
                <span>Impuesto: {formatNumber(item.taxRate)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border/70 bg-card p-4 text-right">
        <div>
          <p className="text-xs text-muted-foreground">Subtotal</p>
          <p className="mt-1 text-sm font-medium">{formatCurrency(purchase.subtotal)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Impuestos</p>
          <p className="mt-1 text-sm font-medium">{formatCurrency(purchase.taxes)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 font-semibold text-primary">{formatCurrency(purchase.total)}</p>
        </div>
      </div>

      {purchase.status === 'BORRADOR' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => onAction('order', purchase)}>
            <Truck className="mr-2 size-4" />
            Generar orden
          </Button>
          <Button variant="outline" onClick={() => onAction('edit', purchase)}>
            Editar borrador
          </Button>
          <Button className="sm:col-span-2" variant="destructive" onClick={() => onAction('cancel', purchase)}>
            Anular compra
          </Button>
        </div>
      ) : null}
      {purchase.status === 'ORDENADA' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => onAction('receive', purchase)}>
            <PackageCheck className="mr-2 size-4" />
            Confirmar recepcion
          </Button>
          <Button variant="destructive" onClick={() => onAction('cancel', purchase)}>
            Anular compra
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function PurchasesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [status, setStatus] = useState('TODAS')
  const [providerId, setProviderId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editPurchase, setEditPurchase] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)

  const purchasesQuery = useQuery({
    queryKey: ['compras', status, deferredSearch, providerId, warehouseId, startDate, endDate, currentPage],
    queryFn: () =>
      apiClient.get('/compras', {
        status: status === 'TODAS' ? undefined : status,
        q: deferredSearch,
        providerId: providerId || undefined,
        warehouseId: warehouseId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })
  const reportQuery = useQuery({
    queryKey: ['compras-resumen', providerId, warehouseId, startDate, endDate],
    queryFn: () =>
      apiClient.get('/compras/reportes/resumen', {
        providerId: providerId || undefined,
        warehouseId: warehouseId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    retry: false,
  })
  const providersQuery = useQuery({
    queryKey: ['compras-proveedores'],
    queryFn: () => apiClient.getAllPages('/proveedores', { estado: 'todos' }),
  })
  const warehousesQuery = useQuery({
    queryKey: ['compras-bodegas'],
    queryFn: () => apiClient.getAllPages('/bodegas', { estado: 'todos' }),
  })
  const productsQuery = useQuery({
    queryKey: ['compras-productos'],
    queryFn: () => apiClient.getAllPages('/productos', { estado: 'todos' }),
    enabled: createOpen || Boolean(editPurchase),
  })
  const detailQuery = useQuery({
    queryKey: ['compras', 'detalle', detailId],
    queryFn: () => apiClient.get(`/compras/${detailId}`),
    enabled: Boolean(detailId),
  })

  function invalidatePurchaseQueries() {
    queryClient.invalidateQueries({ queryKey: ['compras'] })
    queryClient.invalidateQueries({ queryKey: ['compras-resumen'] })
    queryClient.invalidateQueries({ queryKey: ['inventario'] })
  }

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/compras', payload),
    onSuccess: () => {
      invalidatePurchaseQueries()
      setCreateOpen(false)
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/compras/${id}`, payload),
    onSuccess: () => {
      invalidatePurchaseQueries()
      setEditPurchase(null)
    },
  })
  const orderMutation = useMutation({
    mutationFn: (id) => apiClient.post(`/compras/${id}/ordenar`),
    onSuccess: invalidatePurchaseQueries,
  })
  const receiveMutation = useMutation({
    mutationFn: (id) => apiClient.post(`/compras/${id}/recibir`),
    onSuccess: invalidatePurchaseQueries,
  })
  const cancelMutation = useMutation({
    mutationFn: (id) => apiClient.patch(`/compras/${id}/anular`),
    onSuccess: invalidatePurchaseQueries,
  })

  if (purchasesQuery.isLoading) return <PurchaseSkeleton />

  if (purchasesQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {purchasesQuery.error.message}
      </div>
    )
  }

  const purchases = purchasesQuery.data?.data ?? []
  const totalItems = Number(purchasesQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(purchasesQuery.data?.totalPages ?? 1))
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + purchases.length - 1, totalItems)
  const providers = providersQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []
  const products = productsQuery.data ?? []
  const report = reportQuery.data
  const visibleDrafts = purchases.filter((purchase) => purchase.status === 'BORRADOR').length
  const visibleOrdered = purchases.filter((purchase) => purchase.status === 'ORDENADA').length
  const visibleReceived = purchases.filter((purchase) => purchase.status === 'RECIBIDA').length
  const visibleTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.total ?? 0), 0)
  const summaryCards = [
    {
      label: 'Compras registradas',
      value: formatNumber(report?.totalPurchases ?? totalItems),
      help: 'Documentos incluidos en el corte seleccionado.',
      icon: ClipboardList,
    },
    {
      label: 'Por gestionar',
      value: formatNumber(report?.draftCount ?? visibleDrafts),
      help: 'Borradores que aun no se han enviado al proveedor.',
      icon: CalendarClock,
    },
    {
      label: 'En transito',
      value: formatNumber(report?.orderedCount ?? visibleOrdered),
      help: 'Ordenes emitidas pendientes de recepcion.',
      icon: Truck,
    },
    {
      label: 'Valor comprado',
      value: formatCurrency(report?.totalAmount ?? visibleTotal),
      help: `${formatNumber(report?.receivedCount ?? visibleReceived)} compras recibidas en el corte.`,
      icon: WalletCards,
    },
  ]

  function resetPage() {
    setCurrentPage(1)
  }

  async function handleCreate(payload) {
    await toast.promise(createMutation.mutateAsync(payload), {
      loading: 'Creando compra...',
      success: 'Compra creada como borrador',
      error: (error) => error.message,
    })
  }

  async function handleUpdate(payload) {
    if (!editPurchase) return
    await toast.promise(updateMutation.mutateAsync({ id: editPurchase.id, payload }), {
      loading: 'Actualizando compra...',
      success: 'Compra actualizada',
      error: (error) => error.message,
    })
  }

  async function loadPurchaseForEdit(purchase) {
    if (purchase.status !== 'BORRADOR') return
    try {
      const detail = await toast.promise(apiClient.get(`/compras/${purchase.id}`), {
        loading: 'Cargando compra...',
        error: (error) => error.message,
      })
      setEditPurchase(detail)
      setDetailId(null)
    } catch {
      return
    }
  }

  function requestAction(type, purchase) {
    if (type === 'edit') {
      loadPurchaseForEdit(purchase)
      return
    }
    setPendingAction({ type, purchase })
  }

  async function confirmAction() {
    if (!pendingAction) return
    const { type, purchase } = pendingAction
    const options = {
      order: {
        mutation: orderMutation,
        loading: 'Generando orden...',
        success: 'Orden enviada al proveedor',
      },
      receive: {
        mutation: receiveMutation,
        loading: 'Registrando recepcion...',
        success: 'Compra recibida e inventario actualizado',
      },
      cancel: {
        mutation: cancelMutation,
        loading: 'Anulando compra...',
        success: 'Compra anulada',
      },
    }[type]
    if (!options) return

    try {
      await toast.promise(options.mutation.mutateAsync(purchase.id), {
        loading: options.loading,
        success: options.success,
        error: (error) => error.message,
      })
      setPendingAction(null)
      if (detailId === purchase.id) setDetailId(null)
    } catch {
      return
    }
  }

  const actionCopy = {
    order: {
      title: 'Generar orden de compra',
      description: 'El borrador pasara a ORDENADA y quedara pendiente de recepcion.',
      confirm: 'Generar orden',
    },
    receive: {
      title: 'Confirmar recepcion',
      description: 'Se recibiran todas las cantidades pedidas y se actualizara el inventario de la bodega.',
      confirm: 'Confirmar recepcion',
    },
    cancel: {
      title: 'Anular compra',
      description: 'La compra quedara anulada y se conservara para trazabilidad.',
      confirm: 'Anular compra',
    },
  }[pendingAction?.type]

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">Compras / Abastecimiento</Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Compras a proveedores</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Planea compras, emite ordenes y registra recepciones con impacto en costos e inventario.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nueva compra
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label} className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="mt-2 text-2xl font-semibold">{card.value}</CardTitle>
                </div>
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <Icon className="size-5" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{card.help}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5 xl:col-span-2">
          <CardHeader>
            <CardTitle>Desempeno por proveedor</CardTitle>
            <CardDescription>Valor recibido, tiempo medio desde la orden y cumplimiento de la fecha esperada.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Ordenes</TableHead>
                  <TableHead>Comprado</TableHead>
                  <TableHead>Tiempo medio</TableHead>
                  <TableHead>A tiempo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report?.byProvider?.length ? (
                  report.byProvider.map((item) => (
                    <TableRow key={item.provider?.id ?? item.providerId}>
                      <TableCell className="font-medium">{item.provider?.name ?? 'Proveedor'}</TableCell>
                      <TableCell>{formatNumber(item.orders)}</TableCell>
                      <TableCell>{formatCurrency(item.total)}</TableCell>
                      <TableCell>{formatNumber(item.averageLeadDays)} dias</TableCell>
                      <TableCell>{item.onTimeRate == null ? 'Sin fecha meta' : `${formatNumber(item.onTimeRate)}%`}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Recibe compras para comparar proveedores.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Indicadores de entrega</CardTitle>
            <CardDescription>Medidos sobre compras recibidas en el corte.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <p className="text-xs text-muted-foreground">Tiempo promedio</p>
              <p className="mt-1 text-2xl font-semibold">{formatNumber(report?.averageLeadDays ?? 0)} dias</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <p className="text-xs text-muted-foreground">Entregas a tiempo</p>
              <p className="mt-1 text-2xl font-semibold">
                {report?.onTimeRate == null ? 'Sin medicion' : `${formatNumber(report.onTimeRate)}%`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Serie de compras</CardTitle>
            <CardDescription>Evolucion mensual de documentos recibidos y valor comprado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {report?.timeline?.length ? (
              report.timeline.map((item) => (
                <div key={item.period} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{item.period}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(item.orders)} ordenes</p>
                  </div>
                  <p className="font-semibold">{formatCurrency(item.total)}</p>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Aun no hay una serie de compras recibidas.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Productos mas comprados</CardTitle>
            <CardDescription>Cantidades y costo acumulado por producto.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {report?.topProducts?.length ? (
              report.topProducts.map((item) => (
                <div
                  key={item.product?.id ?? item.productId}
                  className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{item.product?.name ?? 'Producto'}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(item.receivedQuantity)} recibidos</p>
                  </div>
                  <p className="font-semibold">{formatCurrency(item.total)}</p>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Recibe compras para construir la serie por producto.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader>
          <CardTitle>Productos comprados por proveedor</CardTitle>
          <CardDescription>
            Cruce directo para ver a quién le compras cada producto, cuántas unidades recibiste y cuánto dinero has movido con ese proveedor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Lineas</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Recibido</TableHead>
                <TableHead>Costo promedio</TableHead>
                <TableHead>Total comprado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report?.byProductProvider?.length ? (
                report.byProductProvider.map((item) => (
                  <TableRow key={`${item.provider?.id ?? 'p'}-${item.product?.id ?? 'x'}`}>
                    <TableCell className="font-medium">{item.provider?.name ?? 'Proveedor'}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{item.product?.name ?? 'Producto'}</p>
                        <p className="text-xs text-muted-foreground">{item.product?.brand ?? item.product?.unit ?? 'Sin marca'}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatNumber(item.orderLines)}</TableCell>
                    <TableCell>{formatNumber(item.orderedQuantity)}</TableCell>
                    <TableCell>{formatNumber(item.receivedQuantity)}</TableCell>
                    <TableCell>{formatCurrency(item.averageUnitCost)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(item.total)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Todavia no hay compras recibidas para construir la relacion producto-proveedor.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader>
          <CardTitle>Operacion de compras</CardTitle>
          <CardDescription>Filtra por estado, proveedor, bodega o fecha y controla cada etapa de abastecimiento.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(5,1fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPage()
                }}
                placeholder="Buscar consecutivo o referencia..."
                className="pl-9"
              />
            </div>
            <NativeSelect
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPage()
              }}
            >
              <option value="TODAS">Todos los estados</option>
              {Object.entries(purchaseStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value)
                resetPage()
              }}
            >
              <option value="">Todos los proveedores</option>
              {providers.map((provider) => (
                <option key={provider.id} value={String(provider.id)}>
                  {provider.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value)
                resetPage()
              }}
            >
              <option value="">Todas las bodegas</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={String(warehouse.id)}>
                  {warehouse.location}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label="Fecha inicial"
              title="Fecha inicial"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value)
                resetPage()
              }}
            />
            <Input
              aria-label="Fecha final"
              title="Fecha final"
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value)
                resetPage()
              }}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compra</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Bodega</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Entrega esperada</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length ? (
                purchases.map((purchase) => (
                  <TableRow key={purchase.id} className="cursor-pointer" onClick={() => setDetailId(purchase.id)}>
                    <TableCell>
                      <p className="font-medium text-primary">{purchase.consecutive}</p>
                      <p className="text-xs text-muted-foreground">{purchase.externalReference ?? `ID #${purchase.id}`}</p>
                    </TableCell>
                    <TableCell>{getProviderName(purchase)}</TableCell>
                    <TableCell>{getWarehouseName(purchase)}</TableCell>
                    <TableCell>{formatDate(purchase.orderedAt)}</TableCell>
                    <TableCell>{purchase.expectedAt ? formatDate(purchase.expectedAt) : 'Sin fecha'}</TableCell>
                    <TableCell>{formatNumber(purchase.items?.length ?? purchase.itemsCount ?? 0)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(purchase.total)}</TableCell>
                    <TableCell>
                      <Badge variant={purchaseStatusVariants[purchase.status] ?? 'outline'}>{getPurchaseStatus(purchase.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="rounded-full">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setDetailId(purchase.id)}>Ver detalle</DropdownMenuItem>
                          {purchase.status === 'BORRADOR' ? (
                            <DropdownMenuItem onClick={() => requestAction('edit', purchase)}>Editar borrador</DropdownMenuItem>
                          ) : null}
                          {purchase.status === 'BORRADOR' ? (
                            <DropdownMenuItem onClick={() => requestAction('order', purchase)}>Generar orden</DropdownMenuItem>
                          ) : null}
                          {purchase.status === 'ORDENADA' ? (
                            <DropdownMenuItem onClick={() => requestAction('receive', purchase)}>Confirmar recepcion</DropdownMenuItem>
                          ) : null}
                          {['BORRADOR', 'ORDENADA'].includes(purchase.status) ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => requestAction('cancel', purchase)}
                            >
                              Anular compra
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6">
                      <Box className="mx-auto mb-3 size-7 text-muted-foreground" />
                      <p className="font-medium">No hay compras para esta vista</p>
                      <p className="mt-1 text-sm text-muted-foreground">Ajusta los filtros o crea el primer borrador de compra.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <LocalPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startItem={startItem}
            endItem={endItem}
            singularLabel="compra"
            pluralLabel="compras"
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <PurchaseFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        providers={providers}
        warehouses={warehouses}
        products={products}
        lookupsLoading={providersQuery.isLoading || warehousesQuery.isLoading || productsQuery.isLoading}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />
      <PurchaseFormDialog
        open={Boolean(editPurchase)}
        onOpenChange={(open) => !open && setEditPurchase(null)}
        mode="edit"
        purchase={editPurchase}
        providers={providers}
        warehouses={warehouses}
        products={products}
        lookupsLoading={productsQuery.isLoading}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailId)}
        onOpenChange={(open) => !open && setDetailId(null)}
        title={detailQuery.data?.consecutive ?? 'Detalle de compra'}
        description={detailQuery.data ? getProviderName(detailQuery.data) : 'Cargando informacion...'}
        badge={
          detailQuery.data
            ? {
                label: getPurchaseStatus(detailQuery.data.status),
                variant: purchaseStatusVariants[detailQuery.data.status],
              }
            : null
        }
      >
        {detailQuery.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        ) : null}
        {detailQuery.isError ? (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            {detailQuery.error.message}
          </div>
        ) : null}
        {detailQuery.data ? <PurchaseDetail purchase={detailQuery.data} onAction={requestAction} /> : null}
      </ModuleDetailsDrawer>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{actionCopy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant={pendingAction?.type === 'cancel' ? 'destructive' : 'default'} onClick={confirmAction}>
              {actionCopy?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
