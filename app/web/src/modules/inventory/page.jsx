import { useDeferredValue, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowRightLeft, Boxes, ClipboardList, PackagePlus, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { apiClient } from '@/lib/api-client'
import { formatDate, formatNumber, matchesSearch } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { LocalPagination, useLocalPagination } from '@/modules/shared/local-pagination'

const movementTypeOptions = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'salida', label: 'Salida' },
  { value: 'traslado', label: 'Traslado' },
  { value: 'ajuste', label: 'Ajuste' },
]

const stockFilterOptions = [
  { value: 'TODOS', label: 'Todo el stock' },
  { value: 'CON_STOCK', label: 'Con stock' },
  { value: 'SIN_STOCK', label: 'Sin stock' },
  { value: 'BAJO_MINIMO', label: 'Bajo minimo' },
  { value: 'EN_RANGO', label: 'En rango' },
  { value: 'SOBRE_MAXIMO', label: 'Sobre maximo' },
]

const movementTypeLabels = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  TRASLADO: 'Traslado',
  AJUSTE: 'Ajuste',
}

const movementBadgeVariants = {
  ENTRADA: 'default',
  SALIDA: 'secondary',
  TRASLADO: 'outline',
  AJUSTE: 'destructive',
}

const movementFormSchema = z
  .object({
    type: z.enum(['entrada', 'salida', 'traslado', 'ajuste']),
    productId: z.number({ message: 'Selecciona un producto' }).int().positive('Selecciona un producto'),
    quantity: z.number({ message: 'Cantidad obligatoria' }).int().positive('Debe ser mayor a cero'),
    fromWarehouseId: z.number().int().positive().optional(),
    toWarehouseId: z.number().int().positive().optional(),
    warehouseId: z.number().int().positive().optional(),
    reason: z.string().optional(),
  })
  .superRefine((values, context) => {
    if (values.type === 'entrada' && !values.toWarehouseId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['toWarehouseId'], message: 'Selecciona la bodega destino' })
    }

    if (values.type === 'salida' && !values.fromWarehouseId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fromWarehouseId'], message: 'Selecciona la bodega origen' })
    }

    if (values.type === 'traslado') {
      if (!values.fromWarehouseId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fromWarehouseId'], message: 'Selecciona la bodega origen' })
      }

      if (!values.toWarehouseId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['toWarehouseId'], message: 'Selecciona la bodega destino' })
      }

      if (
        values.fromWarehouseId &&
        values.toWarehouseId &&
        values.fromWarehouseId === values.toWarehouseId
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['toWarehouseId'], message: 'Origen y destino no pueden ser iguales' })
      }
    }

    if (values.type === 'ajuste') {
      if (!values.warehouseId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['warehouseId'], message: 'Selecciona la bodega' })
      }

      if (!values.reason || values.reason.trim().length < 3) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'El motivo debe tener minimo 3 caracteres' })
      }
    }
  })

function InventorySkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[540px] rounded-2xl" />
    </div>
  )
}

function formatMovementType(value) {
  return movementTypeLabels[value] ?? value ?? 'Movimiento'
}

function getMovementBadgeVariant(value) {
  return movementBadgeVariants[value] ?? 'outline'
}

function getTotalStock(product) {
  return (product.warehouses ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
}

function getStockSignal(product) {
  const totalStock = getTotalStock(product)
  const minimumStock = Number(product.minimumStock ?? 0)
  const maximumStock = product.maximumStock === null ? null : Number(product.maximumStock ?? 0)

  if (totalStock <= minimumStock) {
    return { label: 'Bajo minimo', variant: 'destructive' }
  }

  if (maximumStock !== null && totalStock >= maximumStock) {
    return { label: 'En maximo', variant: 'secondary' }
  }

  return { label: 'Operativo', variant: 'default' }
}

function matchesStockFilter(product, stockFilter) {
  const totalStock = getTotalStock(product)
  const minimumStock = Number(product.minimumStock ?? 0)
  const maximumStock =
    product.maximumStock === null || product.maximumStock === undefined
      ? null
      : Number(product.maximumStock)

  if (stockFilter === 'CON_STOCK') {
    return totalStock > 0
  }

  if (stockFilter === 'SIN_STOCK') {
    return totalStock <= 0
  }

  if (stockFilter === 'BAJO_MINIMO') {
    return totalStock <= minimumStock
  }

  if (stockFilter === 'EN_RANGO') {
    return totalStock > minimumStock && (maximumStock === null || totalStock < maximumStock)
  }

  if (stockFilter === 'SOBRE_MAXIMO') {
    return maximumStock !== null && totalStock >= maximumStock
  }

  return true
}

function buildMovementPayload(values) {
  if (values.type === 'entrada') {
    return {
      path: '/inventario/entrada',
      payload: {
        productId: values.productId,
        toWarehouseId: values.toWarehouseId,
        quantity: values.quantity,
        reason: values.reason?.trim() || undefined,
      },
    }
  }

  if (values.type === 'salida') {
    return {
      path: '/inventario/salida',
      payload: {
        productId: values.productId,
        fromWarehouseId: values.fromWarehouseId,
        quantity: values.quantity,
        reason: values.reason?.trim() || undefined,
      },
    }
  }

  if (values.type === 'traslado') {
    return {
      path: '/inventario/traslado',
      payload: {
        productId: values.productId,
        fromWarehouseId: values.fromWarehouseId,
        toWarehouseId: values.toWarehouseId,
        quantity: values.quantity,
        reason: values.reason?.trim() || undefined,
      },
    }
  }

  return {
    path: '/inventario/ajuste',
    payload: {
      productId: values.productId,
      warehouseId: values.warehouseId,
      quantity: values.quantity,
      reason: values.reason?.trim(),
    },
  }
}

function InventoryMovementDialog({ open, onOpenChange, products, warehouses, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(movementFormSchema),
    defaultValues: {
      type: 'entrada',
      productId: undefined,
      quantity: 1,
      fromWarehouseId: undefined,
      toWarehouseId: undefined,
      warehouseId: undefined,
      reason: '',
    },
  })

  const movementType = form.watch('type')

  function closeDialog(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      form.reset({
        type: 'entrada',
        productId: undefined,
        quantity: 1,
        fromWarehouseId: undefined,
        toWarehouseId: undefined,
        warehouseId: undefined,
        reason: '',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento de inventario</DialogTitle>
          <DialogDescription>
            Registra entradas, salidas, traslados o ajustes usando el flujo real del backend.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-3">
            <Label>Tipo de movimiento</Label>
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Tabs value={field.value} onValueChange={field.onChange}>
                  <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
                    {movementTypeOptions.map((option) => (
                      <TabsTrigger key={option.value} value={option.value}>
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label>Producto</Label>
              <Controller
                name="productId"
                control={form.control}
                render={({ field }) => (
                  <NativeSelect
                    value={field.value ? String(field.value) : ''}
                    onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                  >
                    <option value="">Selecciona un producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={String(product.id)}>
                        {`${product.name} · stock ${getTotalStock(product)}`}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              />
              {form.formState.errors.productId ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.productId.message)}</p>
              ) : null}
            </div>

            {(movementType === 'salida' || movementType === 'traslado') && (
              <div className="grid gap-2">
                <Label>Bodega origen</Label>
                <Controller
                  name="fromWarehouseId"
                  control={form.control}
                  render={({ field }) => (
                    <NativeSelect
                      value={field.value ? String(field.value) : ''}
                      onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                    >
                      <option value="">Selecciona la bodega origen</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={String(warehouse.id)}>
                          {warehouse.location}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                />
                {form.formState.errors.fromWarehouseId ? (
                  <p className="text-xs text-destructive">{String(form.formState.errors.fromWarehouseId.message)}</p>
                ) : null}
              </div>
            )}

            {(movementType === 'entrada' || movementType === 'traslado') && (
              <div className="grid gap-2">
                <Label>Bodega destino</Label>
                <Controller
                  name="toWarehouseId"
                  control={form.control}
                  render={({ field }) => (
                    <NativeSelect
                      value={field.value ? String(field.value) : ''}
                      onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                    >
                      <option value="">Selecciona la bodega destino</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={String(warehouse.id)}>
                          {warehouse.location}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                />
                {form.formState.errors.toWarehouseId ? (
                  <p className="text-xs text-destructive">{String(form.formState.errors.toWarehouseId.message)}</p>
                ) : null}
              </div>
            )}

            {movementType === 'ajuste' && (
              <div className="grid gap-2 md:col-span-2">
                <Label>Bodega</Label>
                <Controller
                  name="warehouseId"
                  control={form.control}
                  render={({ field }) => (
                    <NativeSelect
                      value={field.value ? String(field.value) : ''}
                      onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                    >
                      <option value="">Selecciona la bodega</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={String(warehouse.id)}>
                          {warehouse.location}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                />
                {form.formState.errors.warehouseId ? (
                  <p className="text-xs text-destructive">{String(form.formState.errors.warehouseId.message)}</p>
                ) : null}
              </div>
            )}

            <div className="grid gap-2">
              <Label>{movementType === 'ajuste' ? 'Cantidad final' : 'Cantidad'}</Label>
              <Input
                type="number"
                min="1"
                {...form.register('quantity', { setValueAs: (value) => Number(value) })}
              />
              {form.formState.errors.quantity ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.quantity.message)}</p>
              ) : null}
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label>Motivo</Label>
              <Textarea
                rows={3}
                placeholder={movementType === 'ajuste' ? 'Motivo obligatorio del ajuste' : 'Motivo opcional del movimiento'}
                {...form.register('reason')}
              />
              {form.formState.errors.reason ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.reason.message)}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeDialog(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Registrar movimiento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function InventoryPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [view, setView] = useState('stock')
  const [stockFilters, setStockFilters] = useState({
    productTypeId: 'TODOS',
    providerId: 'TODOS',
    warehouseId: 'TODOS',
    stockStatus: 'TODOS',
  })
  const [movementFilters, setMovementFilters] = useState({
    movementType: 'TODOS',
    warehouseId: 'TODOS',
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [detailProduct, setDetailProduct] = useState(null)
  const [detailMovement, setDetailMovement] = useState(null)

  const inventoryQuery = useQuery({
    queryKey: ['inventario'],
    queryFn: () => apiClient.getAllPages('/inventario'),
  })

  const movementsQuery = useQuery({
    queryKey: ['inventario-movimientos'],
    queryFn: () => apiClient.getAllPages('/inventario/movimientos'),
  })

  const warehousesQuery = useQuery({
    queryKey: ['inventario-bodegas'],
    queryFn: () => apiClient.getAllPages('/bodegas'),
  })

  const movementMutation = useMutation({
    mutationFn: async (values) => {
      const { path, payload } = buildMovementPayload(values)
      return apiClient.post(path, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] })
      queryClient.invalidateQueries({ queryKey: ['inventario-movimientos'] })
      queryClient.invalidateQueries({ queryKey: ['productos'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      setCreateOpen(false)
    },
  })

  const inventory = inventoryQuery.data ?? []
  const movements = movementsQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []

  const filteredInventory = useMemo(
    () =>
      inventory.filter((product) =>
        matchesSearch(product, deferredSearch, (record) => [
          record.name,
          record.brand,
          record.productType?.name,
          record.provider?.name,
          ...(record.warehouses ?? []).map((item) => item.warehouse?.location),
        ]) &&
        (stockFilters.productTypeId === 'TODOS' || product.productType?.id === Number(stockFilters.productTypeId)) &&
        (stockFilters.providerId === 'TODOS' || product.provider?.id === Number(stockFilters.providerId)) &&
        (stockFilters.warehouseId === 'TODOS' ||
          (product.warehouses ?? []).some((item) => item.warehouseId === Number(stockFilters.warehouseId))) &&
        matchesStockFilter(product, stockFilters.stockStatus),
      ),
    [deferredSearch, inventory, stockFilters],
  )

  const filteredMovements = useMemo(
    () =>
      movements.filter((movement) =>
        matchesSearch(movement, deferredSearch, (record) => [
          record.product?.name,
          formatMovementType(record.movementType),
          record.fromWarehouse?.location,
          record.toWarehouse?.location,
          record.reason,
        ]) &&
        (movementFilters.movementType === 'TODOS' || movement.movementType === movementFilters.movementType) &&
        (movementFilters.warehouseId === 'TODOS' ||
          movement.fromWarehouse?.id === Number(movementFilters.warehouseId) ||
          movement.toWarehouse?.id === Number(movementFilters.warehouseId)),
      ),
    [deferredSearch, movementFilters, movements],
  )

  const activeRecords = view === 'stock' ? filteredInventory : filteredMovements
  const {
    currentPage,
    setCurrentPage,
    paginatedItems: paginatedRecords,
    totalItems,
    totalPages,
    startItem,
    endItem,
    resetPage,
  } = useLocalPagination(activeRecords)

  const summaryCards = [
    {
      label: 'Productos con stock',
      value: formatNumber(inventory.length),
      help: 'Productos activos visibles en el modulo de inventario.',
      icon: Boxes,
    },
    {
      label: 'Unidades consolidadas',
      value: formatNumber(inventory.reduce((sum, product) => sum + getTotalStock(product), 0)),
      help: 'Cantidad total sumando todas las bodegas activas.',
      icon: PackagePlus,
    },
    {
      label: 'Bodegas operativas',
      value: formatNumber(warehouses.length),
      help: 'Bodegas activas disponibles para movimientos.',
      icon: ClipboardList,
    },
    {
      label: 'Movimientos recientes',
      value: formatNumber(movements.length),
      help: 'Historial de entradas, salidas, traslados y ajustes.',
      icon: ArrowRightLeft,
    },
  ]

  async function handleCreateMovement(values) {
    await toast.promise(movementMutation.mutateAsync(values), {
      loading: 'Registrando movimiento...',
      success: 'Movimiento registrado correctamente',
      error: (error) => error.message,
    })
  }

  if (inventoryQuery.isLoading || movementsQuery.isLoading || warehousesQuery.isLoading) {
    return <InventorySkeleton />
  }

  if (inventoryQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {inventoryQuery.error.message}
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Inventario · Movimientos
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Inventario real
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Consulta existencias por producto y registra entradas, salidas, traslados o ajustes usando la API operativa actual.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <PackagePlus className="mr-2 size-4" />
          Nuevo movimiento
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
            <CardTitle>Operacion de inventario</CardTitle>
            <CardDescription>Existencias actuales y trazabilidad de movimientos.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 md:flex-row lg:w-auto">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPage()
                }}
                placeholder="Buscar por producto, bodega o movimiento..."
                className="pl-9"
              />
            </div>
            {view === 'stock' ? (
              <>
                <Select
                  value={stockFilters.productTypeId}
                  onValueChange={(value) => {
                    setStockFilters((current) => ({ ...current, productTypeId: value }))
                    resetPage()
                  }}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos los tipos</SelectItem>
                    {Array.from(new Map(inventory.map((item) => [item.productType?.id, item.productType])).values())
                      .filter(Boolean)
                      .map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Select
                  value={stockFilters.providerId}
                  onValueChange={(value) => {
                    setStockFilters((current) => ({ ...current, providerId: value }))
                    resetPage()
                  }}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos los proveedores</SelectItem>
                    {Array.from(new Map(inventory.map((item) => [item.provider?.id, item.provider])).values())
                      .filter(Boolean)
                      .map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Select
                  value={stockFilters.warehouseId}
                  onValueChange={(value) => {
                    setStockFilters((current) => ({ ...current, warehouseId: value }))
                    resetPage()
                  }}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Bodega" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todas las bodegas</SelectItem>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                        {warehouse.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={stockFilters.stockStatus}
                  onValueChange={(value) => {
                    setStockFilters((current) => ({ ...current, stockStatus: value }))
                    resetPage()
                  }}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Stock" />
                  </SelectTrigger>
                  <SelectContent>
                    {stockFilterOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <Select
                  value={movementFilters.movementType}
                  onValueChange={(value) => {
                    setMovementFilters((current) => ({ ...current, movementType: value }))
                    resetPage()
                  }}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Movimiento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos los movimientos</SelectItem>
                    {Object.entries(movementTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={movementFilters.warehouseId}
                  onValueChange={(value) => {
                    setMovementFilters((current) => ({ ...current, warehouseId: value }))
                    resetPage()
                  }}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Bodega" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todas las bodegas</SelectItem>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                        {warehouse.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <Tabs
              value={view}
              onValueChange={(value) => {
                setView(value)
                resetPage()
              }}
            >
              <TabsList>
                <TabsTrigger value="stock">Stock</TabsTrigger>
                <TabsTrigger value="movements">Movimientos</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {view === 'stock' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Stock total</TableHead>
                  <TableHead>Bodegas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.length ? (
                  paginatedRecords.map((product) => {
                    const signal = getStockSignal(product)

                    return (
                      <TableRow key={product.id} className="cursor-pointer" onClick={() => setDetailProduct(product)}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {product.brand} · {product.productType?.name ?? 'Sin tipo'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{product.provider?.name ?? 'Sin proveedor'}</TableCell>
                        <TableCell>
                          <div>
                            <p>{formatNumber(getTotalStock(product))}</p>
                            <p className="text-xs text-muted-foreground">
                              Min {formatNumber(product.minimumStock)}
                              {product.maximumStock !== null && product.maximumStock !== undefined
                                ? ` · Max ${formatNumber(product.maximumStock)}`
                                : ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[360px] text-sm text-muted-foreground">
                            {(product.warehouses ?? []).length
                              ? product.warehouses
                                  .map((item) => `${item.warehouse?.location}: ${formatNumber(item.quantity)}`)
                                  .join(' · ')
                              : 'Sin asignaciones'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={signal.variant}>{signal.label}</Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      No hay productos que coincidan con la busqueda actual.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Origen / Destino</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.length ? (
                  paginatedRecords.map((movement) => (
                    <TableRow key={movement.id} className="cursor-pointer" onClick={() => setDetailMovement(movement)}>
                      <TableCell>
                        <Badge variant={getMovementBadgeVariant(movement.movementType)}>
                          {formatMovementType(movement.movementType)}
                        </Badge>
                      </TableCell>
                      <TableCell>{movement.product?.name ?? `Producto #${movement.productId}`}</TableCell>
                      <TableCell>{formatNumber(movement.quantity)}</TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          <p>Origen: {movement.fromWarehouse?.location ?? 'N/A'}</p>
                          <p>Destino: {movement.toWarehouse?.location ?? 'N/A'}</p>
                        </div>
                      </TableCell>
                      <TableCell>{movement.reason ?? 'Sin motivo'}</TableCell>
                      <TableCell>{formatDate(movement.createdAt)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      No hay movimientos que coincidan con la busqueda actual.
                    </TableCell>
                  </TableRow>
              )}
            </TableBody>
          </Table>
          )}

          <LocalPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startItem={startItem}
            endItem={endItem}
            singularLabel={view === 'stock' ? 'producto' : 'movimiento'}
            pluralLabel={view === 'stock' ? 'productos' : 'movimientos'}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <InventoryMovementDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        products={inventory}
        warehouses={warehouses}
        onSubmit={handleCreateMovement}
        isSubmitting={movementMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailProduct)}
        onOpenChange={(open) => !open && setDetailProduct(null)}
        title={detailProduct?.name ?? ''}
        description={detailProduct ? `${detailProduct.brand} · ${detailProduct.productType?.name ?? 'Sin tipo'}` : ''}
        badge={detailProduct ? getStockSignal(detailProduct) : null}
        fields={
          detailProduct
            ? [
                {
                  label: 'Producto',
                  items: [
                    { label: 'Proveedor', value: detailProduct.provider?.name ?? 'Sin proveedor' },
                    { label: 'Marca', value: detailProduct.brand },
                    { label: 'IVA', value: `${detailProduct.taxRate}%` },
                    { label: 'Stock total', value: formatNumber(getTotalStock(detailProduct)) },
                  ],
                },
                {
                  label: 'Control de stock',
                  items: [
                    { label: 'Minimo', value: formatNumber(detailProduct.minimumStock) },
                    {
                      label: 'Maximo',
                      value:
                        detailProduct.maximumStock === null || detailProduct.maximumStock === undefined
                          ? 'Sin definir'
                          : formatNumber(detailProduct.maximumStock),
                    },
                    {
                      label: 'Bodegas',
                      value:
                        detailProduct.warehouses?.length
                          ? detailProduct.warehouses
                              .map((item) => `${item.warehouse?.location}: ${formatNumber(item.quantity)}`)
                              .join(' · ')
                          : 'Sin asignaciones',
                    },
                    { label: 'Actualizado', value: formatDate(detailProduct.updatedAt) },
                  ],
                },
              ]
            : []
        }
      />

      <ModuleDetailsDrawer
        open={Boolean(detailMovement)}
        onOpenChange={(open) => !open && setDetailMovement(null)}
        title={detailMovement ? `Movimiento #${detailMovement.id}` : ''}
        description={detailMovement?.product?.name ?? ''}
        badge={
          detailMovement
            ? {
                label: formatMovementType(detailMovement.movementType),
                variant: getMovementBadgeVariant(detailMovement.movementType),
              }
            : null
        }
        fields={
          detailMovement
            ? [
                {
                  label: 'Resumen',
                  items: [
                    { label: 'Producto', value: detailMovement.product?.name ?? `Producto #${detailMovement.productId}` },
                    { label: 'Cantidad', value: formatNumber(detailMovement.quantity) },
                    { label: 'Origen', value: detailMovement.fromWarehouse?.location ?? 'N/A' },
                    { label: 'Destino', value: detailMovement.toWarehouse?.location ?? 'N/A' },
                  ],
                },
                {
                  label: 'Trazabilidad',
                  items: [
                    { label: 'Motivo', value: detailMovement.reason ?? 'Sin motivo' },
                    { label: 'Fecha', value: formatDate(detailMovement.createdAt) },
                    { label: 'Tipo', value: formatMovementType(detailMovement.movementType) },
                  ],
                },
              ]
            : []
        }
      />
    </div>
  )
}
