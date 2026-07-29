import { useDeferredValue, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  CircleDollarSign,
  Link2,
  Network,
  Percent,
  Plus,
  Save,
  Search,
  Settings2,
  ShoppingCart,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'

import { getStoredSession } from '@/auth/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatNumber, matchesSearch } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { DEFAULT_ITEMS_PER_PAGE, LocalPagination, useLocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = DEFAULT_ITEMS_PER_PAGE
const PROFIT_CONFIGURATION_PATH = '/referidos/politicas-utilidad'

function getArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
    if (Array.isArray(payload?.data?.[key])) return payload.data[key]
  }

  return []
}

function getNumber(records, keys, fallback = 0) {
  for (const record of records) {
    for (const key of keys) {
      const value = record?.[key]
      if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
        return Number(value)
      }
    }
  }

  return fallback
}

function getGeneration(record) {
  return getNumber([record], ['generation', 'generacion', 'level', 'nivel'], 0)
}

function normalizePolicies(payload) {
  return getArray(payload, ['policies', 'politicas', 'generations', 'generaciones', 'configuration', 'configuracion'])
    .map((policy) => ({
      ...policy,
      generation: getGeneration(policy),
      percentage: getNumber([policy], ['percentage', 'porcentaje', 'profitPercentage', 'utilityPercentage']),
      isActive: policy.isActive ?? policy.activa ?? policy.active ?? true,
    }))
    .filter((policy) => policy.generation > 0)
    .sort((left, right) => left.generation - right.generation)
}

function normalizeGenerationRows(networkPayload, statsPayload, policies) {
  const networkGenerations = getArray(networkPayload, ['generations', 'generaciones', 'levels', 'niveles'])
  const statsGenerations = getArray(statsPayload, [
    'generations',
    'generaciones',
    'generationStats',
    'estadisticasPorGeneracion',
    'resumenPorGeneracion',
  ])
  const salesGenerations = getArray(statsPayload, ['ventasPorGeneracion', 'comprasPorGeneracion'])
  const commissionGenerations = getArray(statsPayload, ['comisionPorGeneracion', 'descuentosPorGeneracion'])
  const profitGenerations = getArray(statsPayload, ['utilidadPorGeneracion', 'utilidadesPorGeneracion'])
  const benefitGenerations = getArray(statsPayload, ['beneficiosPorGeneracion', 'benefitsByGeneration'])
  const generations = new Set()

  ;[
    ...networkGenerations,
    ...statsGenerations,
    ...salesGenerations,
    ...commissionGenerations,
    ...profitGenerations,
    ...benefitGenerations,
    ...policies,
  ].forEach((record) => {
    const generation = getGeneration(record)
    if (generation > 0) generations.add(generation)
  })

  return [...generations]
    .sort((left, right) => left - right)
    .map((generation) => {
      const network = networkGenerations.find((record) => getGeneration(record) === generation) ?? {}
      const stats = statsGenerations.find((record) => getGeneration(record) === generation) ?? {}
      const sales = salesGenerations.find((record) => getGeneration(record) === generation) ?? {}
      const commission = commissionGenerations.find((record) => getGeneration(record) === generation) ?? {}
      const profit = profitGenerations.find((record) => getGeneration(record) === generation) ?? {}
      const benefit = benefitGenerations.find((record) => getGeneration(record) === generation) ?? {}
      const policy = policies.find((record) => getGeneration(record) === generation) ?? {}
      const records = [stats, sales, commission, profit, benefit, network]
      const clients = getArray(network, ['clients', 'clientes', 'members', 'miembros'])
      const percentage = getNumber([stats, commission, benefit, policy], ['percentage', 'porcentaje'], NaN)
      const commissionRate = getNumber([stats, commission], ['commissionRate', 'tasaComision'], NaN)

      return {
        generation,
        clients,
        clientCount: getNumber(records, ['totalClientes', 'clientCount', 'cantidadClientes'], clients.length),
        purchases: getNumber(records, ['purchases', 'compras', 'totalPurchases', 'totalCompras', 'totalVendido', 'total']),
        profit: getNumber(records, [
          'profit',
          'utilidad',
          'baseProfit',
          'utilidadBase',
          'utilidadBaseHistorica',
          'totalProfit',
          'utilidadTotal',
        ]),
        percentage: Number.isFinite(percentage)
          ? percentage
          : Number.isFinite(commissionRate)
            ? commissionRate * 100
            : getNumber([policy], ['percentage', 'porcentaje']),
        generatedDiscount: getNumber(records, [
          'generatedDiscount',
          'descuentoGenerado',
          'generatedBenefit',
          'beneficioGenerado',
          'commission',
          'comision',
          'amount',
          'monto',
        ]),
        availableDiscount: getNumber(records, [
          'availableDiscount',
          'descuentoDisponible',
          'availableBenefit',
          'beneficioDisponible',
          'remainingAmount',
          'montoDisponible',
        ]),
      }
    })
}

async function putProfitConfiguration(payload) {
  if (typeof apiClient.put === 'function') {
    return apiClient.put(PROFIT_CONFIGURATION_PATH, payload)
  }

  const baseUrl = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}${PROFIT_CONFIGURATION_PATH}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(getStoredSession()?.accessToken ? { Authorization: `Bearer ${getStoredSession().accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let responsePayload

  try {
    responsePayload = text ? JSON.parse(text) : null
  } catch {
    responsePayload = text
  }

  if (!response.ok) {
    const message = Array.isArray(responsePayload?.message) ? responsePayload.message.join(', ') : responsePayload?.message
    throw new Error(message || 'No se pudo guardar la configuracion de utilidades')
  }

  return responsePayload
}

const createReferralSchema = z.object({
  referredClientId: z.number({ message: 'Selecciona un cliente' }).int().positive('Selecciona un cliente'),
  codeUsed: z.string().min(3, 'Minimo 3 caracteres'),
})

const referralLevelSchema = z.object({
  referralLevel: z.number({ message: 'Nivel obligatorio' }).int().min(0, 'No puede ser negativo'),
})

function ReferralsSkeleton() {
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

function CreateReferralDialog({ open, onOpenChange, clients, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(createReferralSchema),
    defaultValues: { referredClientId: undefined, codeUsed: '' },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo referido</DialogTitle>
          <DialogDescription>Relaciona un cliente con un codigo de referido existente.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <Label>Cliente referido</Label>
            <Controller
              name="referredClientId"
              control={form.control}
              render={({ field }) => (
                <NativeSelect
                  value={field.value ? String(field.value) : ''}
                  onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                >
                  <option value="">Selecciona un cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={String(client.id)}>
                      {`${client.firstName} ${client.lastName} · ${client.identification}`}
                    </option>
                  ))}
                </NativeSelect>
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label>Codigo usado</Label>
            <Input {...form.register('codeUsed')} placeholder="ABCD1234" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando...' : 'Crear referido'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReferralLevelDialog({ open, onOpenChange, client, onSubmit, isSubmitting }) {
  const form = useForm({
    resolver: zodResolver(referralLevelSchema),
    defaultValues: { referralLevel: Number(client?.referralLevel ?? 0) },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar nivel</DialogTitle>
          <DialogDescription>Ajusta manualmente el nivel de referido del cliente seleccionado.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <Label>Nivel</Label>
            <Input
              type="number"
              min="0"
              {...form.register('referralLevel', {
                setValueAs: (value) => Number(value),
              })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar nivel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReferralNetworkView({ clients, selectedRootId, onRootChange, networkQuery, statsQuery, policies, policiesError }) {
  const selectedClient = clients.find((client) => client.id === Number(selectedRootId))
  const rows = normalizeGenerationRows(networkQuery.data, statsQuery.data, policies)
  const stats = statsQuery.data?.data ?? statsQuery.data ?? {}
  const totalNetwork = getNumber(
    [stats],
    ['totalReferidosRed', 'totalNetwork', 'totalRed'],
    rows.reduce((sum, row) => sum + row.clientCount, 0),
  )
  const totalPurchases = getNumber(
    [stats],
    ['totalCompradoPorReferidos', 'totalPurchases', 'totalCompras'],
    rows.reduce((sum, row) => sum + row.purchases, 0),
  )
  const totalProfit = getNumber(
    [stats],
    ['totalReferralProfit', 'utilidadTotalReferidos', 'totalProfit', 'utilidadTotal', 'utilidadBaseHistorica'],
    rows.reduce((sum, row) => sum + row.profit, 0),
  )
  const generatedDiscount = getNumber(
    [stats],
    ['generatedDiscount', 'descuentoGenerado', 'totalGeneratedBenefit', 'beneficioTotalGenerado', 'comisionGanada'],
    rows.reduce((sum, row) => sum + row.generatedDiscount, 0),
  )
  const availableDiscount = getNumber(
    [stats],
    ['availableDiscount', 'descuentoDisponible', 'totalAvailableBenefit', 'beneficioTotalDisponible'],
    rows.reduce((sum, row) => sum + row.availableDiscount, 0),
  )
  const totals = [
    {
      label: 'Clientes en la red',
      value: formatNumber(totalNetwork),
      icon: Users,
    },
    {
      label: 'Compras de la red',
      value: formatCurrency(totalPurchases),
      icon: ShoppingCart,
    },
    {
      label: 'Utilidad base',
      value: formatCurrency(totalProfit),
      icon: CircleDollarSign,
    },
    {
      label: 'Descuento generado',
      value: formatCurrency(generatedDiscount),
      icon: Percent,
    },
    {
      label: 'Descuento disponible',
      value: formatCurrency(availableDiscount),
      icon: WalletCards,
    },
  ]

  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Network className="size-4 text-primary" />
              Cliente raiz
            </div>
            <p className="text-sm text-muted-foreground">
              Selecciona el cliente que recibira el descuento generado por las compras de su red.
            </p>
          </div>
          <NativeSelect value={selectedRootId} onChange={(event) => onRootChange(event.target.value)}>
            <option value="">Selecciona un cliente activo</option>
            {clients
              .filter((client) => client.isActive)
              .map((client) => (
                <option key={client.id} value={String(client.id)}>
                  {`${client.firstName} ${client.lastName} · ${client.identification}`}
                </option>
              ))}
          </NativeSelect>
        </div>
      </div>

      {!selectedRootId ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-6 py-14 text-center">
          <Network className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-medium text-foreground">Selecciona un cliente para consultar su red</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Los datos se calculan con compras y beneficios registrados en la base de datos.
          </p>
        </div>
      ) : networkQuery.isLoading || statsQuery.isLoading ? (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : networkQuery.isError || statsQuery.isError ? (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive">
          {(networkQuery.error ?? statsQuery.error).message}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-foreground">{`${selectedClient?.firstName ?? ''} ${selectedClient?.lastName ?? ''}`.trim()}</p>
              <p className="text-xs text-muted-foreground">Resumen acumulado de todas las generaciones</p>
            </div>
            {policiesError ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">No fue posible cargar los porcentajes configurados.</p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {totals.map((total) => {
              const Icon = total.icon
              return (
                <div key={total.label} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-muted-foreground">{total.label}</p>
                    <Icon className="size-4 text-primary" />
                  </div>
                  <p className="text-lg font-semibold tracking-tight text-foreground">{total.value}</p>
                </div>
              )
            })}
          </div>

          {rows.length ? (
            <div className="grid gap-4">
              {rows.map((row) => (
                <div key={row.generation} className="overflow-hidden rounded-2xl border border-border/70 bg-background/60">
                  <div className="flex flex-col gap-2 border-b border-border/70 bg-primary/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                        {row.generation}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Generacion {row.generation}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(row.clientCount)} {row.clientCount === 1 ? 'cliente' : 'clientes'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{formatNumber(row.percentage)}% de la utilidad</Badge>
                  </div>

                  <div className="grid gap-px bg-border/70 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      ['Compras', formatCurrency(row.purchases)],
                      ['Utilidad', formatCurrency(row.profit)],
                      ['Porcentaje', `${formatNumber(row.percentage)}%`],
                      ['Descuento generado', formatCurrency(row.generatedDiscount)],
                      ['Descuento disponible', formatCurrency(row.availableDiscount)],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-card px-4 py-4 md:px-5">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 font-semibold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="px-4 py-4 md:px-5">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Clientes de esta generacion</p>
                    {row.clients.length ? (
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {row.clients.map((record) => {
                          const client = record.client ?? record.cliente ?? record
                          return (
                            <div
                              key={client.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {`${client.firstName ?? client.nombre ?? ''} ${client.lastName ?? client.apellido ?? ''}`.trim()}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {client.identification ?? client.identificacion ?? 'Sin documento'}
                                </p>
                              </div>
                              <span
                                className={`size-2 shrink-0 rounded-full ${client.isActive === false ? 'bg-muted-foreground/40' : 'bg-emerald-500'}`}
                              />
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No hay clientes registrados en esta generacion.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
              Este cliente aun no tiene generaciones de referidos registradas.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ProfitConfigurationForm({ policies, onSave, isSubmitting }) {
  const [draft, setDraft] = useState(() =>
    policies.map((policy) => ({
      ...policy,
      percentage: String(policy.percentage),
    })),
  )
  const hasErrors = draft.some((policy) => {
    const percentage = Number(policy.percentage)
    return policy.percentage === '' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100
  })

  function handlePercentageChange(generation, percentage) {
    setDraft((current) => current.map((policy) => (policy.generation === generation ? { ...policy, percentage } : policy)))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (hasErrors) return

    onSave(
      draft.map((policy) => ({
        generation: policy.generation,
        percentage: Number(policy.percentage),
        isActive: policy.isActive,
      })),
    )
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Settings2 className="size-5" />
          </div>
          <div>
            <p className="font-medium text-foreground">Reparto de utilidades por generacion</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Define el porcentaje de la utilidad de cada compra que se convierte en descuento para el cliente raiz.
            </p>
          </div>
        </div>
      </div>

      {draft.length ? (
        <div className="grid gap-3">
          {draft.map((policy) => {
            const percentage = Number(policy.percentage)
            const hasError = policy.percentage === '' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100

            return (
              <div
                key={policy.generation}
                className="grid gap-4 rounded-2xl border border-border/70 bg-background/60 p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center md:p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary">
                    {policy.generation}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">Generacion {policy.generation}</p>
                      <Badge variant={policy.isActive ? 'default' : 'secondary'}>{policy.isActive ? 'Activa' : 'Inactiva'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Porcentaje aplicado sobre la utilidad base de sus compras.</p>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`generation-${policy.generation}`}>Porcentaje</Label>
                  <div className="relative">
                    <Input
                      id={`generation-${policy.generation}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={policy.percentage}
                      onChange={(event) => handlePercentageChange(policy.generation, event.target.value)}
                      className="pr-9"
                      aria-invalid={hasError}
                    />
                    <Percent className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  {hasError ? <p className="text-xs text-destructive">Ingresa un valor entre 0 y 100.</p> : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          No hay generaciones configuradas en la base de datos.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!draft.length || hasErrors || isSubmitting}>
          <Save className="mr-2 size-4" />
          {isSubmitting ? 'Guardando...' : 'Guardar configuracion'}
        </Button>
      </div>
    </form>
  )
}

function ProfitConfigurationView({ query, onSave, isSubmitting }) {
  if (query.isLoading) {
    return <Skeleton className="h-72 rounded-2xl" />
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive">{query.error.message}</div>
    )
  }

  return (
    <ProfitConfigurationForm
      key={query.dataUpdatedAt}
      policies={normalizePolicies(query.data)}
      onSave={onSave}
      isSubmitting={isSubmitting}
    />
  )
}

export function ReferralsPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState('relations')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [currentPage, setCurrentPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [levelClient, setLevelClient] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [detailReferral, setDetailReferral] = useState(null)
  const [selectedRootId, setSelectedRootId] = useState('')

  const referralsQuery = useQuery({
    queryKey: ['referidos', deferredSearch, currentPage],
    queryFn: () =>
      apiClient.get('/referidos', {
        page: currentPage,
        limit: PAGE_SIZE,
        q: deferredSearch,
      }),
    placeholderData: (previousData) => previousData,
  })
  const clientsQuery = useQuery({
    queryKey: ['referidos-clientes'],
    queryFn: () => apiClient.getAllPages('/clientes', { estado: 'todos' }),
  })

  const referralLookupQuery = useQuery({
    queryKey: ['referidos-lookup'],
    queryFn: () => apiClient.getAllPages('/referidos'),
    enabled: createOpen,
  })

  const clientReferralsQuery = useQuery({
    queryKey: ['cliente-referidos', selectedClient?.id],
    queryFn: () => apiClient.get(`/clientes/${selectedClient.id}/referidos`),
    enabled: Boolean(selectedClient),
  })

  const profitPoliciesQuery = useQuery({
    queryKey: ['referidos-politicas-utilidad'],
    queryFn: () => apiClient.get(PROFIT_CONFIGURATION_PATH),
    enabled: view === 'network' || view === 'configuration',
  })

  const referralNetworkQuery = useQuery({
    queryKey: ['cliente-red-referidos', selectedRootId],
    queryFn: () => apiClient.get(`/clientes/${selectedRootId}/red-referidos`),
    enabled: view === 'network' && Boolean(selectedRootId),
  })

  const referralStatsQuery = useQuery({
    queryKey: ['cliente-estadisticas-referidos', selectedRootId],
    queryFn: () => apiClient.get(`/clientes/${selectedRootId}/estadisticas-referidos`),
    enabled: view === 'network' && Boolean(selectedRootId),
  })

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/referidos', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referidos'] })
      setCreateOpen(false)
    },
  })

  const generateCodeMutation = useMutation({
    mutationFn: (clientId) => apiClient.post(`/clientes/${clientId}/codigo-referido`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referidos-clientes'] })
    },
  })

  const updateLevelMutation = useMutation({
    mutationFn: ({ clientId, payload }) => apiClient.patch(`/clientes/${clientId}/nivel-referido`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referidos-clientes'] })
      setLevelClient(null)
    },
  })

  const updateProfitPoliciesMutation = useMutation({
    mutationFn: (policies) => putProfitConfiguration(policies),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['referidos-politicas-utilidad'],
      })
      queryClient.invalidateQueries({
        queryKey: ['cliente-estadisticas-referidos'],
      })
    },
  })

  const referrals = referralsQuery.data?.data ?? []
  const totalItems = Number(referralsQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(referralsQuery.data?.totalPages ?? 1))
  const clients = clientsQuery.data ?? []
  const referralLookup = referralLookupQuery.data ?? []
  const referredClientIds = new Set(referralLookup.map((referral) => referral.referredClient.id))
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + referrals.length - 1, totalItems)

  const visibleClients = clients.filter((client) =>
    matchesSearch(client, deferredSearch, (record) => [
      record.identification,
      `${record.firstName} ${record.lastName}`,
      record.referralCode,
      String(record.referralLevel),
    ]),
  )

  const {
    currentPage: clientPage,
    setCurrentPage: setClientPage,
    paginatedItems: paginatedRecords,
    totalItems: totalClientItems,
    totalPages: totalClientPages,
    startItem: clientStartItem,
    endItem: clientEndItem,
  } = useLocalPagination(visibleClients)

  const eligibleClients = clients.filter((client) => client.isActive && !referredClientIds.has(client.id))

  if (referralsQuery.isLoading || clientsQuery.isLoading || (createOpen && referralLookupQuery.isLoading)) {
    return <ReferralsSkeleton />
  }

  if (referralsQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {referralsQuery.error.message}
      </div>
    )
  }

  const summaryCards = [
    {
      label: 'Referidos registrados',
      value: formatNumber(referrals.length),
      help: 'Relaciones creadas dentro del sistema.',
      icon: Link2,
    },
    {
      label: 'Clientes con codigo',
      value: formatNumber(clients.filter((client) => client.referralCode).length),
      help: 'Clientes listos para compartir codigo.',
      icon: Sparkles,
    },
    {
      label: 'Clientes con nivel',
      value: formatNumber(clients.filter((client) => Number(client.referralLevel ?? 0) > 0).length),
      help: 'Clientes con nivel de referido superior a cero.',
      icon: Link2,
    },
    {
      label: 'Elegibles para relacion',
      value: formatNumber(eligibleClients.length),
      help: 'Clientes activos que aun no han sido relacionados como referidos.',
      icon: Sparkles,
    },
  ]

  async function handleCreateReferral(payload) {
    await toast.promise(createMutation.mutateAsync(payload), {
      loading: 'Creando referido...',
      success: 'Referido creado correctamente',
      error: (error) => error.message,
    })
  }

  async function handleGenerateCode(client) {
    await toast.promise(generateCodeMutation.mutateAsync(client.id), {
      loading: 'Generando codigo...',
      success: 'Codigo de referido disponible',
      error: (error) => error.message,
    })
  }

  async function handleUpdateLevel(payload) {
    if (!levelClient) return

    await toast.promise(updateLevelMutation.mutateAsync({ clientId: levelClient.id, payload }), {
      loading: 'Actualizando nivel...',
      success: 'Nivel actualizado',
      error: (error) => error.message,
    })
  }

  async function handleSavePolicies(policies) {
    if (policies.some((policy) => !Number.isFinite(policy.percentage) || policy.percentage < 0 || policy.percentage > 100)) {
      return
    }

    await toast.promise(updateProfitPoliciesMutation.mutateAsync(policies), {
      loading: 'Guardando reparto de utilidades...',
      success: 'Reparto de utilidades actualizado',
      error: (error) => error.message,
    })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">Referidos · CRM</Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Referidos</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Consulta la red de referidos, genera codigos por cliente y administra el nivel de referencia comercial.
          </p>
        </div>
        <Button className="rounded-full px-5" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nuevo referido
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
            <CardTitle>Operacion de referidos</CardTitle>
            <CardDescription>Administra relaciones, red y reparto de utilidades.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row">
            {view === 'relations' || view === 'clients' ? (
              <div className="relative w-full xl:min-w-[260px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setCurrentPage(1)
                    setClientPage(1)
                  }}
                  placeholder="Buscar por cliente, codigo o documento..."
                  className="pl-9"
                />
              </div>
            ) : null}
            <Tabs
              value={view}
              onValueChange={(value) => {
                setView(value)
                setCurrentPage(1)
                setClientPage(1)
              }}
            >
              <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4 xl:w-auto">
                <TabsTrigger value="relations">Relaciones</TabsTrigger>
                <TabsTrigger value="clients">Clientes</TabsTrigger>
                <TabsTrigger value="network">Red</TabsTrigger>
                <TabsTrigger value="configuration">Configuracion</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {view === 'relations' ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Codigo usado</TableHead>
                    <TableHead>Refiere</TableHead>
                    <TableHead>Referido</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.length ? (
                    referrals.map((referral) => (
                      <TableRow key={referral.id} className="cursor-pointer" onClick={() => setDetailReferral(referral)}>
                        <TableCell className="font-medium">{referral.codeUsed}</TableCell>
                        <TableCell>{`${referral.referrerClient.firstName} ${referral.referrerClient.lastName}`}</TableCell>
                        <TableCell>{`${referral.referredClient.firstName} ${referral.referredClient.lastName}`}</TableCell>
                        <TableCell>{formatDate(referral.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                        No hay relaciones para la vista actual.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {view === 'clients' ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Codigo</TableHead>
                    <TableHead>Nivel</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleClients.length ? (
                    paginatedRecords.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{`${client.firstName} ${client.lastName}`}</p>
                            <p className="text-xs text-muted-foreground">{client.identification}</p>
                          </div>
                        </TableCell>
                        <TableCell>{client.referralCode ?? 'Sin codigo'}</TableCell>
                        <TableCell>{formatNumber(client.referralLevel ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={client.isActive ? 'default' : 'secondary'}>{client.isActive ? 'Activo' : 'Inactivo'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                Acciones
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => handleGenerateCode(client)}>Generar codigo</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLevelClient(client)}>Actualizar nivel</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setSelectedClient(client)}>Ver referidos del cliente</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                        No hay clientes para la vista actual.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {view === 'network' ? (
            <ReferralNetworkView
              clients={clients}
              selectedRootId={selectedRootId}
              onRootChange={setSelectedRootId}
              networkQuery={referralNetworkQuery}
              statsQuery={referralStatsQuery}
              policies={normalizePolicies(profitPoliciesQuery.data)}
              policiesError={profitPoliciesQuery.isError}
            />
          ) : null}

          {view === 'configuration' ? (
            <ProfitConfigurationView
              query={profitPoliciesQuery}
              onSave={handleSavePolicies}
              isSubmitting={updateProfitPoliciesMutation.isPending}
            />
          ) : null}

          {view === 'relations' || view === 'clients' ? (
            <LocalPagination
              currentPage={view === 'relations' ? currentPage : clientPage}
              totalPages={view === 'relations' ? totalPages : totalClientPages}
              totalItems={view === 'relations' ? totalItems : totalClientItems}
              startItem={view === 'relations' ? startItem : clientStartItem}
              endItem={view === 'relations' ? endItem : clientEndItem}
              singularLabel={view === 'relations' ? 'relacion' : 'cliente'}
              pluralLabel={view === 'relations' ? 'relaciones' : 'clientes'}
              onPageChange={view === 'relations' ? setCurrentPage : setClientPage}
            />
          ) : null}
        </CardContent>
      </Card>

      <CreateReferralDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={eligibleClients}
        onSubmit={handleCreateReferral}
        isSubmitting={createMutation.isPending}
      />

      <ReferralLevelDialog
        open={Boolean(levelClient)}
        onOpenChange={(open) => !open && setLevelClient(null)}
        client={levelClient}
        onSubmit={handleUpdateLevel}
        isSubmitting={updateLevelMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailReferral)}
        onOpenChange={(open) => !open && setDetailReferral(null)}
        title={detailReferral ? `Referido #${detailReferral.id}` : ''}
        description={detailReferral?.codeUsed ?? ''}
        badge={detailReferral ? { label: 'Activo', variant: 'default' } : null}
        fields={
          detailReferral
            ? [
                {
                  label: 'Relacion',
                  items: [
                    { label: 'Codigo usado', value: detailReferral.codeUsed },
                    {
                      label: 'Refiere',
                      value: `${detailReferral.referrerClient.firstName} ${detailReferral.referrerClient.lastName}`,
                    },
                    {
                      label: 'Referido',
                      value: `${detailReferral.referredClient.firstName} ${detailReferral.referredClient.lastName}`,
                    },
                    {
                      label: 'Fecha',
                      value: formatDate(detailReferral.createdAt),
                    },
                  ],
                },
              ]
            : []
        }
      />

      <ModuleDetailsDrawer
        open={Boolean(selectedClient)}
        onOpenChange={(open) => !open && setSelectedClient(null)}
        title={selectedClient ? `Referidos de ${selectedClient.firstName}` : ''}
        description={selectedClient?.referralCode ?? 'Sin codigo'}
      >
        <div className="grid gap-4">
          {clientReferralsQuery.isLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : clientReferralsQuery.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientReferralsQuery.data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{`${item.referredClient.firstName} ${item.referredClient.lastName}`}</TableCell>
                    <TableCell>{item.referredClient.identification}</TableCell>
                    <TableCell>{formatDate(item.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              Este cliente aun no tiene referidos asociados.
            </div>
          )}
        </div>
      </ModuleDetailsDrawer>
    </div>
  )
}
