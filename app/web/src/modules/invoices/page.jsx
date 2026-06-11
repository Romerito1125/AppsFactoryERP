import { useDeferredValue, useState } from 'react'
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
  formatInvoiceStatus,
  formatNumber,
  matchesSearch,
} from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'

const invoiceSchema = z.object({
  clientId: z.number({ message: 'Selecciona un cliente' }).int().positive('Selecciona un cliente'),
  items: z
    .array(
      z.object({
        productId: z.number({ message: 'Selecciona un producto' }).int().positive('Selecciona un producto'),
        quantity: z.number({ message: 'Cantidad obligatoria' }).int().positive('Minimo 1 unidad'),
      }),
    )
    .min(1, 'Agrega al menos un producto'),
})

const consecutiveSchema = z.object({
  consecutive: z.string().min(4, 'Minimo 4 caracteres'),
})

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
      items: [{ productId: undefined, quantity: 1 }],
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
      form.reset({ clientId: undefined, items: [{ productId: undefined, quantity: 1 }] })
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva factura</DialogTitle>
          <DialogDescription>
            Crea la venta con sus productos, cantidades y validaciones de inventario.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values)
            form.reset({ clientId: undefined, items: [{ productId: undefined, quantity: 1 }] })
          })}
        >
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
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
                <li>El cliente debe estar activo.</li>
                <li>La factura requiere al menos un item.</li>
                <li>Verifica disponibilidad suficiente antes de confirmar la venta.</li>
              </ul>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ productId: undefined, quantity: 1 })}
              >
                <Plus className="mr-2 size-4" />
                Agregar linea
              </Button>
            </div>

            <div className="grid gap-3">
              {fields.map((itemField, index) => {
                const selectedProduct = products.find(
                  (product) => product.id === watchedItems[index]?.productId,
                )

                return (
                  <div key={itemField.id} className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4 md:grid-cols-[1.4fr_0.5fr_0.8fr_auto] md:items-end">
                    <div className="grid gap-2">
                      <Label>Producto</Label>
                      <Controller
                        name={`items.${index}.productId`}
                        control={form.control}
                        render={({ field }) => (
                          <Select
                            value={field.value ? String(field.value) : undefined}
                            onValueChange={(value) => field.onChange(Number(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un producto" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={String(product.id)}>
                                  {`${product.name} · stock ${product.quantity}`}
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
                        {...form.register(`items.${index}.quantity`, {
                          setValueAs: (value) => Number(value),
                        })}
                      />
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="text-xs text-muted-foreground">Vista previa</p>
                      <p className="mt-1 font-medium">
                        {selectedProduct
                          ? formatCurrency(
                              Number(selectedProduct.price ?? 0) *
                                Number(watchedItems[index]?.quantity ?? 0),
                            )
                          : 'Selecciona producto'}
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

            {form.formState.errors.items ? (
              <p className="text-xs text-destructive">{String(form.formState.errors.items.message)}</p>
            ) : null}
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
  const deferredSearch = useDeferredValue(search)
  const [statusTab, setStatusTab] = useState('ACTIVA')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [editInvoice, setEditInvoice] = useState(null)
  const [cancelInvoice, setCancelInvoice] = useState(null)

  const invoicesQuery = useQuery({ queryKey: ['facturas'], queryFn: () => apiClient.get('/facturas') })
  const clientsQuery = useQuery({ queryKey: ['facturas-clientes'], queryFn: () => apiClient.get('/clientes') })
  const productsQuery = useQuery({ queryKey: ['facturas-productos'], queryFn: () => apiClient.get('/productos') })

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

  if (invoicesQuery.isLoading || clientsQuery.isLoading || productsQuery.isLoading) {
    return <InvoiceSkeleton />
  }

  if (invoicesQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {invoicesQuery.error.message}
      </div>
    )
  }

  const invoices = invoicesQuery.data ?? []
  const clients = clientsQuery.data ?? []
  const products = productsQuery.data ?? []

  const filteredInvoices = invoices.filter((invoice) => {
    const statusMatch = statusTab === 'TODAS' ? true : invoice.status === statusTab

    return (
      statusMatch &&
      matchesSearch(invoice, deferredSearch, (record) => [
        record.consecutive,
        `${record.client.firstName} ${record.client.lastName}`,
      ])
    )
  })

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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por consecutivo o cliente..."
                className="pl-9"
              />
            </div>
            <Tabs value={statusTab} onValueChange={setStatusTab}>
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
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length ? (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.consecutive}</TableCell>
                    <TableCell>{`${invoice.client.firstName} ${invoice.client.lastName}`}</TableCell>
                    <TableCell>{formatNumber(invoice.items.length)}</TableCell>
                    <TableCell>{formatCurrency(invoice.total)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'ACTIVA' ? 'default' : 'secondary'}>
                        {formatInvoiceStatus(invoice.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                    <TableCell className="text-right">
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
                  <TableCell colSpan={7} className="py-12 text-center">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Unitario</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailInvoice.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product.name}</TableCell>
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

      <AlertDialog open={Boolean(cancelInvoice)} onOpenChange={(open) => !open && setCancelInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular factura</AlertDialogTitle>
            <AlertDialogDescription>
              La factura pasara a estado ANULADA y las unidades volveran al inventario disponible.
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
