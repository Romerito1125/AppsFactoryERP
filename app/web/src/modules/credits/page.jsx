import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { CreditCard, HandCoins, Plus, Search } from 'lucide-react'
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
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { DEFAULT_ITEMS_PER_PAGE, LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = DEFAULT_ITEMS_PER_PAGE

const createCreditSchema = z.object({
  invoiceId: z.number({ message: 'Selecciona una factura' }).int().positive('Selecciona una factura'),
  dueDate: z.string().min(1, 'La fecha de vencimiento es obligatoria'),
})

const paymentSchema = z.object({
  amount: z.number({ message: 'Monto obligatorio' }).positive('Debe ser mayor a cero'),
  bankAccountId: z.number().int().positive().optional(),
  notes: z.string().optional(),
})

const statusSchema = z.object({
  status: z.enum(['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'CANCELADA']),
})

const creditStatusLabels = {
  PENDIENTE: 'Pendiente',
  PARCIAL: 'Parcial',
  PAGADA: 'Pagada',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
}

const creditStatusVariants = {
  PENDIENTE: 'outline',
  PARCIAL: 'secondary',
  PAGADA: 'default',
  VENCIDA: 'destructive',
  CANCELADA: 'secondary',
}

function formatCreditStatus(value) {
  return creditStatusLabels[value] ?? value ?? 'Sin estado'
}

function getDisplayedCreditStatus(credit) {
  return credit.reportedStatus ?? credit.status
}

function CreditsSkeleton() {
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

function CreateCreditDialog({ open, onOpenChange, invoices, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(createCreditSchema),
    defaultValues: { invoiceId: undefined, dueDate: '' },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo credito</DialogTitle>
          <DialogDescription>Crea una cuenta por cobrar a partir de una factura activa.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <Label>Factura</Label>
              <Controller
                name="invoiceId"
                control={form.control}
                render={({ field }) => (
                <NativeSelect
                  value={field.value ? String(field.value) : ''}
                  onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                >
                  <option value="">Selecciona una factura</option>
                  {invoices.map((invoice) => (
                    <option key={invoice.id} value={String(invoice.id)}>
                      {`${invoice.consecutive} · ${formatCurrency(invoice.total)}`}
                    </option>
                  ))}
                </NativeSelect>
                )}
              />
          </div>

          <div className="grid gap-2">
            <Label>Fecha de vencimiento</Label>
            <Input type="date" {...form.register('dueDate')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando...' : 'Crear credito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreditPaymentDialog({ open, onOpenChange, credit, accounts, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: undefined, bankAccountId: undefined, notes: '' },
  })

  useEffect(() => {
    form.reset({ amount: undefined, bankAccountId: undefined, notes: '' })
  }, [credit, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Registra un abono sobre el credito y opcionalmente envialo a una cuenta bancaria.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <Label>Monto</Label>
            <Input type="number" min="1" {...form.register('amount', { setValueAs: (value) => Number(value) })} />
          </div>

          <div className="grid gap-2">
            <Label>Cuenta bancaria</Label>
              <Controller
                name="bankAccountId"
                control={form.control}
                render={({ field }) => (
                <NativeSelect
                  value={field.value ? String(field.value) : 'none'}
                  onChange={(event) => field.onChange(event.target.value === 'none' ? undefined : Number(event.target.value))}
                >
                  <option value="none">Sin cuenta asociada</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={String(account.id)}>
                      {`${account.name} · ${account.bankName}`}
                    </option>
                  ))}
                </NativeSelect>
                )}
              />
          </div>

          <div className="grid gap-2">
            <Label>Notas</Label>
            <Input {...form.register('notes')} placeholder="Observaciones del abono" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreditStatusDialog({ open, onOpenChange, credit, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(statusSchema),
    defaultValues: { status: credit?.status ?? 'PENDIENTE' },
  })

  useEffect(() => {
    form.reset({ status: credit?.status ?? 'PENDIENTE' })
  }, [credit, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar estado del credito</DialogTitle>
          <DialogDescription>Ajusta el estado operativo de la cuenta por cobrar.</DialogDescription>
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
                    {Object.entries(creditStatusLabels).map(([value, label]) => (
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

export function CreditsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [statusTab, setStatusTab] = useState('PENDIENTE')
  const [currentPage, setCurrentPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailCredit, setDetailCredit] = useState(null)
  const [paymentCredit, setPaymentCredit] = useState(null)
  const [statusCredit, setStatusCredit] = useState(null)

  const creditsQuery = useQuery({
    queryKey: ['creditos', deferredSearch, statusTab, currentPage],
    queryFn: () =>
      apiClient.get('/creditos', {
        page: currentPage,
        limit: PAGE_SIZE,
        q: deferredSearch,
        status: statusTab === 'TODOS' ? undefined : statusTab,
      }),
    placeholderData: (previousData) => previousData,
  })
  const invoicesQuery = useQuery({
    queryKey: ['creditos-facturas'],
    queryFn: () => apiClient.getAllPages('/facturas'),
    enabled: createOpen,
  })
  const creditedInvoicesQuery = useQuery({
    queryKey: ['creditos-lookup'],
    queryFn: () => apiClient.getAllPages('/creditos'),
    enabled: createOpen,
  })
  const accountsQuery = useQuery({
    queryKey: ['creditos-cuentas'],
    queryFn: () => apiClient.getAllPages('/cuentas-bancarias'),
    enabled: Boolean(paymentCredit),
  })

  const createMutation = useMutation({
    mutationFn: ({ invoiceId, dueDate }) => apiClient.post(`/facturas/${invoiceId}/credito`, { dueDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creditos'] })
      setCreateOpen(false)
    },
  })

  const payMutation = useMutation({
    mutationFn: ({ creditId, payload }) => apiClient.post(`/creditos/${creditId}/pagos`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creditos'] })
      queryClient.invalidateQueries({ queryKey: ['movimientos-bancarios'] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] })
      setPaymentCredit(null)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ creditId, payload }) => apiClient.patch(`/creditos/${creditId}/estado`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creditos'] })
      setStatusCredit(null)
    },
  })

  if (
    creditsQuery.isLoading ||
    (createOpen && (invoicesQuery.isLoading || creditedInvoicesQuery.isLoading)) ||
    (paymentCredit && accountsQuery.isLoading)
  ) {
    return <CreditsSkeleton />
  }

  if (creditsQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {creditsQuery.error.message}
      </div>
    )
  }

  const credits = creditsQuery.data?.data ?? []
  const totalItems = Number(creditsQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(creditsQuery.data?.totalPages ?? 1))
  const invoices = invoicesQuery.data ?? []
  const accounts = accountsQuery.data ?? []
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + credits.length - 1, totalItems)

  const creditedInvoiceIds = new Set((creditedInvoicesQuery.data ?? []).map((credit) => credit.invoiceId))
  const availableInvoices = invoices.filter(
    (invoice) => invoice.status === 'ACTIVA' && !creditedInvoiceIds.has(invoice.id),
  )

  const summaryCards = [
    {
      label: 'Creditos activos',
      value: formatNumber(
        credits.filter((credit) => ['PENDIENTE', 'PARCIAL'].includes(getDisplayedCreditStatus(credit))).length,
      ),
      help: 'Cuentas por cobrar aun abiertas.',
      icon: CreditCard,
    },
    {
      label: 'Saldo pendiente',
      value: formatCurrency(
        credits.reduce((sum, credit) => sum + Number(credit.balance ?? 0), 0),
      ),
      help: 'Valor pendiente por recaudar en todos los creditos.',
      icon: HandCoins,
    },
    {
      label: 'Creditos pagados',
      value: formatNumber(credits.filter((credit) => credit.status === 'PAGADA').length),
      help: 'Creditos totalmente recaudados.',
      icon: CreditCard,
    },
    {
      label: 'Creditos vencidos',
      value: formatNumber(credits.filter((credit) => getDisplayedCreditStatus(credit) === 'VENCIDA').length),
      help: 'Cuentas que superaron su fecha de vencimiento.',
      icon: HandCoins,
    },
  ]

  async function handleCreateCredit(payload) {
    await toast.promise(createMutation.mutateAsync(payload), {
      loading: 'Creando credito...',
      success: 'Credito creado correctamente',
      error: (error) => error.message,
    })
  }

  async function handlePayCredit(payload) {
    if (!paymentCredit) return

    await toast.promise(payMutation.mutateAsync({ creditId: paymentCredit.id, payload }), {
      loading: 'Registrando pago...',
      success: 'Pago registrado correctamente',
      error: (error) => error.message,
    })
  }

  async function handleUpdateStatus(payload) {
    if (!statusCredit) return

    await toast.promise(statusMutation.mutateAsync({ creditId: statusCredit.id, payload }), {
      loading: 'Actualizando estado...',
      success: 'Estado actualizado',
      error: (error) => error.message,
    })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Creditos · Cuentas por cobrar
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Creditos</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Administra ventas a credito, registra abonos y controla el estado de las cuentas por cobrar.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nuevo credito
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
            <CardTitle>Operacion de creditos</CardTitle>
            <CardDescription>Consulta, abonos y estado de las cuentas por cobrar.</CardDescription>
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
                placeholder="Buscar por factura, cliente o estado..."
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
                <TabsTrigger value="PARCIAL">Parciales</TabsTrigger>
                <TabsTrigger value="VENCIDA">Vencidos</TabsTrigger>
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
                <TableHead>Cliente</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Pagado</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credits.length ? (
                credits.map((credit) => {
                  const displayedStatus = getDisplayedCreditStatus(credit)

                  return (
                    <TableRow key={credit.id}>
                      <TableCell className="font-medium">{credit.invoice?.consecutive ?? `Factura #${credit.invoiceId}`}</TableCell>
                      <TableCell>{`${credit.invoice?.client?.firstName ?? ''} ${credit.invoice?.client?.lastName ?? ''}`}</TableCell>
                      <TableCell>{formatCurrency(credit.totalAmount)}</TableCell>
                      <TableCell>{formatCurrency(credit.paidAmount)}</TableCell>
                      <TableCell>{formatCurrency(credit.balance)}</TableCell>
                      <TableCell>
                        <Badge variant={creditStatusVariants[displayedStatus] ?? 'outline'}>
                          {formatCreditStatus(displayedStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Acciones
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setDetailCredit(credit)}>Ver detalle</DropdownMenuItem>
                            {Number(credit.balance) > 0 ? (
                              <DropdownMenuItem onClick={() => setPaymentCredit(credit)}>Registrar pago</DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onClick={() => setStatusCredit(credit)}>Cambiar estado</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No hay creditos para la vista actual.
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
            singularLabel="credito"
            pluralLabel="creditos"
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <CreateCreditDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        invoices={availableInvoices}
        onSubmit={handleCreateCredit}
        isSubmitting={createMutation.isPending}
      />

      <CreditPaymentDialog
        open={Boolean(paymentCredit)}
        onOpenChange={(open) => !open && setPaymentCredit(null)}
        credit={paymentCredit}
        accounts={accounts.filter((account) => account.isActive !== false)}
        onSubmit={handlePayCredit}
        isSubmitting={payMutation.isPending}
      />

      <CreditStatusDialog
        open={Boolean(statusCredit)}
        onOpenChange={(open) => !open && setStatusCredit(null)}
        credit={statusCredit}
        onSubmit={handleUpdateStatus}
        isSubmitting={statusMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailCredit)}
        onOpenChange={(open) => !open && setDetailCredit(null)}
        title={detailCredit ? `Credito #${detailCredit.id}` : ''}
        description={detailCredit?.invoice?.consecutive ?? ''}
        badge={
          detailCredit
            ? {
                label: formatCreditStatus(getDisplayedCreditStatus(detailCredit)),
                variant: creditStatusVariants[getDisplayedCreditStatus(detailCredit)] ?? 'outline',
              }
            : null
        }
      >
        {detailCredit ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Resumen</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {`${detailCredit.invoice?.client?.firstName ?? ''} ${detailCredit.invoice?.client?.lastName ?? ''}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vencimiento</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatDate(detailCredit.dueDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(detailCredit.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(detailCredit.balance)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary uppercase">Pagos registrados</p>
              {detailCredit.payments.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Monto</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailCredit.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatCurrency(payment.amount)}</TableCell>
                        <TableCell>{payment.bankMovement?.bankAccountId ? `Cuenta #${payment.bankMovement.bankAccountId}` : 'Sin cuenta'}</TableCell>
                        <TableCell>{payment.notes ?? 'Sin notas'}</TableCell>
                        <TableCell>{formatDate(payment.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                  Este credito aun no tiene pagos registrados.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </ModuleDetailsDrawer>
    </div>
  )
}
