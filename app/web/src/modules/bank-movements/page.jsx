import { useDeferredValue, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowLeftRight, Landmark, Plus, Search } from 'lucide-react'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { DEFAULT_ITEMS_PER_PAGE, LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = DEFAULT_ITEMS_PER_PAGE

const bankMovementTypeOptions = [
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'egreso', label: 'Egreso' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'ajuste', label: 'Ajuste' },
]

const bankMovementLabels = {
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
  TRANSFERENCIA_ENTRANTE: 'Transferencia entrante',
  TRANSFERENCIA_SALIENTE: 'Transferencia saliente',
  AJUSTE: 'Ajuste',
}

const bankMovementVariants = {
  INGRESO: 'default',
  EGRESO: 'secondary',
  TRANSFERENCIA_ENTRANTE: 'outline',
  TRANSFERENCIA_SALIENTE: 'outline',
  AJUSTE: 'destructive',
}

const bankMovementSchema = z
  .object({
    type: z.enum(['ingreso', 'egreso', 'transferencia', 'ajuste']),
    bankAccountId: z.number().int().positive().optional(),
    toBankAccountId: z.number().int().positive().optional(),
    amount: z.number().positive('Debe ser mayor a cero').optional(),
    balance: z.number().positive('Debe ser mayor a cero').optional(),
    invoiceId: z.number().int().positive().optional(),
    description: z.string().optional(),
  })
  .superRefine((values, context) => {
    if ((values.type === 'ingreso' || values.type === 'egreso') && !values.bankAccountId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bankAccountId'], message: 'Selecciona la cuenta' })
    }

    if ((values.type === 'ingreso' || values.type === 'egreso' || values.type === 'transferencia') && !values.amount) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'El valor es obligatorio' })
    }

    if (values.type === 'transferencia') {
      if (!values.bankAccountId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['bankAccountId'], message: 'Selecciona la cuenta origen' })
      }

      if (!values.toBankAccountId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['toBankAccountId'], message: 'Selecciona la cuenta destino' })
      }

      if (
        values.bankAccountId &&
        values.toBankAccountId &&
        values.bankAccountId === values.toBankAccountId
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['toBankAccountId'], message: 'Las cuentas deben ser diferentes' })
      }
    }

    if (values.type === 'ajuste') {
      if (!values.bankAccountId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['bankAccountId'], message: 'Selecciona la cuenta' })
      }

      if (values.balance === undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['balance'], message: 'El saldo final es obligatorio' })
      }

      if (!values.description || values.description.trim().length < 3) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['description'], message: 'La descripcion debe tener minimo 3 caracteres' })
      }
    }
  })

function BankMovementsSkeleton() {
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

function formatBankMovementType(value) {
  return bankMovementLabels[value] ?? value ?? 'Movimiento'
}

function buildBankMovementPayload(values) {
  if (values.type === 'ingreso') {
    return {
      path: '/movimientos-bancarios/ingreso',
      payload: {
        bankAccountId: values.bankAccountId,
        amount: values.amount,
        description: values.description?.trim() || undefined,
        invoiceId: values.invoiceId,
      },
    }
  }

  if (values.type === 'egreso') {
    return {
      path: '/movimientos-bancarios/egreso',
      payload: {
        bankAccountId: values.bankAccountId,
        amount: values.amount,
        description: values.description?.trim() || undefined,
        invoiceId: values.invoiceId,
      },
    }
  }

  if (values.type === 'transferencia') {
    return {
      path: '/movimientos-bancarios/transferencia',
      payload: {
        fromBankAccountId: values.bankAccountId,
        toBankAccountId: values.toBankAccountId,
        amount: values.amount,
        description: values.description?.trim() || undefined,
      },
    }
  }

  return {
    path: '/movimientos-bancarios/ajuste',
    payload: {
      bankAccountId: values.bankAccountId,
      balance: values.balance,
      description: values.description?.trim(),
    },
  }
}

function BankMovementDialog({ open, onOpenChange, accounts, invoices, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(bankMovementSchema),
    defaultValues: {
      type: 'ingreso',
      bankAccountId: undefined,
      toBankAccountId: undefined,
      amount: undefined,
      balance: undefined,
      invoiceId: undefined,
      description: '',
    },
  })

  const movementType = form.watch('type')

  function closeDialog(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      form.reset({
        type: 'ingreso',
        bankAccountId: undefined,
        toBankAccountId: undefined,
        amount: undefined,
        balance: undefined,
        invoiceId: undefined,
        description: '',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento bancario</DialogTitle>
          <DialogDescription>
            Registra ingresos, egresos, transferencias o ajustes sobre las cuentas activas.
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
                    {bankMovementTypeOptions.map((option) => (
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
            <div className="grid gap-2">
              <Label>{movementType === 'transferencia' ? 'Cuenta origen' : 'Cuenta bancaria'}</Label>
              <Controller
                name="bankAccountId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : undefined}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {`${account.name} · ${account.bankName}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.bankAccountId ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.bankAccountId.message)}</p>
              ) : null}
            </div>

            {movementType === 'transferencia' ? (
              <div className="grid gap-2">
                <Label>Cuenta destino</Label>
                <Controller
                  name="toBankAccountId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona la cuenta destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={String(account.id)}>
                            {`${account.name} · ${account.bankName}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.toBankAccountId ? (
                  <p className="text-xs text-destructive">{String(form.formState.errors.toBankAccountId.message)}</p>
                ) : null}
              </div>
            ) : null}

            {movementType === 'ajuste' ? (
              <div className="grid gap-2">
                <Label>Saldo final</Label>
                <Input
                  type="number"
                  min="1"
                  {...form.register('balance', { setValueAs: (value) => (value ? Number(value) : undefined) })}
                />
                {form.formState.errors.balance ? (
                  <p className="text-xs text-destructive">{String(form.formState.errors.balance.message)}</p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Valor</Label>
                <Input
                  type="number"
                  min="1"
                  {...form.register('amount', { setValueAs: (value) => (value ? Number(value) : undefined) })}
                />
                {form.formState.errors.amount ? (
                  <p className="text-xs text-destructive">{String(form.formState.errors.amount.message)}</p>
                ) : null}
              </div>
            )}

            {movementType === 'ingreso' || movementType === 'egreso' ? (
              <div className="grid gap-2 md:col-span-2">
                <Label>Factura relacionada</Label>
                <Controller
                  name="invoiceId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : 'none'}
                      onValueChange={(value) => field.onChange(value === 'none' ? undefined : Number(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin factura asociada" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin factura asociada</SelectItem>
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

            <div className="grid gap-2 md:col-span-2">
              <Label>Descripcion</Label>
              <Textarea rows={3} {...form.register('description')} placeholder="Concepto del movimiento" />
              {form.formState.errors.description ? (
                <p className="text-xs text-destructive">{String(form.formState.errors.description.message)}</p>
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

export function BankMovementsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [typeTab, setTypeTab] = useState('TODOS')
  const [currentPage, setCurrentPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailMovement, setDetailMovement] = useState(null)

  const movementsQuery = useQuery({
    queryKey: ['movimientos-bancarios', deferredSearch, typeTab, currentPage],
    queryFn: () =>
      apiClient.get('/movimientos-bancarios', {
        page: currentPage,
        limit: PAGE_SIZE,
        q: deferredSearch,
        movementType: typeTab === 'TODOS' ? undefined : typeTab,
      }),
    placeholderData: (previousData) => previousData,
  })

  const accountsQuery = useQuery({
    queryKey: ['movimientos-bancarios-cuentas'],
    queryFn: () => apiClient.getAllPages('/cuentas-bancarias'),
    enabled: createOpen,
  })

  const invoicesQuery = useQuery({
    queryKey: ['movimientos-bancarios-facturas'],
    queryFn: () => apiClient.getAllPages('/facturas'),
    enabled: createOpen,
  })

  const createMutation = useMutation({
    mutationFn: async (values) => {
      const { path, payload } = buildBankMovementPayload(values)
      return apiClient.post(path, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos-bancarios'] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] })
      queryClient.invalidateQueries({ queryKey: ['creditos'] })
      setCreateOpen(false)
    },
  })

  const movements = movementsQuery.data?.data ?? []
  const accounts = accountsQuery.data ?? []
  const invoices = invoicesQuery.data ?? []
  const totalItems = Number(movementsQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(movementsQuery.data?.totalPages ?? 1))
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + movements.length - 1, totalItems)

  const summaryCards = [
    {
      label: 'Movimientos visibles',
      value: formatNumber(movements.length),
      help: 'Historial cargado desde tesoreria.',
      icon: Landmark,
    },
    {
      label: 'Ingresos',
      value: formatNumber(movements.filter((item) => item.movementType === 'INGRESO').length),
      help: 'Recaudos registrados manualmente o por creditos.',
      icon: Plus,
    },
    {
      label: 'Transferencias',
      value: formatNumber(
        movements.filter((item) => item.movementType.includes('TRANSFERENCIA')).length,
      ),
      help: 'Entradas y salidas entre cuentas propias.',
      icon: ArrowLeftRight,
    },
    {
      label: 'Valor total',
      value: formatCurrency(movements.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)),
      help: 'Suma bruta de montos registrados en el historial.',
      icon: Landmark,
    },
  ]

  if (movementsQuery.isLoading || (createOpen && (accountsQuery.isLoading || invoicesQuery.isLoading))) {
    return <BankMovementsSkeleton />
  }

  if (movementsQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {movementsQuery.error.message}
      </div>
    )
  }

  async function handleCreateMovement(values) {
    await toast.promise(createMutation.mutateAsync(values), {
      loading: 'Registrando movimiento...',
      success: 'Movimiento bancario registrado',
      error: (error) => error.message,
    })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Bancos · Tesoreria
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Movimientos bancarios
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Registra ingresos, egresos, transferencias y ajustes sobre las cuentas activas del sistema.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
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
            <CardTitle>Historial bancario</CardTitle>
            <CardDescription>Consulta trazabilidad financiera por cuenta y factura asociada.</CardDescription>
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
                placeholder="Buscar por cuenta, tipo o factura..."
                className="pl-9"
              />
            </div>
            <Tabs
              value={typeTab}
                onValueChange={(value) => {
                  setTypeTab(value)
                  setCurrentPage(1)
                }}
            >
              <TabsList>
                <TabsTrigger value="TODOS">Todos</TabsTrigger>
                <TabsTrigger value="INGRESO">Ingresos</TabsTrigger>
                <TabsTrigger value="EGRESO">Egresos</TabsTrigger>
                <TabsTrigger value="AJUSTE">Ajustes</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length ? (
                movements.map((movement) => (
                  <TableRow key={movement.id} className="cursor-pointer" onClick={() => setDetailMovement(movement)}>
                    <TableCell>
                      <Badge variant={bankMovementVariants[movement.movementType] ?? 'outline'}>
                        {formatBankMovementType(movement.movementType)}
                      </Badge>
                    </TableCell>
                    <TableCell>{movement.bankAccount?.name ?? `Cuenta #${movement.bankAccountId}`}</TableCell>
                    <TableCell>{formatCurrency(movement.amount)}</TableCell>
                    <TableCell>{movement.invoice?.consecutive ?? 'Sin factura'}</TableCell>
                    <TableCell>{movement.description ?? 'Sin descripcion'}</TableCell>
                    <TableCell>{formatDate(movement.createdAt)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No hay movimientos para la vista actual.
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
            singularLabel="movimiento"
            pluralLabel="movimientos"
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <BankMovementDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts.filter((account) => account.isActive !== false)}
        invoices={invoices.filter((invoice) => invoice.status === 'ACTIVA')}
        onSubmit={handleCreateMovement}
        isSubmitting={createMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailMovement)}
        onOpenChange={(open) => !open && setDetailMovement(null)}
        title={detailMovement ? `Movimiento #${detailMovement.id}` : ''}
        description={detailMovement?.bankAccount?.name ?? ''}
        badge={
          detailMovement
            ? {
                label: formatBankMovementType(detailMovement.movementType),
                variant: bankMovementVariants[detailMovement.movementType] ?? 'outline',
              }
            : null
        }
        fields={
          detailMovement
            ? [
                {
                  label: 'Movimiento',
                  items: [
                    { label: 'Cuenta', value: detailMovement.bankAccount?.name ?? `Cuenta #${detailMovement.bankAccountId}` },
                    { label: 'Monto', value: formatCurrency(detailMovement.amount) },
                    { label: 'Factura', value: detailMovement.invoice?.consecutive ?? 'Sin factura' },
                    { label: 'Descripcion', value: detailMovement.description ?? 'Sin descripcion' },
                  ],
                },
                {
                  label: 'Trazabilidad',
                  items: [
                    { label: 'Tipo', value: formatBankMovementType(detailMovement.movementType) },
                    { label: 'Fecha', value: formatDate(detailMovement.createdAt) },
                    { label: 'Banco', value: detailMovement.bankAccount?.bankName ?? 'Sin banco' },
                  ],
                },
              ]
            : []
        }
      />
    </div>
  )
}
