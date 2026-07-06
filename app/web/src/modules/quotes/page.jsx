import { useDeferredValue, useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { FilePlus2, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react'
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
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = 20

const quoteStatusOptions = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'APROBADA', label: 'Aprobada' },
  { value: 'RECHAZADA', label: 'Rechazada' },
  { value: 'EXPIRADA', label: 'Expirada' },
  { value: 'CONVERTIDA', label: 'Convertida' },
]

const mutableStatusOptions = quoteStatusOptions.filter((option) => option.value !== 'CONVERTIDA')

const quoteSchema = z.object({
  clientId: z.number({ message: 'Selecciona un cliente' }).int().positive('Selecciona un cliente'),
  expiresAt: z.string().optional(),
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

const expirySchema = z.object({
  expiresAt: z.string().optional(),
})

const statusSchema = z.object({
  status: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA', 'EXPIRADA']),
})

const quoteStatusLabels = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  EXPIRADA: 'Expirada',
  CONVERTIDA: 'Convertida',
}

const quoteStatusVariants = {
  PENDIENTE: 'outline',
  APROBADA: 'default',
  RECHAZADA: 'secondary',
  EXPIRADA: 'destructive',
  CONVERTIDA: 'default',
}

function formatQuoteStatus(value) {
  return quoteStatusLabels[value] ?? value ?? 'Sin estado'
}

function QuoteSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[500px] rounded-2xl" />
    </div>
  )
}

function CreateQuoteDialog({ open, onOpenChange, clients, products, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      clientId: undefined,
      expiresAt: '',
      items: [{ productId: undefined, productPriceId: undefined, quantity: 1 }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  const watchedItems = useWatch({ control: form.control, name: 'items' })

  function closeDialog(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      form.reset({
        clientId: undefined,
        expiresAt: '',
        items: [{ productId: undefined, productPriceId: undefined, quantity: 1 }],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva cotizacion</DialogTitle>
          <DialogDescription>
            Crea una propuesta comercial con precios vigentes y opcion de convertirla en factura despues.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit({ ...values, expiresAt: values.expiresAt || undefined })
            form.reset({
              clientId: undefined,
              expiresAt: '',
              items: [{ productId: undefined, productPriceId: undefined, quantity: 1 }],
            })
          })}
        >
          <div className="grid gap-4 md:grid-cols-[1fr_0.8fr]">
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
            </div>

            <div className="grid gap-2">
              <Label>Vence el</Label>
              <Input type="date" {...form.register('expiresAt')} />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ productId: undefined, productPriceId: undefined, quantity: 1 })}
              >
                <Plus className="mr-2 size-4" />
                Agregar linea
              </Button>
            </div>

            <div className="grid gap-3">
              {fields.map((itemField, index) => {
                const selectedProduct = products.find((product) => product.id === watchedItems[index]?.productId)
                const activePrices = (selectedProduct?.prices ?? []).filter((price) => price.isActive)
                const selectedProductPrice =
                  activePrices.find((price) => price.id === watchedItems[index]?.productPriceId) ??
                  activePrices.find((price) => price.isDefault) ??
                  activePrices[0]

                return (
                  <div key={itemField.id} className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4 md:grid-cols-[1.15fr_1fr_0.45fr_0.8fr_auto] md:items-end">
                    <div className="grid gap-2">
                      <Label>Producto</Label>
                      <Controller
                        name={`items.${index}.productId`}
                        control={form.control}
                        render={({ field }) => (
                          <Select
                            value={field.value ? String(field.value) : undefined}
                            onValueChange={(value) => {
                              const nextProductId = Number(value)
                              const product = products.find((item) => item.id === nextProductId)
                              const defaultPrice =
                                product?.prices?.find((price) => price.isActive && price.isDefault) ??
                                product?.prices?.find((price) => price.isActive)

                              field.onChange(nextProductId)
                              form.setValue(`items.${index}.productPriceId`, defaultPrice?.id, {
                                shouldValidate: true,
                              })
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un producto" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={String(product.id)}>
                                  {`${product.name} · ${product.brand}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
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
                    </div>

                    <div className="grid gap-2">
                      <Label>Cantidad</Label>
                      <Input
                        type="number"
                        min="1"
                        {...form.register(`items.${index}.quantity`, { setValueAs: (value) => Number(value) })}
                      />
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="text-xs text-muted-foreground">Vista previa</p>
                      <p className="mt-1 font-medium">
                        {selectedProductPrice
                          ? formatCurrency(Number(selectedProductPrice.price ?? 0) * Number(watchedItems[index]?.quantity ?? 0))
                          : 'Selecciona precio'}
                      </p>
                      {selectedProduct ? (
                        <p className="text-xs text-muted-foreground">IVA {selectedProduct.taxRate}%</p>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeDialog(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando...' : 'Crear cotizacion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UpdateExpiryDialog({ open, onOpenChange, quote, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(expirySchema),
    defaultValues: { expiresAt: quote?.expiresAt ? String(quote.expiresAt).slice(0, 10) : '' },
  })

  useEffect(() => {
    form.reset({ expiresAt: quote?.expiresAt ? String(quote.expiresAt).slice(0, 10) : '' })
  }, [form, quote])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar vigencia</DialogTitle>
          <DialogDescription>Ajusta la fecha de vencimiento de la cotizacion.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((values) => onSubmit(values))}>
          <div className="grid gap-2">
            <Label>Vence el</Label>
            <Input type="date" {...form.register('expiresAt')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar vigencia'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UpdateStatusDialog({ open, onOpenChange, quote, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(statusSchema),
    defaultValues: { status: quote?.status ?? 'PENDIENTE' },
  })

  useEffect(() => {
    form.reset({ status: quote?.status ?? 'PENDIENTE' })
  }, [form, quote])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar estado</DialogTitle>
          <DialogDescription>Cambia el estado operativo de la cotizacion.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((values) => onSubmit(values))}>
          <div className="grid gap-2">
            <Label>Estado</Label>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {mutableStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Actualizar estado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function QuotesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [statusTab, setStatusTab] = useState('PENDIENTE')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailQuote, setDetailQuote] = useState(null)
  const [editQuote, setEditQuote] = useState(null)
  const [statusQuote, setStatusQuote] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const quotesQuery = useQuery({
    queryKey: ['cotizaciones', statusTab, search, currentPage],
    queryFn: () =>
      apiClient.get('/cotizaciones', {
        status: statusTab === 'TODAS' ? undefined : statusTab,
        q: search,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })
  const clientsQuery = useQuery({
    queryKey: ['cotizaciones-clientes'],
    queryFn: () => apiClient.getAllPages('/clientes'),
    enabled: createOpen,
  })
  const productsQuery = useQuery({
    queryKey: ['cotizaciones-productos'],
    queryFn: () => apiClient.getAllPages('/productos'),
    enabled: createOpen,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/cotizaciones', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
      setCreateOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/cotizaciones/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
      setEditQuote(null)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/cotizaciones/${id}/estado`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
      setStatusQuote(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id) => apiClient.delete(`/cotizaciones/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
    },
  })

  const convertMutation = useMutation({
    mutationFn: (id) => apiClient.post(`/cotizaciones/${id}/convertir-factura`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
  })

  if (quotesQuery.isLoading || (createOpen && (clientsQuery.isLoading || productsQuery.isLoading))) {
    return <QuoteSkeleton />
  }

  if (quotesQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {quotesQuery.error.message}
      </div>
    )
  }

  const quotes = quotesQuery.data?.data ?? []
  const totalItems = Number(quotesQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(quotesQuery.data?.totalPages ?? 1))
  const clients = clientsQuery.data ?? []
  const products = productsQuery.data ?? []
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + quotes.length - 1, totalItems)

  const summaryCards = [
    {
      label: 'Cotizaciones activas',
      value: formatNumber(quotes.filter((quote) => ['PENDIENTE', 'APROBADA'].includes(quote.status)).length),
      help: 'Propuestas pendientes o aprobadas listas para seguimiento.',
    },
    {
      label: 'Convertidas',
      value: formatNumber(quotes.filter((quote) => quote.status === 'CONVERTIDA').length),
      help: 'Cotizaciones ya llevadas a factura.',
    },
    {
      label: 'Valor cotizado',
      value: formatCurrency(quotes.reduce((sum, quote) => sum + Number(quote.total ?? 0), 0)),
      help: 'Total acumulado de las cotizaciones registradas.',
    },
    {
      label: 'Expiradas/Rechazadas',
      value: formatNumber(quotes.filter((quote) => ['EXPIRADA', 'RECHAZADA'].includes(quote.status)).length),
      help: 'Cotizaciones que ya no estan vigentes comercialmente.',
    },
  ]

  async function handleCreateQuote(payload) {
    await toast.promise(createMutation.mutateAsync(payload), {
      loading: 'Creando cotizacion...',
      success: 'Cotizacion creada correctamente',
      error: (error) => error.message,
    })
  }

  async function handleUpdateQuote(payload) {
    if (!editQuote) return

    await toast.promise(updateMutation.mutateAsync({ id: editQuote.id, payload: { expiresAt: payload.expiresAt || undefined } }), {
      loading: 'Actualizando vigencia...',
      success: 'Vigencia actualizada',
      error: (error) => error.message,
    })
  }

  async function handleUpdateStatus(payload) {
    if (!statusQuote) return

    await toast.promise(statusMutation.mutateAsync({ id: statusQuote.id, payload }), {
      loading: 'Actualizando estado...',
      success: 'Estado actualizado',
      error: (error) => error.message,
    })
  }

  async function handleRejectQuote(quote) {
    await toast.promise(rejectMutation.mutateAsync(quote.id), {
      loading: 'Rechazando cotizacion...',
      success: 'Cotizacion rechazada',
      error: (error) => error.message,
    })
  }

  async function handleConvertQuote(quote) {
    await toast.promise(convertMutation.mutateAsync(quote.id), {
      loading: 'Convirtiendo cotizacion...',
      success: 'Cotizacion convertida en factura',
      error: (error) => error.message,
    })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Cotizaciones · Ventas
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Cotizaciones
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Crea propuestas comerciales, ajusta su vigencia y conviertelas en factura cuando el cliente apruebe.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <FilePlus2 className="mr-2 size-4" />
          Nueva cotizacion
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
            <CardTitle>Operacion de cotizaciones</CardTitle>
            <CardDescription>Consulta, cambio de estado, vigencia y conversion a factura.</CardDescription>
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
                <TabsTrigger value="PENDIENTE">Pendientes</TabsTrigger>
                <TabsTrigger value="APROBADA">Aprobadas</TabsTrigger>
                <TabsTrigger value="CONVERTIDA">Convertidas</TabsTrigger>
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
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.length ? (
                quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">{quote.consecutive}</TableCell>
                    <TableCell>{`${quote.client.firstName} ${quote.client.lastName}`}</TableCell>
                    <TableCell>{formatNumber(quote.items.length)}</TableCell>
                    <TableCell>{formatCurrency(quote.total)}</TableCell>
                    <TableCell>
                      <Badge variant={quoteStatusVariants[quote.status] ?? 'outline'}>
                        {formatQuoteStatus(quote.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{quote.expiresAt ? formatDate(quote.expiresAt) : 'Sin fecha'}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="rounded-full">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setDetailQuote(quote)}>Ver detalle</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditQuote(quote)}>Editar vigencia</DropdownMenuItem>
                          {quote.status !== 'CONVERTIDA' ? (
                            <DropdownMenuItem onClick={() => setStatusQuote(quote)}>Cambiar estado</DropdownMenuItem>
                          ) : null}
                          {['PENDIENTE', 'APROBADA'].includes(quote.status) ? (
                            <DropdownMenuItem onClick={() => handleConvertQuote(quote)}>Convertir a factura</DropdownMenuItem>
                          ) : null}
                          {quote.status !== 'RECHAZADA' && quote.status !== 'CONVERTIDA' ? (
                            <DropdownMenuItem
                              onClick={() => handleRejectQuote(quote)}
                              className="text-destructive focus:text-destructive"
                            >
                              Rechazar cotizacion
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6">
                      <p className="font-medium text-foreground">No hay cotizaciones para esta vista</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Ajusta el filtro o crea una nueva cotizacion para iniciar el seguimiento comercial.
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
            singularLabel="cotizacion"
            pluralLabel="cotizaciones"
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <CreateQuoteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={clients}
        products={products}
        isSubmitting={createMutation.isPending}
        onSubmit={handleCreateQuote}
      />

      <UpdateExpiryDialog
        open={Boolean(editQuote)}
        onOpenChange={(open) => !open && setEditQuote(null)}
        quote={editQuote}
        isSubmitting={updateMutation.isPending}
        onSubmit={handleUpdateQuote}
      />

      <UpdateStatusDialog
        open={Boolean(statusQuote)}
        onOpenChange={(open) => !open && setStatusQuote(null)}
        quote={statusQuote}
        isSubmitting={statusMutation.isPending}
        onSubmit={handleUpdateStatus}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailQuote)}
        onOpenChange={(open) => !open && setDetailQuote(null)}
        title={detailQuote?.consecutive ?? ''}
        description={detailQuote ? `${detailQuote.client.firstName} ${detailQuote.client.lastName}` : ''}
        badge={
          detailQuote
            ? {
                label: formatQuoteStatus(detailQuote.status),
                variant: quoteStatusVariants[detailQuote.status] ?? 'outline',
              }
            : null
        }
      >
        {detailQuote ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Resumen</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {`${detailQuote.client.firstName} ${detailQuote.client.lastName}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vigencia</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {detailQuote.expiresAt ? formatDate(detailQuote.expiresAt) : 'Sin fecha'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Subtotal</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(detailQuote.subtotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Impuestos</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(detailQuote.taxes)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary uppercase">Items cotizados</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Precio aplicado</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Unitario</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailQuote.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product.name}</TableCell>
                      <TableCell>{item.productPrice?.name ?? 'Precio default'}</TableCell>
                      <TableCell>{formatNumber(item.quantity)}</TableCell>
                      <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell>{formatCurrency(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </ModuleDetailsDrawer>
    </div>
  )
}
