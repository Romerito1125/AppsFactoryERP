import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { History, Plus, Search, Star, Tag as TagIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProductImage } from '@/components/product-image'
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
import { NativeSelect } from '@/components/ui/native-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatNumber, matchesSearch } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = 20

const priceSchemaBase = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  price: z.number({ message: 'Precio obligatorio' }).positive('Debe ser mayor a cero'),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
})

const createPriceSchema = z
  .object({
    productId: z.number({ message: 'Selecciona un producto' }).int().positive('Selecciona un producto'),
    ...priceSchemaBase.shape,
  })
  .refine(
    (values) => !values.startsAt || !values.endsAt || new Date(values.endsAt) > new Date(values.startsAt),
    { path: ['endsAt'], message: 'La fecha final debe ser mayor a la inicial' },
  )

const updatePriceSchema = priceSchemaBase
  .extend({ reason: z.string().optional() })
  .refine(
    (values) => !values.startsAt || !values.endsAt || new Date(values.endsAt) > new Date(values.startsAt),
    { path: ['endsAt'], message: 'La fecha final debe ser mayor a la inicial' },
  )

function ProductPricesSkeleton() {
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

function ProductPriceProductSelector({ products, value, onChange, isLoading }) {
  const [query, setQuery] = useState('')
  const selectedProduct = products.find((product) => product.id === value)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredProducts = normalizedQuery
    ? products.filter((product) =>
        [
          product.name,
          product.brand,
          product.productType?.name,
          product.barcodes?.map((barcode) => barcode.code).join(' '),
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(normalizedQuery)),
      )
    : products

  return (
    <div className="grid gap-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre, marca, tipo o codigo..."
        disabled={isLoading}
      />

      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-sm">
        <p className="font-medium text-foreground">{selectedProduct?.name ?? 'Sin producto seleccionado'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {selectedProduct
            ? `${selectedProduct.brand ?? 'Sin marca'} · ${selectedProduct.productType?.name ?? 'Sin tipo'}`
            : isLoading
              ? 'Cargando catalogo de productos...'
              : 'Busca y luego haz clic en un producto para seleccionarlo.'}
        </p>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl border border-border/70 p-2">
        <div className="grid gap-2">
          {isLoading ? (
            <div className="grid gap-2 p-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : filteredProducts.length ? (
            filteredProducts.map((product) => {
              const isSelected = product.id === value
              const primaryBarcode = product.barcodes?.find((barcode) => barcode.isPrimary) ?? product.barcodes?.[0]

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onChange(product.id)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/70 bg-background hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <ProductImage src={product.imageUrl} alt={product.name} className="size-12 rounded-lg shrink-0" iconClassName="size-4" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {product.brand ?? 'Sin marca'} · {product.productType?.name ?? 'Sin tipo'}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {primaryBarcode?.code ?? 'Sin codigo principal'}
                    </p>
                  </div>
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
}

function PriceFormDialog({ open, onOpenChange, mode, price, products, productsLoading, onSubmit, isSubmitting }) {
  const schema = mode === 'create' ? createPriceSchema : updatePriceSchema
  const formDefaults = useMemo(
    () =>
      mode === 'create'
        ? {
            productId: undefined,
            name: '',
            price: undefined,
            isDefault: false,
            isActive: true,
            startsAt: '',
            endsAt: '',
          }
        : {
            name: price?.name ?? '',
            price: price?.price ? Number(price.price) : undefined,
            isDefault: price?.isDefault ?? false,
            isActive: price?.isActive ?? true,
            startsAt: price?.startsAt ? String(price.startsAt).slice(0, 10) : '',
            endsAt: price?.endsAt ? String(price.endsAt).slice(0, 10) : '',
            reason: '',
          },
    [mode, price],
  )

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: formDefaults,
  })

  useEffect(() => {
    form.reset(formDefaults)
  }, [form, formDefaults])

  const title = mode === 'create' ? 'Nuevo precio' : 'Actualizar precio'
  const description =
    mode === 'create'
      ? 'Crea un precio adicional y opcionalmente dejalo como default.'
      : 'Actualiza precio, vigencia o estado del registro seleccionado.'

  function closeDialog(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      form.reset(formDefaults)
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) => {
            const payload = {
              ...values,
              startsAt: values.startsAt || null,
              endsAt: values.endsAt || null,
              reason: 'reason' in values ? values.reason?.trim() || undefined : undefined,
            }
            onSubmit(payload)
          })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {mode === 'create' ? (
              <div className="grid gap-2 md:col-span-2">
                <Label>Producto</Label>
                <Controller
                  name="productId"
                  control={form.control}
                  render={({ field }) => (
                    <ProductPriceProductSelector
                      products={products}
                      value={field.value}
                      onChange={field.onChange}
                      isLoading={productsLoading}
                    />
                  )}
                />
                {form.formState.errors.productId ? (
                  <p className="text-xs text-destructive">{String(form.formState.errors.productId.message)}</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Nombre del precio</Label>
              <Input {...form.register('name')} placeholder="Precio mayorista" />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.name.message)}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>Valor</Label>
              <Input type="number" min="1" {...form.register('price', { setValueAs: (value) => Number(value) })} />
              {form.formState.errors.price ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.price.message)}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>Fecha inicio opcional</Label>
              <Input type="date" {...form.register('startsAt')} />
            </div>

            <div className="grid gap-2">
              <Label>Fecha fin opcional</Label>
              <Input type="date" {...form.register('endsAt')} />
              {form.formState.errors.endsAt ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.endsAt.message)}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">Puedes dejar ambas fechas vacias si el precio no tiene vigencia limitada.</p>
            </div>

            <div className="grid gap-2">
              <Label>Default</Label>
              <Controller
                name="isDefault"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={String(Boolean(field.value))}
                    onValueChange={(value) => field.onChange(value === 'true')}
                  >
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

            <div className="grid gap-2">
              <Label>Activo</Label>
              <Controller
                name="isActive"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={String(Boolean(field.value))}
                    onValueChange={(value) => field.onChange(value === 'true')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Si</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {mode === 'edit' ? (
              <div className="grid gap-2 md:col-span-2">
                <Label>Motivo del cambio</Label>
                <Input {...form.register('reason')} placeholder="Motivo del ajuste de precio" />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeDialog(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Crear precio' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProductPricesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [statusTab, setStatusTab] = useState('ACTIVOS')
  const [createOpen, setCreateOpen] = useState(false)
  const [editPrice, setEditPrice] = useState(null)
  const [detailPrice, setDetailPrice] = useState(null)
  const [historyPrice, setHistoryPrice] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const pricesQuery = useQuery({
    queryKey: ['precios-producto', statusTab, deferredSearch, currentPage],
    queryFn: () =>
      apiClient.get('/precios-producto', {
        estado: statusTab,
        q: deferredSearch,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })

  const productsQuery = useQuery({
    queryKey: ['precios-producto-productos'],
    queryFn: () => apiClient.getAllPages('/productos'),
    enabled: createOpen || Boolean(editPrice),
  })

  const historyQuery = useQuery({
    queryKey: ['precios-producto-historial', historyPrice?.id],
    queryFn: () => apiClient.get(`/precios-producto/${historyPrice.id}/historial`),
    enabled: Boolean(historyPrice),
  })

  const createMutation = useMutation({
    mutationFn: ({ productId, ...payload }) => apiClient.post(`/productos/${productId}/precios`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precios-producto'] })
      queryClient.invalidateQueries({ queryKey: ['productos'] })
      queryClient.invalidateQueries({ queryKey: ['facturas-productos'] })
      setCreateOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/precios-producto/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precios-producto'] })
      queryClient.invalidateQueries({ queryKey: ['productos'] })
      queryClient.invalidateQueries({ queryKey: ['facturas-productos'] })
      if (historyPrice) {
        queryClient.invalidateQueries({ queryKey: ['precios-producto-historial', historyPrice.id] })
      }
      setEditPrice(null)
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => apiClient.delete(`/precios-producto/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precios-producto'] })
      queryClient.invalidateQueries({ queryKey: ['productos'] })
      queryClient.invalidateQueries({ queryKey: ['facturas-productos'] })
    },
  })

  const defaultMutation = useMutation({
    mutationFn: (id) => apiClient.patch(`/precios-producto/${id}/default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precios-producto'] })
      queryClient.invalidateQueries({ queryKey: ['productos'] })
      queryClient.invalidateQueries({ queryKey: ['facturas-productos'] })
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (id) => apiClient.patch(`/precios-producto/${id}`, { isActive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precios-producto'] })
      queryClient.invalidateQueries({ queryKey: ['productos'] })
      queryClient.invalidateQueries({ queryKey: ['facturas-productos'] })
    },
  })

  const prices = pricesQuery.data?.data ?? []
  const totalItems = Number(pricesQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(pricesQuery.data?.totalPages ?? 1))
  const products = productsQuery.data ?? []
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + prices.length - 1, totalItems)

  const summaryCards = [
    {
      label: 'Precios registrados',
      value: formatNumber(totalItems),
      help: 'Total de precios disponibles en la base actual.',
      icon: TagIcon,
    },
    {
      label: 'Precios activos',
      value: formatNumber(prices.filter((price) => price.isActive).length),
      help: 'Precios disponibles para uso operativo.',
      icon: Star,
    },
    {
      label: 'Precios default',
      value: formatNumber(prices.filter((price) => price.isDefault).length),
      help: 'Precio principal por producto para facturacion.',
      icon: TagIcon,
    },
    {
      label: 'Productos con multiples precios',
      value: formatNumber(
          Array.from(
            prices.reduce((groups, price) => {
              groups.set(price.productId, (groups.get(price.productId) ?? 0) + 1)
              return groups
            }, new Map()),
        ).filter(([, count]) => count > 1).length,
      ),
      help: 'Productos con al menos un precio operativo registrado.',
      icon: History,
    },
  ]

  async function handleCreatePrice(payload) {
    await toast.promise(createMutation.mutateAsync(payload), {
      loading: 'Creando precio...',
      success: 'Precio creado correctamente',
      error: (error) => error.message,
    })
  }

  async function handleUpdatePrice(payload) {
    if (!editPrice) return

    await toast.promise(updateMutation.mutateAsync({ id: editPrice.id, payload }), {
      loading: 'Actualizando precio...',
      success: 'Precio actualizado correctamente',
      error: (error) => error.message,
    })
  }

  async function handleDeactivatePrice(price) {
    await toast.promise(deactivateMutation.mutateAsync(price.id), {
      loading: 'Desactivando precio...',
      success: 'Precio desactivado',
      error: (error) => error.message,
    })
  }

  async function handleMarkDefault(price) {
    await toast.promise(defaultMutation.mutateAsync(price.id), {
      loading: 'Marcando precio default...',
      success: 'Precio default actualizado',
      error: (error) => error.message,
    })
  }

  async function handleReactivatePrice(price) {
    await toast.promise(reactivateMutation.mutateAsync(price.id), {
      loading: 'Reactivando precio...',
      success: 'Precio reactivado',
      error: (error) => error.message,
    })
  }

  if (pricesQuery.isLoading) {
    return <ProductPricesSkeleton />
  }

  if (pricesQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {pricesQuery.error.message}
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Precios · Historial
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Precios de producto
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Administra multiples precios por producto, su vigencia, el precio default y el historial de cambios comerciales.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nuevo precio
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

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Catalogo de precios</CardTitle>
            <CardDescription>Consulta, edicion, desactivacion y cambio de default.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 md:flex-row lg:w-auto">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                   setSearch(event.target.value)
                   setCurrentPage(1)
                }}
                placeholder="Buscar por producto o nombre del precio..."
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
                <TabsTrigger value="ACTIVOS">Activos</TabsTrigger>
                <TabsTrigger value="INACTIVOS">Inactivos</TabsTrigger>
                <TabsTrigger value="DEFAULT">Default</TabsTrigger>
                <TabsTrigger value="TODOS">Todos</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
               {prices.length ? (
                 prices.map((price) => (
                  <TableRow key={price.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{price.product?.name ?? `Producto #${price.productId}`}</p>
                        <p className="text-xs text-muted-foreground">{price.product?.brand ?? 'Sin marca'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{price.name}</span>
                        {price.isDefault ? <Badge variant="outline">Default</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(price.price)}</TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        <p>Inicio: {price.startsAt ? formatDate(price.startsAt) : 'Sin fecha'}</p>
                        <p>Fin: {price.endsAt ? formatDate(price.endsAt) : 'Sin fecha'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={price.isActive ? 'default' : 'secondary'}>
                        {price.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Acciones
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setDetailPrice(price)}>
                            Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHistoryPrice(price)}>
                            Ver historial
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditPrice(price)}>
                            Editar precio
                          </DropdownMenuItem>
                          {!price.isDefault ? (
                            <DropdownMenuItem onClick={() => handleMarkDefault(price)}>
                              Marcar como default
                            </DropdownMenuItem>
                          ) : null}
                          {price.isActive ? (
                            <DropdownMenuItem
                              onClick={() => handleDeactivatePrice(price)}
                              className="text-destructive focus:text-destructive"
                            >
                              Desactivar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleReactivatePrice(price)}>
                              Reactivar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No hay precios para el filtro actual.
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
            singularLabel="precio"
            pluralLabel="precios"
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <PriceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        products={products}
        productsLoading={productsQuery.isLoading}
        onSubmit={handleCreatePrice}
        isSubmitting={createMutation.isPending}
      />

      <PriceFormDialog
        open={Boolean(editPrice)}
        onOpenChange={(open) => !open && setEditPrice(null)}
        mode="edit"
        price={editPrice}
        products={products}
        productsLoading={productsQuery.isLoading}
        onSubmit={handleUpdatePrice}
        isSubmitting={updateMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailPrice)}
        onOpenChange={(open) => !open && setDetailPrice(null)}
        title={detailPrice?.name ?? ''}
        description={detailPrice ? detailPrice.product?.name ?? `Producto #${detailPrice.productId}` : ''}
        badge={
          detailPrice
            ? {
                label: detailPrice.isActive ? 'Activo' : 'Inactivo',
                variant: detailPrice.isActive ? 'default' : 'secondary',
              }
            : null
        }
        fields={
          detailPrice
            ? [
                {
                  label: 'Precio',
                  items: [
                    { label: 'Producto', value: detailPrice.product?.name ?? `Producto #${detailPrice.productId}` },
                    { label: 'Valor', value: formatCurrency(detailPrice.price) },
                    { label: 'Default', value: detailPrice.isDefault ? 'Si' : 'No' },
                    { label: 'Estado', value: detailPrice.isActive ? 'Activo' : 'Inactivo' },
                  ],
                },
                {
                  label: 'Vigencia',
                  items: [
                    { label: 'Inicio', value: detailPrice.startsAt ? formatDate(detailPrice.startsAt) : 'Sin fecha' },
                    { label: 'Fin', value: detailPrice.endsAt ? formatDate(detailPrice.endsAt) : 'Sin fecha' },
                    { label: 'Creado', value: formatDate(detailPrice.createdAt) },
                    { label: 'Actualizado', value: formatDate(detailPrice.updatedAt) },
                  ],
                },
              ]
            : []
        }
      />

      <ModuleDetailsDrawer
        open={Boolean(historyPrice)}
        onOpenChange={(open) => !open && setHistoryPrice(null)}
        title={historyPrice ? `Historial · ${historyPrice.name}` : ''}
        description={historyPrice?.product?.name ?? ''}
      >
        <div className="grid gap-4">
          {historyQuery.isLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : historyQuery.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anterior</TableHead>
                  <TableHead>Nuevo</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyQuery.data.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatCurrency(entry.oldPrice)}</TableCell>
                    <TableCell>{formatCurrency(entry.newPrice)}</TableCell>
                    <TableCell>{entry.reason ?? 'Sin motivo'}</TableCell>
                    <TableCell>{formatDate(entry.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              Este precio no tiene cambios historicos registrados.
            </div>
          )}
        </div>
      </ModuleDetailsDrawer>
    </div>
  )
}
