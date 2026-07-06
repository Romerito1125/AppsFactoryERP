import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Gift, Plus, Search } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatNumber, toApiStatus } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { DEFAULT_ITEMS_PER_PAGE, LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = DEFAULT_ITEMS_PER_PAGE

const discountTypeOptions = [
  { value: 'PORCENTAJE', label: 'Porcentaje' },
  { value: 'MONTO_FIJO', label: 'Monto fijo' },
]

const offerSchema = z
  .object({
    name: z.string().min(2, 'Minimo 2 caracteres'),
    description: z.string().optional(),
    discountType: z.enum(['PORCENTAJE', 'MONTO_FIJO']),
    discountValue: z.number({ message: 'Descuento obligatorio' }).positive('Debe ser mayor a cero'),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    minimumProductQuantity: z.number().int().positive('Debe ser mayor a cero').optional(),
    maximumProductQuantity: z.number().int().positive('Debe ser mayor a cero').optional(),
    isStackable: z.boolean(),
    clientIds: z.array(z.number()).optional(),
    productIds: z.array(z.number()).optional(),
    productTypeIds: z.array(z.number()).optional(),
    tagIds: z.array(z.number()).optional(),
  })
  .refine(
    (values) => values.discountType !== 'PORCENTAJE' || values.discountValue <= 100,
    { path: ['discountValue'], message: 'El porcentaje no puede ser mayor a 100' },
  )
  .refine(
    (values) => !values.startsAt || !values.endsAt || new Date(values.endsAt) > new Date(values.startsAt),
    { path: ['endsAt'], message: 'La fecha final debe ser mayor a la inicial' },
  )
  .refine(
    (values) =>
      values.maximumProductQuantity === undefined ||
      values.minimumProductQuantity === undefined ||
      values.maximumProductQuantity >= values.minimumProductQuantity,
    { path: ['maximumProductQuantity'], message: 'La cantidad maxima no puede ser menor a la minima' },
  )

function OffersSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[560px] rounded-2xl" />
    </div>
  )
}

function MultiSelectTargetField({ label, items, selectedIds = [], onChange, emptyLabel }) {
  function toggleItem(id) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id))
      return
    }

    onChange([...selectedIds, id])
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="max-h-40 overflow-y-auto rounded-2xl border border-border/70 bg-muted/15 p-3">
        {items.length ? (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
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
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </div>
  )
}

function OfferFormDialog({ open, onOpenChange, mode, offer, lookups, onSubmit, isSubmitting }) {
  const defaultValues = useMemo(
    () => ({
      name: offer?.name ?? '',
      description: offer?.description ?? '',
      discountType: offer?.discountType ?? 'PORCENTAJE',
      discountValue: offer?.discountValue ? Number(offer.discountValue) : undefined,
      startsAt: offer?.startsAt ? String(offer.startsAt).slice(0, 10) : '',
      endsAt: offer?.endsAt ? String(offer.endsAt).slice(0, 10) : '',
      minimumProductQuantity:
        offer?.minimumProductQuantity === null || offer?.minimumProductQuantity === undefined
          ? undefined
          : Number(offer.minimumProductQuantity),
      maximumProductQuantity:
        offer?.maximumProductQuantity === null || offer?.maximumProductQuantity === undefined
          ? undefined
          : Number(offer.maximumProductQuantity),
      isStackable: offer?.isStackable ?? false,
      clientIds: offer?.clients?.map((item) => item.id) ?? [],
      productIds: offer?.products?.map((item) => item.id) ?? [],
      productTypeIds: offer?.productTypes?.map((item) => item.id) ?? [],
      tagIds: offer?.tags?.map((item) => item.id) ?? [],
    }),
    [offer],
  )

  const form = useForm({
    resolver: zodResolver(offerSchema),
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nueva oferta' : 'Actualizar oferta'}</DialogTitle>
          <DialogDescription>
            Define descuentos, vigencia y los targets comerciales a los que aplica la oferta.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              ...values,
              startsAt: values.startsAt || undefined,
              endsAt: values.endsAt || undefined,
            }),
          )}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Nombre</Label>
              <Input {...form.register('name')} placeholder="Oferta mayorista" />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.name.message)}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>Tipo de descuento</Label>
              <Controller
                name="discountType"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {discountTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label>Descripcion</Label>
              <Textarea rows={3} {...form.register('description')} placeholder="Descripcion breve de la oferta" />
            </div>

            <div className="grid gap-2">
              <Label>Valor del descuento</Label>
              <Input
                type="number"
                min="1"
                {...form.register('discountValue', { setValueAs: (value) => Number(value) })}
              />
              {form.formState.errors.discountValue ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.discountValue.message)}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>Acumulable</Label>
              <Controller
                name="isStackable"
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
              <Label>Fecha inicio</Label>
              <Input type="date" {...form.register('startsAt')} />
            </div>

            <div className="grid gap-2">
              <Label>Fecha fin</Label>
              <Input type="date" {...form.register('endsAt')} />
              {form.formState.errors.endsAt ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.endsAt.message)}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>Cantidad minima</Label>
              <Input
                type="number"
                min="1"
                {...form.register('minimumProductQuantity', {
                  setValueAs: (value) => (value ? Number(value) : undefined),
                })}
              />
            </div>

            <div className="grid gap-2">
              <Label>Cantidad maxima</Label>
              <Input
                type="number"
                min="1"
                {...form.register('maximumProductQuantity', {
                  setValueAs: (value) => (value ? Number(value) : undefined),
                })}
              />
              {form.formState.errors.maximumProductQuantity ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.maximumProductQuantity.message)}</p>
              ) : null}
            </div>

            <Controller
              name="clientIds"
              control={form.control}
              render={({ field }) => (
                <MultiSelectTargetField
                  label="Clientes"
                  items={lookups.clients}
                  selectedIds={field.value ?? []}
                  onChange={field.onChange}
                  emptyLabel="No hay clientes disponibles"
                />
              )}
            />

            <Controller
              name="productIds"
              control={form.control}
              render={({ field }) => (
                <MultiSelectTargetField
                  label="Productos"
                  items={lookups.products}
                  selectedIds={field.value ?? []}
                  onChange={field.onChange}
                  emptyLabel="No hay productos disponibles"
                />
              )}
            />

            <Controller
              name="productTypeIds"
              control={form.control}
              render={({ field }) => (
                <MultiSelectTargetField
                  label="Tipos de producto"
                  items={lookups.productTypes}
                  selectedIds={field.value ?? []}
                  onChange={field.onChange}
                  emptyLabel="No hay tipos disponibles"
                />
              )}
            />

            <Controller
              name="tagIds"
              control={form.control}
              render={({ field }) => (
                <MultiSelectTargetField
                  label="Etiquetas"
                  items={lookups.tags}
                  selectedIds={field.value ?? []}
                  onChange={field.onChange}
                  emptyLabel="No hay etiquetas disponibles"
                />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Crear oferta' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatDiscount(offer) {
  return offer.discountType === 'PORCENTAJE'
    ? `${formatNumber(offer.discountValue)}%`
    : formatCurrency(offer.discountValue)
}

function renderTargets(offer) {
  const parts = []

  if (offer.clients?.length) parts.push(`${offer.clients.length} clientes`)
  if (offer.products?.length) parts.push(`${offer.products.length} productos`)
  if (offer.productTypes?.length) parts.push(`${offer.productTypes.length} tipos`)
  if (offer.tags?.length) parts.push(`${offer.tags.length} etiquetas`)

  return parts.length ? parts.join(' · ') : 'General'
}

export function OffersPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('activos')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [currentPage, setCurrentPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOffer, setEditOffer] = useState(null)
  const [detailOffer, setDetailOffer] = useState(null)

  const offersQuery = useQuery({
    queryKey: ['ofertas', status, deferredSearch, currentPage],
    queryFn: () =>
      apiClient.get('/ofertas', {
        estado: toApiStatus(status),
        q: deferredSearch,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })

  const lookupEnabled = createOpen || Boolean(editOffer)
  const clientsQuery = useQuery({ queryKey: ['ofertas-clientes'], queryFn: () => apiClient.getAllPages('/clientes'), enabled: lookupEnabled })
  const productsQuery = useQuery({ queryKey: ['ofertas-productos'], queryFn: () => apiClient.getAllPages('/productos'), enabled: lookupEnabled })
  const productTypesQuery = useQuery({ queryKey: ['ofertas-tipos'], queryFn: () => apiClient.getAllPages('/tipos-producto'), enabled: lookupEnabled })
  const tagsQuery = useQuery({ queryKey: ['ofertas-etiquetas'], queryFn: () => apiClient.getAllPages('/etiquetas'), enabled: lookupEnabled })

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/ofertas', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ofertas'] })
      setCreateOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/ofertas/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ofertas'] })
      setEditOffer(null)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id) => apiClient.delete(`/ofertas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ofertas'] })
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (id) => apiClient.patch(`/ofertas/${id}/reactivar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ofertas'] })
    },
  })

  if (
    offersQuery.isLoading ||
    (lookupEnabled &&
      (clientsQuery.isLoading || productsQuery.isLoading || productTypesQuery.isLoading || tagsQuery.isLoading))
  ) {
    return <OffersSkeleton />
  }

  if (offersQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {offersQuery.error.message}
      </div>
    )
  }

  const offers = offersQuery.data?.data ?? []
  const totalItems = Number(offersQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(offersQuery.data?.totalPages ?? 1))
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + offers.length - 1, totalItems)

  const lookups = {
    clients: (clientsQuery.data ?? []).map((item) => ({
      id: item.id,
      label: `${item.firstName} ${item.lastName}`,
    })),
    products: (productsQuery.data ?? []).map((item) => ({ id: item.id, label: item.name })),
    productTypes: (productTypesQuery.data ?? []).map((item) => ({ id: item.id, label: item.name })),
    tags: (tagsQuery.data ?? []).map((item) => ({ id: item.id, label: item.name })),
  }

  async function handleCreateOffer(payload) {
    await toast.promise(createMutation.mutateAsync(payload), {
      loading: 'Creando oferta...',
      success: 'Oferta creada correctamente',
      error: (error) => error.message,
    })
  }

  async function handleUpdateOffer(payload) {
    if (!editOffer) return

    await toast.promise(updateMutation.mutateAsync({ id: editOffer.id, payload }), {
      loading: 'Actualizando oferta...',
      success: 'Oferta actualizada correctamente',
      error: (error) => error.message,
    })
  }

  async function handleArchiveOffer(offer) {
    await toast.promise(archiveMutation.mutateAsync(offer.id), {
      loading: 'Desactivando oferta...',
      success: 'Oferta desactivada',
      error: (error) => error.message,
    })
  }

  async function handleReactivateOffer(offer) {
    await toast.promise(reactivateMutation.mutateAsync(offer.id), {
      loading: 'Reactivando oferta...',
      success: 'Oferta reactivada',
      error: (error) => error.message,
    })
  }

  const summaryCards = [
    {
      label: 'Ofertas visibles',
      value: formatNumber(offers.length),
      help: 'Total obtenido con el filtro actual de estado.',
    },
    {
      label: 'Ofertas generales',
      value: formatNumber(
        offers.filter(
          (offer) =>
            !offer.clients.length &&
            !offer.products.length &&
            !offer.productTypes.length &&
            !offer.tags.length,
        ).length,
      ),
      help: 'Aplican sin targets especificos.',
    },
    {
      label: 'Acumulables',
      value: formatNumber(offers.filter((offer) => offer.isStackable).length),
      help: 'Ofertas configuradas para combinarse.',
    },
    {
      label: 'Con vigencia',
      value: formatNumber(offers.filter((offer) => offer.startsAt || offer.endsAt).length),
      help: 'Promociones con ventana de fechas definida.',
    },
  ]

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Ofertas · Reglas comerciales
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Ofertas</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Administra descuentos por cliente, producto, tipo o etiqueta con vigencia y reglas comerciales configurables.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nueva oferta
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
            <CardTitle>Catalogo de ofertas</CardTitle>
            <CardDescription>Consulta, edita, desactiva o reactiva promociones.</CardDescription>
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
                placeholder="Buscar por nombre o target..."
                className="pl-9"
              />
            </div>
            <Select
              value={status}
                onValueChange={(value) => {
                  setStatus(value)
                  setCurrentPage(1)
                }}
            >
              <SelectTrigger className="w-full md:w-[170px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activos">Activos</SelectItem>
                <SelectItem value="inactivos">Inactivos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Oferta</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Targets</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.length ? (
                offers.map((offer) => (
                  <TableRow key={offer.id} className="cursor-pointer" onClick={() => setDetailOffer(offer)}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{offer.name}</p>
                        <p className="text-xs text-muted-foreground">{offer.description ?? 'Sin descripcion'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{formatDiscount(offer)}</p>
                        <p className="text-xs text-muted-foreground">
                          {offer.isStackable ? 'Acumulable' : 'No acumulable'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{renderTargets(offer)}</TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        <p>Inicio: {offer.startsAt ? formatDate(offer.startsAt) : 'Sin fecha'}</p>
                        <p>Fin: {offer.endsAt ? formatDate(offer.endsAt) : 'Sin fecha'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={offer.isActive ? 'default' : 'secondary'}>
                        {offer.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No hay ofertas para la vista actual.
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
            singularLabel="oferta"
            pluralLabel="ofertas"
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <OfferFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        lookups={lookups}
        onSubmit={handleCreateOffer}
        isSubmitting={createMutation.isPending}
      />

      <OfferFormDialog
        open={Boolean(editOffer)}
        onOpenChange={(open) => !open && setEditOffer(null)}
        mode="edit"
        offer={editOffer}
        lookups={lookups}
        onSubmit={handleUpdateOffer}
        isSubmitting={updateMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailOffer)}
        onOpenChange={(open) => !open && setDetailOffer(null)}
        title={detailOffer?.name ?? ''}
        description={detailOffer?.description ?? ''}
        badge={
          detailOffer
            ? {
                label: detailOffer.isActive ? 'Activa' : 'Inactiva',
                variant: detailOffer.isActive ? 'default' : 'secondary',
              }
            : null
        }
      >
        {detailOffer ? (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border/70 bg-card/94">
                <CardHeader>
                  <CardDescription>Descuento</CardDescription>
                  <CardTitle className="text-lg">{formatDiscount(detailOffer)}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-border/70 bg-card/94">
                <CardHeader>
                  <CardDescription>Acumulable</CardDescription>
                  <CardTitle className="text-lg">{detailOffer.isStackable ? 'Si' : 'No'}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-border/70 bg-card/94">
                <CardHeader>
                  <CardDescription>Minimo</CardDescription>
                  <CardTitle className="text-lg">
                    {detailOffer.minimumProductQuantity ?? 'Sin minimo'}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-border/70 bg-card/94">
                <CardHeader>
                  <CardDescription>Maximo</CardDescription>
                  <CardTitle className="text-lg">
                    {detailOffer.maximumProductQuantity ?? 'Sin maximo'}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary uppercase">Targets</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Clientes</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detailOffer.clients.length ? detailOffer.clients.map((item) => <Badge key={item.id} variant="outline">{`${item.firstName} ${item.lastName}`}</Badge>) : <span className="text-sm text-muted-foreground">General</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Productos</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detailOffer.products.length ? detailOffer.products.map((item) => <Badge key={item.id} variant="outline">{item.name}</Badge>) : <span className="text-sm text-muted-foreground">Sin restriccion</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tipos de producto</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detailOffer.productTypes.length ? detailOffer.productTypes.map((item) => <Badge key={item.id} variant="outline">{item.name}</Badge>) : <span className="text-sm text-muted-foreground">Sin restriccion</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Etiquetas</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detailOffer.tags.length ? detailOffer.tags.map((item) => <Badge key={item.id} variant="outline">{item.name}</Badge>) : <span className="text-sm text-muted-foreground">Sin restriccion</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditOffer(detailOffer)}>
                Editar oferta
              </Button>
              {detailOffer.isActive ? (
                <Button variant="destructive" onClick={() => handleArchiveOffer(detailOffer)}>
                  Desactivar
                </Button>
              ) : (
                <Button onClick={() => handleReactivateOffer(detailOffer)}>Reactivar</Button>
              )}
            </div>
          </div>
        ) : null}
      </ModuleDetailsDrawer>
    </div>
  )
}
