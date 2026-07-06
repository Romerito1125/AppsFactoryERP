import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Bike, Plus, Search } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = 20

const deliverySchema = z.object({
  invoiceId: z.number({ message: 'Selecciona una factura' }).int().positive('Selecciona una factura'),
  address: z.string().min(5, 'Minimo 5 caracteres'),
  recipientName: z.string().min(2, 'Minimo 2 caracteres'),
  recipientPhone: z.string().min(5, 'Minimo 5 caracteres'),
  notes: z.string().optional(),
})

const updateDeliverySchema = deliverySchema.omit({ invoiceId: true })

const deliveryStatusSchema = z.object({
  status: z.enum(['PENDIENTE', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO']),
})

const deliveryStatusLabels = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparacion',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
}

const deliveryStatusVariants = {
  PENDIENTE: 'outline',
  EN_PREPARACION: 'secondary',
  EN_CAMINO: 'default',
  ENTREGADO: 'default',
  CANCELADO: 'destructive',
}

function formatDeliveryStatus(value) {
  return deliveryStatusLabels[value] ?? value ?? 'Sin estado'
}

function DeliveriesSkeleton() {
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

function DeliveryFormDialog({ open, onOpenChange, mode, delivery, invoices, onSubmit, isSubmitting }) {
  const schema = mode === 'create' ? deliverySchema : updateDeliverySchema
  const defaultValues =
    mode === 'create'
      ? {
          invoiceId: undefined,
          address: '',
          recipientName: '',
          recipientPhone: '',
          notes: '',
        }
      : {
          address: delivery?.address ?? '',
          recipientName: delivery?.recipientName ?? '',
          recipientPhone: delivery?.recipientPhone ?? '',
          notes: delivery?.notes ?? '',
        }

  const form = useForm({ resolver: zodResolver(schema), defaultValues })

  useEffect(() => {
    form.reset(defaultValues)
  }, [delivery, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nuevo domicilio' : 'Actualizar domicilio'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Asocia un domicilio a una factura activa y registra los datos de entrega.'
              : 'Ajusta direccion, contacto o notas del domicilio seleccionado.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          {mode === 'create' ? (
            <div className="grid gap-2">
              <Label>Factura</Label>
              <Controller
                name="invoiceId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : undefined}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una factura" />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={String(invoice.id)}>
                          {`${invoice.consecutive} · ${formatCurrency(invoice.total)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Direccion</Label>
            <Input {...form.register('address')} placeholder="Calle 123 #45-67" />
          </div>

          <div className="grid gap-2">
            <Label>Destinatario</Label>
            <Input {...form.register('recipientName')} placeholder="Nombre de quien recibe" />
          </div>

          <div className="grid gap-2">
            <Label>Telefono</Label>
            <Input {...form.register('recipientPhone')} placeholder="3001234567" />
          </div>

          <div className="grid gap-2">
            <Label>Notas</Label>
            <Textarea rows={3} {...form.register('notes')} placeholder="Indicaciones de entrega" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Crear domicilio' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeliveryStatusDialog({ open, onOpenChange, delivery, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(deliveryStatusSchema),
    defaultValues: { status: delivery?.status ?? 'PENDIENTE' },
  })

  useEffect(() => {
    form.reset({ status: delivery?.status ?? 'PENDIENTE' })
  }, [delivery, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar estado</DialogTitle>
          <DialogDescription>Cambia el estado operativo del domicilio.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
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
                    {Object.entries(deliveryStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
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

export function DeliveriesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('PENDIENTE')
  const [createOpen, setCreateOpen] = useState(false)
  const [editDelivery, setEditDelivery] = useState(null)
  const [statusDelivery, setStatusDelivery] = useState(null)
  const [detailDelivery, setDetailDelivery] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const deliveriesQuery = useQuery({
    queryKey: ['domicilios', statusTab, search, currentPage],
    queryFn: () =>
      apiClient.get('/domicilios', {
        status: statusTab === 'TODOS' ? undefined : statusTab,
        q: search,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })
  const invoicesQuery = useQuery({
    queryKey: ['domicilios-facturas'],
    queryFn: () => apiClient.getAllPages('/facturas'),
    enabled: createOpen,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/domicilios', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domicilios'] })
      setCreateOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/domicilios/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domicilios'] })
      setEditDelivery(null)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/domicilios/${id}/estado`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domicilios'] })
      setStatusDelivery(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (id) => apiClient.delete(`/domicilios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domicilios'] })
    },
  })

  if (deliveriesQuery.isLoading || (createOpen && invoicesQuery.isLoading)) {
    return <DeliveriesSkeleton />
  }

  if (deliveriesQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {deliveriesQuery.error.message}
      </div>
    )
  }

  const deliveries = deliveriesQuery.data?.data ?? []
  const totalItems = Number(deliveriesQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(deliveriesQuery.data?.totalPages ?? 1))
  const invoices = invoicesQuery.data ?? []
  const assignedInvoiceIds = new Set(deliveries.map((delivery) => delivery.invoiceId))
  const availableInvoices = invoices.filter(
    (invoice) => invoice.status === 'ACTIVA' && !assignedInvoiceIds.has(invoice.id),
  )
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + deliveries.length - 1, totalItems)

  const summaryCards = [
    {
      label: 'Domicilios activos',
      value: formatNumber(
        deliveries.filter((delivery) => !['ENTREGADO', 'CANCELADO'].includes(delivery.status)).length,
      ),
      help: 'Entregas que siguen en operacion.',
      icon: Bike,
    },
    {
      label: 'En camino',
      value: formatNumber(deliveries.filter((delivery) => delivery.status === 'EN_CAMINO').length),
      help: 'Pedidos actualmente en reparto.',
      icon: Bike,
    },
    {
      label: 'Entregados',
      value: formatNumber(deliveries.filter((delivery) => delivery.status === 'ENTREGADO').length),
      help: 'Pedidos finalizados con entrega confirmada.',
      icon: Bike,
    },
    {
      label: 'Valor asociado',
      value: formatCurrency(deliveries.reduce((sum, delivery) => sum + Number(delivery.invoice?.total ?? 0), 0)),
      help: 'Total de facturas asociadas a domicilios.',
      icon: Bike,
    },
  ]

  async function handleCreateDelivery(payload) {
    await toast.promise(createMutation.mutateAsync(payload), {
      loading: 'Creando domicilio...',
      success: 'Domicilio creado correctamente',
      error: (error) => error.message,
    })
  }

  async function handleUpdateDelivery(payload) {
    if (!editDelivery) return

    await toast.promise(updateMutation.mutateAsync({ id: editDelivery.id, payload }), {
      loading: 'Actualizando domicilio...',
      success: 'Domicilio actualizado correctamente',
      error: (error) => error.message,
    })
  }

  async function handleUpdateStatus(payload) {
    if (!statusDelivery) return

    await toast.promise(statusMutation.mutateAsync({ id: statusDelivery.id, payload }), {
      loading: 'Actualizando estado...',
      success: 'Estado actualizado',
      error: (error) => error.message,
    })
  }

  async function handleCancelDelivery(delivery) {
    await toast.promise(cancelMutation.mutateAsync(delivery.id), {
      loading: 'Cancelando domicilio...',
      success: 'Domicilio cancelado',
      error: (error) => error.message,
    })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Domicilios · Logistica
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Domicilios</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Gestiona pedidos a domicilio, su direccion, estado operativo y trazabilidad de entrega.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nuevo domicilio
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
            <CardTitle>Operacion de domicilios</CardTitle>
            <CardDescription>Consulta entregas, edita datos y controla su estado.</CardDescription>
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
                placeholder="Buscar por factura, destinatario o direccion..."
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
                <TabsTrigger value="EN_CAMINO">En camino</TabsTrigger>
                <TabsTrigger value="ENTREGADO">Entregados</TabsTrigger>
                <TabsTrigger value="TODOS">Todos</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Direccion</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {deliveries.length ? (
                  deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-medium">{delivery.invoice?.consecutive ?? `Factura #${delivery.invoiceId}`}</TableCell>
                    <TableCell>
                      <div>
                        <p>{delivery.recipientName}</p>
                        <p className="text-xs text-muted-foreground">{delivery.recipientPhone}</p>
                      </div>
                    </TableCell>
                    <TableCell>{delivery.address}</TableCell>
                    <TableCell>
                      <Badge variant={deliveryStatusVariants[delivery.status] ?? 'outline'}>
                        {formatDeliveryStatus(delivery.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{delivery.deliveredAt ? formatDate(delivery.deliveredAt) : 'Pendiente'}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">Acciones</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setDetailDelivery(delivery)}>Ver detalle</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditDelivery(delivery)}>Editar datos</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setStatusDelivery(delivery)}>Cambiar estado</DropdownMenuItem>
                          {delivery.status !== 'CANCELADO' ? (
                            <DropdownMenuItem
                              onClick={() => handleCancelDelivery(delivery)}
                              className="text-destructive focus:text-destructive"
                            >
                              Cancelar domicilio
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No hay domicilios para la vista actual.
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
            singularLabel="domicilio"
            pluralLabel="domicilios"
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <DeliveryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        invoices={availableInvoices}
        onSubmit={handleCreateDelivery}
        isSubmitting={createMutation.isPending}
      />

      <DeliveryFormDialog
        open={Boolean(editDelivery)}
        onOpenChange={(open) => !open && setEditDelivery(null)}
        mode="edit"
        delivery={editDelivery}
        invoices={[]}
        onSubmit={handleUpdateDelivery}
        isSubmitting={updateMutation.isPending}
      />

      <DeliveryStatusDialog
        open={Boolean(statusDelivery)}
        onOpenChange={(open) => !open && setStatusDelivery(null)}
        delivery={statusDelivery}
        onSubmit={handleUpdateStatus}
        isSubmitting={statusMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailDelivery)}
        onOpenChange={(open) => !open && setDetailDelivery(null)}
        title={detailDelivery ? `Domicilio #${detailDelivery.id}` : ''}
        description={detailDelivery?.invoice?.consecutive ?? ''}
        badge={
          detailDelivery
            ? {
                label: formatDeliveryStatus(detailDelivery.status),
                variant: deliveryStatusVariants[detailDelivery.status] ?? 'outline',
              }
            : null
        }
        fields={
          detailDelivery
            ? [
                {
                  label: 'Entrega',
                  items: [
                    { label: 'Factura', value: detailDelivery.invoice?.consecutive ?? `Factura #${detailDelivery.invoiceId}` },
                    { label: 'Destinatario', value: detailDelivery.recipientName },
                    { label: 'Telefono', value: detailDelivery.recipientPhone },
                    { label: 'Direccion', value: detailDelivery.address },
                  ],
                },
                {
                  label: 'Trazabilidad',
                  items: [
                    { label: 'Estado', value: formatDeliveryStatus(detailDelivery.status) },
                    { label: 'Entregado el', value: detailDelivery.deliveredAt ? formatDate(detailDelivery.deliveredAt) : 'Pendiente' },
                    { label: 'Factura total', value: formatCurrency(detailDelivery.invoice?.total ?? 0) },
                    { label: 'Notas', value: detailDelivery.notes ?? 'Sin notas' },
                  ],
                },
              ]
            : []
        }
      />
    </div>
  )
}
