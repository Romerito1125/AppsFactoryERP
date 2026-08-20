import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Eye, FileDown, FilePlus2, ImageUp, MoreHorizontal, Plus, ScanLine, Search, Star, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog'
import { Badge } from '@/components/ui/badge'
import { ProductImage } from '@/components/product-image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { apiClient } from '@/lib/api-client'
import { readBarcodeFromImage } from '@/lib/barcode-reader'
import { formatCurrency, formatDate, formatInvoiceSource, formatInvoiceStatus, formatNumber, formatRole } from '@/lib/format'
import { cn } from '@/lib/utils'
import { downloadInvoicePdf, openInvoicePdf } from '@/modules/invoices/invoice-pdf'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = 20

const invoiceSchema = z.object({
  clientId: z.number().int().positive().optional(),
  referralDiscount: z.number().min(0, 'No puede ser negativo').optional(),
  items: z
    .array(
      z.object({
        productId: z.number({ message: 'Selecciona un producto' }).int().positive('Selecciona un producto'),
        productPriceId: z.number().int().positive('Selecciona un precio valido').optional(),
        warehouseId: z.number().int().positive().optional(),
        unitPrice: z.number().min(0).optional(),
        quantity: z.number({ message: 'Cantidad obligatoria' }).int().positive('Minimo 1 unidad'),
      }),
    )
    .min(1, 'Agrega al menos un producto'),
})

const consecutiveSchema = z.object({
  consecutive: z.string().min(4, 'Minimo 4 caracteres'),
})

function getProductTotalStock(product) {
  return (product?.warehouses ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
}

function getActiveProductPrices(product) {
  return (product?.prices ?? []).filter((price) => price.isActive)
}

function getDefaultActivePrice(product) {
  return getActiveProductPrices(product).find((price) => price.isDefault) ?? getActiveProductPrices(product)[0]
}

function getProductSearchText(product) {
  return [product.name, product.brand, product.description, product.productType?.name].filter(Boolean).join(' ')
}

function getInvoiceActorLabel(invoice) {
  if (invoice.source === 'APP_MOVIL') {
    return 'App movil'
  }

  if (invoice.createdByRole || invoice.createdByUsername) {
    return [invoice.createdByRole ? formatRole(invoice.createdByRole) : null, invoice.createdByUsername].filter(Boolean).join(' · ')
  }

  return formatInvoiceSource(invoice.source)
}

function InvoiceSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[480px] rounded-2xl" />
    </div>
  )
}

function InvoiceClientSelector({ clients, value, onChange, isLoading }) {
  const [query, setQuery] = useState('')
  const filteredClients = query.trim()
    ? clients.filter((client) =>
        [client.firstName, client.lastName, client.identification]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query.trim().toLowerCase())),
      )
    : clients
  const selectedClient = clients.find((client) => client.id === value)

  return (
    <div className="grid gap-3">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente por nombre o documento..." disabled={isLoading} />
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-3 text-sm">
        <p className="font-medium text-foreground">
          {selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'Sin cliente asociado'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {selectedClient ? selectedClient.identification ?? 'Sin documento' : 'La factura se registrara como consumidor final.'}
        </p>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-border/70 p-2">
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              !value ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-background hover:border-primary/40 hover:bg-primary/5'
            }`}
          >
            <p className="text-sm font-medium">Sin cliente asociado</p>
            <p className="text-xs text-muted-foreground">Usar consumidor final</p>
          </button>
          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)
            : filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onChange(client.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    client.id === value ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-background hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <p className="truncate text-sm font-medium text-foreground">{`${client.firstName} ${client.lastName}`}</p>
                  <p className="truncate text-xs text-muted-foreground">{client.identification ?? 'Sin documento'}</p>
                </button>
              ))}
        </div>
      </div>
    </div>
  )
}

function CreateInvoiceDialog({ open, onOpenChange, clients, clientsLoading, products, warehouses, onSubmit, isSubmitting }) {
  const queryClient = useQueryClient()
  const form = useForm({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      clientId: undefined,
      referralDiscount: 0,
      items: [{ productId: undefined, productPriceId: undefined, warehouseId: undefined, unitPrice: undefined, quantity: 1 }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  const watchedItems = useWatch({ control: form.control, name: 'items' })
  const selectedClientId = useWatch({
    control: form.control,
    name: 'clientId',
  })

  const [catalogSearch, setCatalogSearch] = useState('')
  const deferredCatalogSearch = useDeferredValue(catalogSearch)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [catalogTargetIndex, setCatalogTargetIndex] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false)
  const barcodeImageInputRef = useRef(null)

  const favoritesQuery = useQuery({
    queryKey: ['productos-favoritos-mios'],
    queryFn: () => apiClient.get('/productos/favoritos/mios'),
    enabled: open,
  })
  const referralBalanceQuery = useQuery({
    queryKey: ['cliente-estadisticas-referidos', selectedClientId],
    queryFn: () => apiClient.get(`/clientes/${selectedClientId}/estadisticas-referidos`),
    enabled: open && Boolean(selectedClientId),
  })
  const favoriteMutation = useMutation({
    mutationFn: ({ productId, isFavorite }) =>
      isFavorite ? apiClient.delete(`/productos/${productId}/favorito`) : apiClient.put(`/productos/${productId}/favorito`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['productos-favoritos-mios'] }),
  })

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const favoriteProductIdSet = useMemo(() => new Set((favoritesQuery.data ?? []).map((product) => product.id)), [favoritesQuery.data])
  const availableReferralDiscount = Number(referralBalanceQuery.data?.descuentoDisponible ?? 0)
  const catalogSearchText = deferredCatalogSearch.trim().toLowerCase()

  const catalogProducts = useMemo(
    () =>
      products
        .filter((product) => product.isActive !== false && getActiveProductPrices(product).length)
        .filter((product) => {
          if (favoritesOnly && !favoriteProductIdSet.has(product.id)) {
            return false
          }

          if (!catalogSearchText) {
            return true
          }

          return getProductSearchText(product).toLowerCase().includes(catalogSearchText)
        })
        .sort((left, right) => {
          const leftFavoriteWeight = favoriteProductIdSet.has(left.id) ? 1 : 0
          const rightFavoriteWeight = favoriteProductIdSet.has(right.id) ? 1 : 0

          if (leftFavoriteWeight !== rightFavoriteWeight) {
            return rightFavoriteWeight - leftFavoriteWeight
          }

          return left.name.localeCompare(right.name)
        }),
    [catalogSearchText, favoriteProductIdSet, favoritesOnly, products],
  )

  function resetDialog() {
    form.reset({
      clientId: undefined,
      referralDiscount: 0,
      items: [{ productId: undefined, productPriceId: undefined, warehouseId: undefined, unitPrice: undefined, quantity: 1 }],
    })
    setCatalogSearch('')
    setFavoritesOnly(false)
    setCatalogTargetIndex(null)
  }

  function closeDialog(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetDialog()
    }
  }

  const toggleFavoriteProduct = useCallback(
    async (productId) => {
      const isFavorite = favoriteProductIdSet.has(productId)
      await toast.promise(favoriteMutation.mutateAsync({ productId, isFavorite }), {
        loading: isFavorite ? 'Quitando favorito...' : 'Guardando favorito...',
        success: isFavorite ? 'Favorito eliminado' : 'Favorito guardado en tu cuenta',
        error: (error) => error.message,
      })
    },
    [favoriteMutation, favoriteProductIdSet],
  )

  const applyProductToItem = useCallback(
    (index, product) => {
      const defaultPrice = getDefaultActivePrice(product)

      form.setValue(`items.${index}.productId`, product.id, {
        shouldDirty: true,
        shouldValidate: true,
      })
      form.setValue(`items.${index}.productPriceId`, defaultPrice?.id, {
        shouldDirty: true,
        shouldValidate: true,
      })
      form.setValue(`items.${index}.warehouseId`, product.warehouses?.find((item) => Number(item.quantity ?? 0) > 0)?.warehouseId, {
        shouldDirty: true,
        shouldValidate: true,
      })
      form.setValue(`items.${index}.unitPrice`, undefined, {
        shouldDirty: true,
        shouldValidate: true,
      })

      if (!form.getValues(`items.${index}.quantity`)) {
        form.setValue(`items.${index}.quantity`, 1, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
    },
    [form],
  )

  const handleCatalogSelection = useCallback(
    (product) => {
      const currentItems = form.getValues('items')

      if (catalogTargetIndex !== null && currentItems[catalogTargetIndex]) {
        applyProductToItem(catalogTargetIndex, product)
        setCatalogTargetIndex(null)
        return
      }

      const firstEmptyIndex = currentItems.findIndex((item) => !item.productId)

      if (firstEmptyIndex >= 0) {
        applyProductToItem(firstEmptyIndex, product)
        return
      }

      const defaultPrice = getDefaultActivePrice(product)
      append({
        productId: product.id,
        productPriceId: defaultPrice?.id,
        warehouseId: product.warehouses?.find((item) => Number(item.quantity ?? 0) > 0)?.warehouseId,
        unitPrice: undefined,
        quantity: 1,
      })
    },
    [append, applyProductToItem, catalogTargetIndex, form],
  )

  const handleBarcodeImageSelection = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''

      if (!file) {
        return
      }

      setScanLoading(true)

      try {
        const result = await readBarcodeFromImage(file)
        const product = await apiClient.get(`/productos/codigo-barras/${encodeURIComponent(result.code)}`)
        handleCatalogSelection(product)
        toast.success(`Producto detectado por codigo ${result.code}`)
      } catch (error) {
        toast.error(error.message)
      } finally {
        setScanLoading(false)
      }
    },
    [handleCatalogSelection],
  )

  const handleBarcodeDetected = useCallback(
    async (result) => {
      try {
        const product = await apiClient.get(`/productos/codigo-barras/${encodeURIComponent(result.code)}`)
        handleCatalogSelection(product)
        toast.success(`Producto detectado por codigo ${result.code}`)
      } catch (error) {
        toast.error(error.message)
      }
    },
    [handleCatalogSelection],
  )

  const catalogProductCards = useMemo(
    () =>
      catalogProducts.map((product) => {
        const defaultPrice = getDefaultActivePrice(product)
        const isFavorite = favoriteProductIdSet.has(product.id)

        return (
          <div
            key={product.id}
            className="relative rounded-2xl border border-border/70 bg-card p-3 transition hover:border-primary/35 hover:shadow-sm hover:shadow-primary/10"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 z-10 rounded-full"
              onClick={() => toggleFavoriteProduct(product.id)}
            >
              <Star className={cn('size-4', isFavorite && 'fill-current text-primary')} />
            </Button>

            <button type="button" onClick={() => handleCatalogSelection(product)} className="grid w-full gap-3 text-left">
              <ProductImage src={product.imageUrl} alt={product.name} className="aspect-[4/3] w-full rounded-xl" iconClassName="size-6" />
              <div className="pr-8">
                <p className="line-clamp-1 text-sm font-medium text-foreground">{product.name}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {product.brand} · {product.productType?.name ?? 'Sin tipo'}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Stock {formatNumber(getProductTotalStock(product))}</span>
                <span>{defaultPrice ? formatCurrency(defaultPrice.price) : 'Sin precio'}</span>
              </div>
            </button>
          </div>
        )
      }),
    [catalogProducts, favoriteProductIdSet, handleCatalogSelection, toggleFavoriteProduct],
  )

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Nueva factura</DialogTitle>
          <DialogDescription>Crea la venta con un catalogo visual para seleccionar productos por imagen y favoritos.</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values)
            resetDialog()
          })}
        >
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                <div className="grid gap-2">
                  <Label>Cliente</Label>
                    <Controller
                      name="clientId"
                      control={form.control}
                      render={({ field }) => (
                        <InvoiceClientSelector clients={clients} value={field.value} onChange={field.onChange} isLoading={clientsLoading} />
                      )}
                    />
                  {form.formState.errors.clientId ? (
                    <p className="text-xs text-destructive">{String(form.formState.errors.clientId.message)}</p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Descuento de red</p>
                  <p className="mt-2 text-sm text-muted-foreground">Saldo disponible para este cliente</p>
                  <p className="mt-1 text-xl font-semibold text-primary">{formatCurrency(availableReferralDiscount)}</p>
                  <div className="mt-3 grid gap-2">
                    <Label htmlFor="referralDiscount">Valor a aplicar</Label>
                    <Input
                      id="referralDiscount"
                      type="number"
                      min="0"
                      max={availableReferralDiscount}
                      step="0.01"
                      {...form.register('referralDiscount', {
                        setValueAs: (value) => Number(value || 0),
                      })}
                    />
                    {form.formState.errors.referralDiscount ? (
                      <p className="text-xs text-destructive">{String(form.formState.errors.referralDiscount.message)}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <Label>Items</Label>
                    <p className="text-xs text-muted-foreground">
                      {catalogTargetIndex !== null
                        ? `El catalogo esta cambiando la linea ${catalogTargetIndex + 1}`
                        : 'Haz clic en un producto del panel para agregarlo a la siguiente linea disponible.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const nextIndex = fields.length
                      append({
                        productId: undefined,
                        productPriceId: undefined,
                        warehouseId: undefined,
                        unitPrice: undefined,
                        quantity: 1,
                      })
                      setCatalogTargetIndex(nextIndex)
                    }}
                  >
                    <Plus className="mr-2 size-4" />
                    Agregar linea
                  </Button>
                </div>

                <div className="grid max-h-[46vh] gap-3 overflow-y-auto pr-2">
                  {fields.map((itemField, index) => {
                    const selectedProduct = productById.get(watchedItems[index]?.productId)
                    const activePrices = getActiveProductPrices(selectedProduct)
                    const selectedProductPrice =
                      activePrices.find((price) => price.id === watchedItems[index]?.productPriceId) ??
                      getDefaultActivePrice(selectedProduct)
                    const totalStock = getProductTotalStock(selectedProduct)

                    return (
                      <div
                        key={itemField.id}
                        className={cn(
                          'grid gap-3 rounded-2xl border border-border/70 bg-card p-4 md:grid-cols-[1.2fr_1fr_0.9fr_0.55fr_0.95fr_auto] md:items-end',
                          catalogTargetIndex === index && 'border-primary/40 ring-2 ring-primary/15',
                        )}
                      >
                        <div className="grid gap-2">
                          <Label>Producto</Label>
                          {selectedProduct ? (
                            <button
                              type="button"
                              onClick={() => setCatalogTargetIndex(index)}
                              className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                            >
                              <ProductImage
                                src={selectedProduct.imageUrl}
                                alt={selectedProduct.name}
                                className="size-14 rounded-lg"
                                iconClassName="size-4"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{selectedProduct.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {selectedProduct.brand} · Stock {formatNumber(totalStock)}
                                </p>
                                <p className="mt-1 text-xs text-primary">Cambiar desde el catalogo</p>
                              </div>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCatalogTargetIndex(index)}
                              className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-center transition hover:border-primary/40 hover:bg-primary/5"
                            >
                              <p className="text-sm font-medium text-foreground">Seleccionar producto</p>
                              <p className="mt-1 text-xs text-muted-foreground">Usa el panel visual para escoger por imagen.</p>
                            </button>
                          )}
                          {form.formState.errors.items?.[index]?.productId ? (
                            <p className="text-xs text-destructive">{String(form.formState.errors.items[index].productId.message)}</p>
                          ) : null}
                        </div>

                        <div className="grid gap-2">
                          <Label>Precio</Label>
                          <Controller
                            name={`items.${index}.productPriceId`}
                            control={form.control}
                            render={({ field }) => (
                              <Select
                                value={field.value ? String(field.value) : undefined}
                                onValueChange={(value) => field.onChange(Number(value))}
                                disabled={!activePrices.length}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Precio activo" />
                                </SelectTrigger>
                                <SelectContent>
                                  {activePrices.map((price) => (
                                    <SelectItem key={price.id} value={String(price.id)}>
                                      {`${price.name} · ${formatCurrency(price.price)}${price.isDefault ? ' · default' : ''}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {form.formState.errors.items?.[index]?.productPriceId ? (
                            <p className="text-xs text-destructive">{String(form.formState.errors.items[index].productPriceId.message)}</p>
                          ) : null}
                          <Label className="mt-1">Precio acordado</Label>
                          <Controller
                            name={`items.${index}.unitPrice`}
                            control={form.control}
                            render={({ field }) => (
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={field.value ?? ''}
                                placeholder={selectedProductPrice ? String(selectedProductPrice.price) : 'Precio del catálogo'}
                                onChange={(event) => field.onChange(event.target.value === '' ? undefined : Number(event.target.value))}
                              />
                            )}
                          />
                          <p className="text-[11px] text-muted-foreground">Vacío = precio registrado.</p>
                        </div>

                        <div className="grid gap-2">
                          <Label>Bodega de salida</Label>
                          <Controller
                            name={`items.${index}.warehouseId`}
                            control={form.control}
                            render={({ field }) => (
                              <NativeSelect value={field.value ? String(field.value) : ''} onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}>
                                <option value="">Sin bodega</option>
                                {warehouses.filter((warehouse) => warehouse.isActive !== false).map((warehouse) => (
                                  <option key={warehouse.id} value={String(warehouse.id)}>{warehouse.location}</option>
                                ))}
                              </NativeSelect>
                            )}
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>Cantidad</Label>
                          <Input
                            type="number"
                            min="1"
                            {...form.register(`items.${index}.quantity`, {
                              setValueAs: (value) => Number(value),
                            })}
                          />
                          {form.formState.errors.items?.[index]?.quantity ? (
                            <p className="text-xs text-destructive">{String(form.formState.errors.items[index].quantity.message)}</p>
                          ) : null}
                        </div>

                        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                          <p className="text-xs text-muted-foreground">Vista previa</p>
                          <p className="mt-1 font-medium">
                            {selectedProductPrice
                              ? formatCurrency(Number(watchedItems[index]?.unitPrice ?? selectedProductPrice.price ?? 0) * Number(watchedItems[index]?.quantity ?? 0))
                              : 'Selecciona producto'}
                          </p>
                          {selectedProduct ? (
                            <p className="text-xs text-muted-foreground">
                              Stock {formatNumber(totalStock)} · IVA {selectedProduct.taxRate}%
                            </p>
                          ) : null}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            if (catalogTargetIndex === index) {
                              setCatalogTargetIndex(null)
                            }
                            if (catalogTargetIndex !== null && catalogTargetIndex > index) {
                              setCatalogTargetIndex(catalogTargetIndex - 1)
                            }
                            remove(index)
                          }}
                          disabled={fields.length === 1}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>

                {form.formState.errors.items?.message ? (
                  <p className="text-xs text-destructive">{String(form.formState.errors.items.message)}</p>
                ) : null}
              </div>
            </div>

            <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
              <CardHeader>
                <CardTitle>Catalogo visual</CardTitle>
                <CardDescription>Selecciona productos por imagen y guarda favoritos para facturar mas rapido.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex gap-2">
                  <input
                    ref={barcodeImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBarcodeImageSelection}
                  />
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      placeholder="Buscar por nombre, marca o tipo..."
                      className="pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    variant={favoritesOnly ? 'default' : 'outline'}
                    onClick={() => setFavoritesOnly((current) => !current)}
                    className="shrink-0"
                  >
                    <Star className={cn('mr-2 size-4', favoritesOnly && 'fill-current')} />
                    Favoritos
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setCameraScannerOpen(true)} className="shrink-0">
                    <ScanLine className="mr-2 size-4" />
                    Escanear
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => barcodeImageInputRef.current?.click()}
                    disabled={scanLoading}
                    className="shrink-0"
                  >
                    <ImageUp className="mr-2 size-4" />
                    {scanLoading ? 'Leyendo...' : 'Leer imagen'}
                  </Button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  <span>
                    {catalogTargetIndex !== null
                      ? `Cambiando producto de la linea ${catalogTargetIndex + 1}`
                      : 'Al seleccionar, se agrega a la siguiente linea disponible'}
                  </span>
                  <span>{formatNumber(catalogProducts.length)} productos</span>
                </div>

                <ScrollArea className="h-[560px] pr-4">
                  {catalogProducts.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{catalogProductCards}</div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-center">
                      <p className="font-medium text-foreground">No hay productos para este filtro</p>
                      <p className="mt-1 text-sm text-muted-foreground">Ajusta la busqueda o desactiva el filtro de favoritos.</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeDialog(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando...' : 'Crear factura'}
            </Button>
          </DialogFooter>
        </form>

        <BarcodeScannerDialog
          open={cameraScannerOpen}
          onOpenChange={setCameraScannerOpen}
          onDetected={handleBarcodeDetected}
          title="Escanear producto para la factura"
          description="Lee el codigo de barras con la camara para agregar el producto a la siguiente linea disponible."
        />
      </DialogContent>
    </Dialog>
  )
}

function UpdateConsecutiveDialog({ open, onOpenChange, invoice, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(consecutiveSchema),
    defaultValues: { consecutive: invoice?.consecutive ?? '' },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar consecutivo</DialogTitle>
          <DialogDescription>Actualiza el consecutivo manteniendo intacto el detalle comercial de la factura.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((values) => onSubmit(values))}>
          <div className="grid gap-2">
            <Label htmlFor="consecutive">Consecutivo</Label>
            <Input id="consecutive" {...form.register('consecutive')} />
            {form.formState.errors.consecutive ? (
              <p className="text-xs text-destructive">{String(form.formState.errors.consecutive.message)}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar consecutivo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function InvoicesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('ACTIVA')
  const [sourceFilter, setSourceFilter] = useState('TODOS')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [editInvoice, setEditInvoice] = useState(null)
  const [cancelInvoice, setCancelInvoice] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const [searchParams, setSearchParams] = useSearchParams()
  const invoiceIdParam = searchParams.get('invoiceId')

  const invoicesQuery = useQuery({
    queryKey: ['facturas', statusTab, sourceFilter, search, currentPage],
    queryFn: () =>
      apiClient.get('/facturas', {
        status: statusTab === 'TODAS' ? undefined : statusTab,
        source: sourceFilter === 'TODOS' ? undefined : sourceFilter,
        q: search,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })

  const invoices = useMemo(() => invoicesQuery.data?.data ?? [], [invoicesQuery.data?.data])
  const invoiceParamQuery = useQuery({
    queryKey: ['factura-detalle', invoiceIdParam],
    queryFn: () => apiClient.get(`/facturas/${invoiceIdParam}`),
    enabled: Boolean(invoiceIdParam),
  })
  const selectedDetailInvoice = detailInvoice ?? invoiceParamQuery.data ?? null

  const clientsQuery = useQuery({
    queryKey: ['facturas-clientes'],
    queryFn: () => apiClient.getAllPages('/clientes'),
    enabled: createOpen,
  })
  const productsQuery = useQuery({
    queryKey: ['facturas-productos'],
    queryFn: () => apiClient.getAllPages('/productos'),
    enabled: createOpen,
  })
  const warehousesQuery = useQuery({
    queryKey: ['facturas-bodegas'],
    queryFn: () => apiClient.getAllPages('/bodegas'),
    enabled: createOpen,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/facturas', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      queryClient.invalidateQueries({ queryKey: ['facturas-productos'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      setCreateOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/facturas/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      setEditInvoice(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (id) => apiClient.delete(`/facturas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      queryClient.invalidateQueries({ queryKey: ['facturas-productos'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      setCancelInvoice(null)
    },
  })
  const validateMutation = useMutation({
    mutationFn: (id) => apiClient.patch(`/facturas/${id}/validar`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      queryClient.invalidateQueries({ queryKey: ['factura-detalle'] })
    },
  })

  if (invoicesQuery.isLoading) {
    return <InvoiceSkeleton />
  }

  if (invoicesQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {invoicesQuery.error.message}
      </div>
    )
  }

  const totalItems = Number(invoicesQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(invoicesQuery.data?.totalPages ?? 1))
  const clients = clientsQuery.data ?? []
  const products = productsQuery.data ?? []
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + invoices.length - 1, totalItems)

  const activeInvoices = invoices.filter((invoice) => invoice.status === 'ACTIVA')
  const summaryCards = [
    {
      label: 'Facturas activas',
      value: formatNumber(activeInvoices.length),
      help: 'Operaciones contables vigentes.',
    },
    {
      label: 'Facturas anuladas',
      value: formatNumber(invoices.filter((invoice) => invoice.status === 'ANULADA').length),
      help: 'Documentos anulados con trazabilidad preservada.',
    },
    {
      label: 'Ingreso activo',
      value: formatCurrency(activeInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0)),
      help: 'Total acumulado de facturas activas.',
    },
    {
      label: 'Items vendidos',
      value: formatNumber(
        activeInvoices.reduce((sum, invoice) => sum + invoice.items.reduce((itemSum, item) => itemSum + Number(item.quantity ?? 0), 0), 0),
      ),
      help: 'Cantidad total de unidades registradas en ventas activas.',
    },
  ]

  async function handleCreateInvoice(payload) {
    await toast.promise(createMutation.mutateAsync(payload), {
      loading: 'Creando factura...',
      success: 'Factura creada correctamente',
      error: (error) => error.message,
    })
  }

  async function handleUpdateConsecutive(payload) {
    if (!editInvoice) return

    await toast.promise(updateMutation.mutateAsync({ id: editInvoice.id, payload }), {
      loading: 'Actualizando consecutivo...',
      success: 'Consecutivo actualizado',
      error: (error) => error.message,
    })
  }

  async function handleCancelInvoice() {
    if (!cancelInvoice) return

    await toast.promise(cancelMutation.mutateAsync(cancelInvoice.id), {
      loading: 'Anulando factura...',
      success: 'Factura anulada',
      error: (error) => error.message,
    })
  }

  async function handleValidateInvoice(invoice) {
    await toast.promise(validateMutation.mutateAsync(invoice.id), {
      loading: 'Validando factura...',
      success: 'Factura validada correctamente',
      error: (error) => error.message,
    })
  }

  function handleInvoicePdfView(invoice) {
    openInvoicePdf(invoice)
  }

  function handleInvoicePdfDownload(invoice) {
    downloadInvoicePdf(invoice)
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">Facturacion · Trazabilidad</Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Facturas</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            Flujo completo para crear facturas, cambiar consecutivos y anular documentos manteniendo inventario sincronizado.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <FilePlus2 className="mr-2 size-4" />
          Nueva factura
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold">{card.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{card.help}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Operacion de facturas</CardTitle>
            <CardDescription>Consulta, edicion de consecutivo y anulacion controlada.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 md:flex-row lg:w-auto">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Buscar por consecutivo o cliente..."
                className="pl-9"
              />
            </div>
            <NativeSelect
              value={sourceFilter}
              onChange={(event) => {
                setSourceFilter(event.target.value)
                setCurrentPage(1)
              }}
            >
              <option value="TODOS">Todos los origenes</option>
              <option value="ADMIN">Administracion</option>
              <option value="POS">POS</option>
              <option value="APP_MOVIL">App movil</option>
            </NativeSelect>
            <Tabs
              value={statusTab}
              onValueChange={(value) => {
                setStatusTab(value)
                setCurrentPage(1)
              }}
            >
              <TabsList>
                <TabsTrigger value="ACTIVA">Activas</TabsTrigger>
                <TabsTrigger value="ANULADA">Anuladas</TabsTrigger>
                <TabsTrigger value="TODAS">Todas</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consecutivo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Origen / autor</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length ? (
                invoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer transition hover:bg-muted/20"
                    onClick={() => setDetailInvoice(invoice)}
                  >
                    <TableCell className="font-medium text-primary">{invoice.consecutive}</TableCell>
                    <TableCell>{`${invoice.client.firstName} ${invoice.client.lastName}`}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{formatInvoiceSource(invoice.source)}</p>
                        <p className="text-xs text-muted-foreground">{getInvoiceActorLabel(invoice)}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatNumber(invoice.items.length)}</TableCell>
                    <TableCell>{formatCurrency(invoice.total)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={invoice.status === 'ACTIVA' ? 'default' : 'secondary'}>{formatInvoiceStatus(invoice.status)}</Badge>
                        {invoice.validationStatus === 'PENDIENTE' ? <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">Pendiente de validar</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="rounded-full">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setDetailInvoice(invoice)}>Ver detalle</DropdownMenuItem>
                            {invoice.validationStatus === 'PENDIENTE' ? (
                              <DropdownMenuItem onClick={() => handleValidateInvoice(invoice)}>Validar factura</DropdownMenuItem>
                            ) : null}
                           <DropdownMenuItem onClick={() => handleInvoicePdfView(invoice)}>
                             Ver PDF
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => handleInvoicePdfDownload(invoice)}>
                             Descargar PDF
                           </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditInvoice(invoice)}>Editar consecutivo</DropdownMenuItem>
                            {invoice.status === 'ACTIVA' ? (
                              <DropdownMenuItem onClick={() => setCancelInvoice(invoice)} className="text-destructive focus:text-destructive">
                              Anular factura
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6">
                      <p className="font-medium text-foreground">No hay facturas para esta vista</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Ajusta el filtro o crea una nueva factura para iniciar la operacion.
                      </p>
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
            singularLabel="factura"
            pluralLabel="facturas"
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={clients}
        clientsLoading={clientsQuery.isLoading}
        products={products}
        productsLoading={productsQuery.isLoading}
        warehouses={warehousesQuery.data ?? []}
        isSubmitting={createMutation.isPending}
        onSubmit={handleCreateInvoice}
      />

      <UpdateConsecutiveDialog
        open={Boolean(editInvoice)}
        onOpenChange={(open) => !open && setEditInvoice(null)}
        invoice={editInvoice}
        isSubmitting={updateMutation.isPending}
        onSubmit={handleUpdateConsecutive}
      />

      <ModuleDetailsDrawer
        open={Boolean(selectedDetailInvoice)}
        onOpenChange={(open) => {
          if (open) return
          setDetailInvoice(null)
          setSearchParams(
            (params) => {
              params.delete('invoiceId')
              return params
            },
            { replace: true },
          )
        }}
        title={selectedDetailInvoice?.consecutive ?? ''}
        description={selectedDetailInvoice ? `${selectedDetailInvoice.client.firstName} ${selectedDetailInvoice.client.lastName}` : ''}
        badge={
          selectedDetailInvoice
            ? {
                label: formatInvoiceStatus(selectedDetailInvoice.status),
                variant: selectedDetailInvoice.status === 'ACTIVA' ? 'default' : 'secondary',
              }
            : null
        }
      >
        {selectedDetailInvoice ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => handleInvoicePdfView(selectedDetailInvoice)}>
                <Eye className="mr-2 size-4" />
                Ver PDF
              </Button>
              <Button type="button" onClick={() => handleInvoicePdfDownload(selectedDetailInvoice)}>
                <FileDown className="mr-2 size-4" />
                Descargar PDF
              </Button>
              {selectedDetailInvoice.validationStatus === 'PENDIENTE' ? (
                <Button type="button" variant="outline" onClick={() => handleValidateInvoice(selectedDetailInvoice)}>
                  Validar factura
                </Button>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Resumen</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {`${selectedDetailInvoice.client.firstName} ${selectedDetailInvoice.client.lastName}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatDate(selectedDetailInvoice.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Origen</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatInvoiceSource(selectedDetailInvoice.source)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Realizada por</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{getInvoiceActorLabel(selectedDetailInvoice)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Subtotal</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(selectedDetailInvoice.subtotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Impuestos</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(selectedDetailInvoice.taxes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Descuento de red</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(selectedDetailInvoice.referralDiscount ?? 0)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary uppercase">Items facturados</p>
              <div className="grid gap-3">
                {selectedDetailInvoice.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-2xl border border-border/70 bg-muted/10 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                  >
                    <ProductImage
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="size-16 rounded-xl"
                      iconClassName="size-5"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.product.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.product.brand} · {item.productPrice?.name ?? 'Precio default'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Cantidad {formatNumber(item.quantity)}</span>
                        <span>Unitario {formatCurrency(item.unitPrice)}</span>
                        <span>IVA {formatNumber(item.taxRate)}%</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(item.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </ModuleDetailsDrawer>

      <AlertDialog open={Boolean(cancelInvoice)} onOpenChange={(open) => !open && setCancelInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular factura</AlertDialogTitle>
            <AlertDialogDescription>La factura pasara a estado ANULADA y se conservara para trazabilidad comercial.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelInvoice}>Confirmar anulacion</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
