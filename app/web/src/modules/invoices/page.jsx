import { useDeferredValue, useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { FilePlus2, MoreHorizontal, Plus, Search, Star, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { ProductImage } from '@/components/product-image'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import {
  formatCurrency,
  formatDate,
  formatInvoiceSource,
  formatInvoiceStatus,
  formatNumber,
  formatRole,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = 20

const invoiceSchema = z.object({
  clientId: z.number({ message: 'Selecciona un cliente' }).int().positive('Selecciona un cliente'),
  items: z
    .array(
      z.object({
        productId: z.number({ message: 'Selecciona un producto' }).int().positive('Selecciona un producto'),
        productPriceId: z.number().int().positive('Selecciona un precio valido').optional(),
        quantity: z.number({ message: 'Cantidad obligatoria' }).int().positive('Minimo 1 unidad'),
      }),
    )
    .min(1, 'Agrega al menos un producto'),
})

const consecutiveSchema = z.object({
  consecutive: z.string().min(4, 'Minimo 4 caracteres'),
})

const FAVORITE_PRODUCTS_STORAGE_KEY = 'facturas-favorite-products'

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
    return [invoice.createdByRole ? formatRole(invoice.createdByRole) : null, invoice.createdByUsername]
      .filter(Boolean)
      .join(' · ')
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

function CreateInvoiceDialog({ open, onOpenChange, clients, products, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      clientId: undefined,
      items: [{ productId: undefined, productPriceId: undefined, quantity: 1 }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  const watchedItems = useWatch({ control: form.control, name: 'items' })

  const [catalogSearch, setCatalogSearch] = useState('')
  const deferredCatalogSearch = useDeferredValue(catalogSearch)
  const [favoriteProductIds, setFavoriteProductIds] = useState([])
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [catalogTargetIndex, setCatalogTargetIndex] = useState(null)

  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem(FAVORITE_PRODUCTS_STORAGE_KEY)
      if (!savedFavorites) {
        return
      }

      const parsedFavorites = JSON.parse(savedFavorites)
      if (Array.isArray(parsedFavorites)) {
        setFavoriteProductIds(parsedFavorites.filter((value) => Number.isInteger(value)))
      }
    } catch {
      setFavoriteProductIds([])
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITE_PRODUCTS_STORAGE_KEY, JSON.stringify(favoriteProductIds))
    } catch {
      return
    }
  }, [favoriteProductIds])

  const catalogProducts = products
    .filter((product) => product.isActive !== false && getActiveProductPrices(product).length)
    .filter((product) => {
      if (favoritesOnly && !favoriteProductIds.includes(product.id)) {
        return false
      }

      if (!deferredCatalogSearch) {
        return true
      }

      return getProductSearchText(product).toLowerCase().includes(deferredCatalogSearch.toLowerCase())
    })
    .sort((left, right) => {
      const leftFavoriteWeight = favoriteProductIds.includes(left.id) ? 1 : 0
      const rightFavoriteWeight = favoriteProductIds.includes(right.id) ? 1 : 0

      if (leftFavoriteWeight !== rightFavoriteWeight) {
        return rightFavoriteWeight - leftFavoriteWeight
      }

      return left.name.localeCompare(right.name)
    })

  function resetDialog() {
    form.reset({
      clientId: undefined,
      items: [{ productId: undefined, productPriceId: undefined, quantity: 1 }],
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

  function toggleFavoriteProduct(productId) {
    setFavoriteProductIds((current) =>
      current.includes(productId)
        ? current.filter((value) => value !== productId)
        : [...current, productId],
    )
  }

  function applyProductToItem(index, product) {
    const defaultPrice = getDefaultActivePrice(product)

    form.setValue(`items.${index}.productId`, product.id, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(`items.${index}.productPriceId`, defaultPrice?.id, {
      shouldDirty: true,
      shouldValidate: true,
    })

    if (!form.getValues(`items.${index}.quantity`)) {
      form.setValue(`items.${index}.quantity`, 1, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }

  function handleCatalogSelection(product) {
    if (catalogTargetIndex !== null && watchedItems[catalogTargetIndex]) {
      applyProductToItem(catalogTargetIndex, product)
      setCatalogTargetIndex(null)
      return
    }

    const firstEmptyIndex = form.getValues('items').findIndex((item) => !item.productId)

    if (firstEmptyIndex >= 0) {
      applyProductToItem(firstEmptyIndex, product)
      return
    }

    const defaultPrice = getDefaultActivePrice(product)
    append({
      productId: product.id,
      productPriceId: defaultPrice?.id,
      quantity: 1,
    })
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Nueva factura</DialogTitle>
          <DialogDescription>
            Crea la venta con un catalogo visual para seleccionar productos por imagen y favoritos.
          </DialogDescription>
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
                      <Select
                        value={field.value ? String(field.value) : undefined}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={String(client.id)}>
                              {`${client.firstName} ${client.lastName} · ${client.identification}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.clientId ? (
                    <p className="text-xs text-destructive">
                      {String(form.formState.errors.clientId.message)}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                    Recomendaciones
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <li>Selecciona productos por imagen para reducir errores de despacho.</li>
                    <li>Marca favoritos para ventas recurrentes.</li>
                    <li>La factura usara el precio activo seleccionado o el default del producto.</li>
                  </ul>
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
                      append({ productId: undefined, productPriceId: undefined, quantity: 1 })
                      setCatalogTargetIndex(nextIndex)
                    }}
                  >
                    <Plus className="mr-2 size-4" />
                    Agregar linea
                  </Button>
                </div>

                <div className="grid gap-3">
                  {fields.map((itemField, index) => {
                    const selectedProduct = products.find((product) => product.id === watchedItems[index]?.productId)
                    const activePrices = getActiveProductPrices(selectedProduct)
                    const selectedProductPrice =
                      activePrices.find((price) => price.id === watchedItems[index]?.productPriceId) ??
                      getDefaultActivePrice(selectedProduct)
                    const totalStock = getProductTotalStock(selectedProduct)

                    return (
                      <div
                        key={itemField.id}
                        className={cn(
                          'grid gap-3 rounded-2xl border border-border/70 bg-card p-4 md:grid-cols-[1.1fr_1fr_0.45fr_0.8fr_auto] md:items-end',
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
                                <p className="truncate text-sm font-medium text-foreground">
                                  {selectedProduct.name}
                                </p>
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
                              <p className="mt-1 text-xs text-muted-foreground">
                                Usa el panel visual para escoger por imagen.
                              </p>
                            </button>
                          )}
                          {form.formState.errors.items?.[index]?.productId ? (
                            <p className="text-xs text-destructive">
                              {String(form.formState.errors.items[index].productId.message)}
                            </p>
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
                            <p className="text-xs text-destructive">
                              {String(form.formState.errors.items[index].productPriceId.message)}
                            </p>
                          ) : null}
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
                            <p className="text-xs text-destructive">
                              {String(form.formState.errors.items[index].quantity.message)}
                            </p>
                          ) : null}
                        </div>

                        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                          <p className="text-xs text-muted-foreground">Vista previa</p>
                          <p className="mt-1 font-medium">
                            {selectedProductPrice
                              ? formatCurrency(
                                  Number(selectedProductPrice.price ?? 0) * Number(watchedItems[index]?.quantity ?? 0),
                                )
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
                <CardDescription>
                  Selecciona productos por imagen y guarda favoritos para facturar mas rapido.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex gap-2">
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
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  <span>
                    {catalogTargetIndex !== null
                      ? `Cambiando producto de la linea ${catalogTargetIndex + 1}`
                      : 'Al seleccionar, se agrega a la siguiente linea disponible'}
                  </span>
                  <span>{formatNumber(catalogProducts.length)} productos</span>
                </div>

                <ScrollArea className="h-[440px] pr-4">
                  {catalogProducts.length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {catalogProducts.map((product) => {
                        const defaultPrice = getDefaultActivePrice(product)
                        const isFavorite = favoriteProductIds.includes(product.id)

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

                            <button
                              type="button"
                              onClick={() => handleCatalogSelection(product)}
                              className="grid w-full gap-3 text-left"
                            >
                              <ProductImage
                                src={product.imageUrl}
                                alt={product.name}
                                className="aspect-[4/3] w-full rounded-xl"
                                iconClassName="size-6"
                              />
                              <div className="pr-8">
                                <p className="line-clamp-1 text-sm font-medium text-foreground">
                                  {product.name}
                                </p>
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
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-center">
                      <p className="font-medium text-foreground">No hay productos para este filtro</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Ajusta la busqueda o desactiva el filtro de favoritos.
                      </p>
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
          <DialogDescription>
            Actualiza el consecutivo manteniendo intacto el detalle comercial de la factura.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) => onSubmit(values))}
        >
          <div className="grid gap-2">
            <Label htmlFor="consecutive">Consecutivo</Label>
            <Input id="consecutive" {...form.register('consecutive')} />
            {form.formState.errors.consecutive ? (
              <p className="text-xs text-destructive">
                {String(form.formState.errors.consecutive.message)}
              </p>
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
  const [createOpen, setCreateOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [editInvoice, setEditInvoice] = useState(null)
  const [cancelInvoice, setCancelInvoice] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const [searchParams, setSearchParams] = useSearchParams()
  const invoiceIdParam = searchParams.get('invoiceId')

  const invoicesQuery = useQuery({
    queryKey: ['facturas', statusTab, search, currentPage],
    queryFn: () =>
      apiClient.get('/facturas', {
        status: statusTab === 'TODAS' ? undefined : statusTab,
        q: search,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })
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

  if (invoicesQuery.isLoading || (createOpen && (clientsQuery.isLoading || productsQuery.isLoading))) {
    return <InvoiceSkeleton />
  }

  if (invoicesQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {invoicesQuery.error.message}
      </div>
    )
  }

  const invoices = invoicesQuery.data?.data ?? []

  useEffect(() => {
    if (invoiceIdParam && invoices.length) {
      const targetInvoice = invoices.find((inv) => inv.id === Number(invoiceIdParam))
      if (targetInvoice) {
        setDetailInvoice(targetInvoice)
        setSearchParams((params) => {
          params.delete('invoiceId')
          return params
        }, { replace: true })
      }
    }
  }, [invoiceIdParam, invoices, setSearchParams])

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
        activeInvoices.reduce(
          (sum, invoice) => sum + invoice.items.reduce((itemSum, item) => itemSum + Number(item.quantity ?? 0), 0),
          0,
        ),
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

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Facturacion · Trazabilidad
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Facturas
          </h2>
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
                      <Badge variant={invoice.status === 'ACTIVA' ? 'default' : 'secondary'}>
                        {formatInvoiceStatus(invoice.status)}
                      </Badge>
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
                          <DropdownMenuItem onClick={() => setDetailInvoice(invoice)}>
                            Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditInvoice(invoice)}>
                            Editar consecutivo
                          </DropdownMenuItem>
                          {invoice.status === 'ACTIVA' ? (
                            <DropdownMenuItem
                              onClick={() => setCancelInvoice(invoice)}
                              className="text-destructive focus:text-destructive"
                            >
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
        products={products}
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
        open={Boolean(detailInvoice)}
        onOpenChange={(open) => !open && setDetailInvoice(null)}
        title={detailInvoice?.consecutive ?? ''}
        description={
          detailInvoice
            ? `${detailInvoice.client.firstName} ${detailInvoice.client.lastName}`
            : ''
        }
        badge={
          detailInvoice
            ? {
                label: formatInvoiceStatus(detailInvoice.status),
                variant: detailInvoice.status === 'ACTIVA' ? 'default' : 'secondary',
              }
            : null
        }
      >
        {detailInvoice ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                Resumen
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {`${detailInvoice.client.firstName} ${detailInvoice.client.lastName}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatDate(detailInvoice.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Origen</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatInvoiceSource(detailInvoice.source)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Realizada por</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {getInvoiceActorLabel(detailInvoice)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Subtotal</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatCurrency(detailInvoice.subtotal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Impuestos</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatCurrency(detailInvoice.taxes)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                Items facturados
              </p>
              <div className="grid gap-3">
                {detailInvoice.items.map((item) => (
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
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.product.name}
                      </p>
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
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(item.total)}
                      </p>
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
            <AlertDialogDescription>
              La factura pasara a estado ANULADA y se conservara para trazabilidad comercial.
            </AlertDialogDescription>
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
