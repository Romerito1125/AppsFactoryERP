import { useDeferredValue, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Link2, Plus, Search, Sparkles } from 'lucide-react'
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
import { formatDate, formatNumber, matchesSearch } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { DEFAULT_ITEMS_PER_PAGE, LocalPagination, useLocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = DEFAULT_ITEMS_PER_PAGE

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
            <Input type="number" min="0" {...form.register('referralLevel', { setValueAs: (value) => Number(value) })} />
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
    enabled: view === 'clients' || createOpen || Boolean(levelClient) || Boolean(selectedClient),
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

  if (
    referralsQuery.isLoading ||
    ((view === 'clients' || createOpen || levelClient || selectedClient) && clientsQuery.isLoading) ||
    (createOpen && referralLookupQuery.isLoading)
  ) {
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

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Referidos · CRM
          </Badge>
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
            <CardDescription>Relaciones creadas y clientes con gestion de codigo.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 md:flex-row lg:w-auto">
            <div className="relative min-w-[260px]">
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
            <Tabs
              value={view}
                onValueChange={(value) => {
                  setView(value)
                  setCurrentPage(1)
                  setClientPage(1)
                }}
            >
              <TabsList>
                <TabsTrigger value="relations">Relaciones</TabsTrigger>
                <TabsTrigger value="clients">Clientes</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {view === 'relations' ? (
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
          ) : (
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
                        <Badge variant={client.isActive ? 'default' : 'secondary'}>
                          {client.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">Acciones</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => handleGenerateCode(client)}>
                              Generar codigo
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setLevelClient(client)}>
                              Actualizar nivel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSelectedClient(client)}>
                              Ver referidos del cliente
                            </DropdownMenuItem>
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
          )}

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
                    { label: 'Refiere', value: `${detailReferral.referrerClient.firstName} ${detailReferral.referrerClient.lastName}` },
                    { label: 'Referido', value: `${detailReferral.referredClient.firstName} ${detailReferral.referredClient.lastName}` },
                    { label: 'Fecha', value: formatDate(detailReferral.createdAt) },
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
