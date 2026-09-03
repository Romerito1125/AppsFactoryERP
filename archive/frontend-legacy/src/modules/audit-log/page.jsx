import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiClient } from '@/lib/api-client'
import { formatDate, formatNumber, formatRole } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { LocalPagination } from '@/modules/shared/local-pagination'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const PAGE_SIZE = 20

const moduleOptions = [
  'TODOS',
  'USUARIOS',
  'PROVEEDORES',
  'PRODUCTOS',
  'PRECIOS_PRODUCTO',
  'INVENTARIO',
  'REFERIDOS',
  'CLIENTES',
  'FACTURAS',
  'BODEGAS',
]

const actionGroupOptions = [
  { value: 'TODOS', label: 'Todas las acciones' },
  { value: 'ELIMINACIONES', label: 'Eliminaciones' },
  { value: 'CREACIONES', label: 'Creaciones' },
  { value: 'MODIFICACIONES', label: 'Modificaciones' },
  { value: 'APROBACIONES', label: 'Aprobaciones' },
  { value: 'MOVIMIENTOS', label: 'Movimientos' },
]

function AuditLogSkeleton() {
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

function formatModuleLabel(value) {
  return String(value ?? '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function getActionVariant(action) {
  if (String(action).includes('DEACTIVATE')) return 'secondary'
  if (String(action).includes('APPROVE')) return 'default'
  if (String(action).includes('CHANGE')) return 'outline'
  return 'outline'
}

export function AuditLogPage() {
  const [search, setSearch] = useState('')
  const [module, setModule] = useState('TODOS')
  const [actionGroup, setActionGroup] = useState('TODOS')
  const [userId, setUserId] = useState('TODOS')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedLog, setSelectedLog] = useState(null)

  const usersQuery = useQuery({
    queryKey: ['auditoria-usuarios'],
    queryFn: () => apiClient.getAllPages('/usuarios'),
  })

  const logsQuery = useQuery({
    queryKey: ['auditoria', search, module, actionGroup, userId, startDate, endDate, currentPage],
    queryFn: () =>
      apiClient.get('/auditoria', {
        q: search || undefined,
        module: module === 'TODOS' ? undefined : module,
        actionGroup: actionGroup === 'TODOS' ? undefined : actionGroup,
        userId: userId === 'TODOS' ? undefined : Number(userId),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })

  const records = logsQuery.data?.data ?? []
  const totalItems = Number(logsQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(logsQuery.data?.totalPages ?? 1))
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + records.length - 1, totalItems)

  const summaryCards = [
    {
      label: 'Eventos visibles',
      value: formatNumber(totalItems),
      help: 'Registros que cumplen con el filtro actual.',
    },
    {
      label: 'Usuarios con actividad',
      value: formatNumber(new Set(records.map((item) => item.userId).filter(Boolean)).size),
      help: 'Usuarios presentes en la pagina cargada.',
    },
    {
      label: 'Modulos auditados',
      value: formatNumber(new Set(records.map((item) => item.module).filter(Boolean)).size),
      help: 'Cobertura visible de acciones auditadas.',
    },
    {
      label: 'Cambios de precio',
      value: formatNumber(records.filter((item) => String(item.action).includes('PRICE')).length),
      help: 'Eventos de precio en la pagina actual.',
    },
  ]

  if (logsQuery.isLoading || usersQuery.isLoading) {
    return <AuditLogSkeleton />
  }

  if (logsQuery.isError) {
    return <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">{logsQuery.error.message}</div>
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl">{card.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{card.help}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" />
            Historial de acciones
          </CardTitle>
          <CardDescription>
            Organiza la trazabilidad por tipo de acción para revisar eliminaciones, cambios y movimientos por separado.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Tabs value={actionGroup} onValueChange={(value) => { setActionGroup(value); setCurrentPage(1) }}>
            <TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-2xl p-1">
              {actionGroupOptions.map((option) => (
                <TabsTrigger key={option.value} value={option.value} className="rounded-xl px-3 py-2 text-xs">
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_minmax(280px,1.1fr)_180px_180px_auto] 2xl:grid-cols-[minmax(320px,1.3fr)_200px_minmax(340px,1.3fr)_190px_190px_auto] xl:items-end">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Buscar por usuario, accion, entidad o descripcion..."
                className="pl-9"
              />
            </div>

            <div className="grid min-w-0 gap-2">
              <span className="text-sm font-medium text-foreground">Modulo</span>
              <NativeSelect value={module} onChange={(event) => {
                setModule(event.target.value)
                setCurrentPage(1)
              }}>
                {moduleOptions.map((option) => (
                  <option key={option} value={option}>{option === 'TODOS' ? 'Todos' : formatModuleLabel(option)}</option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid min-w-0 gap-2">
              <span className="text-sm font-medium text-foreground">Usuario</span>
              <NativeSelect value={userId} onChange={(event) => {
                setUserId(event.target.value)
                setCurrentPage(1)
              }}>
                <option value="TODOS">Todos</option>
                {(usersQuery.data ?? []).map((user) => (
                  <option key={user.id} value={String(user.id)}>{user.username}</option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid min-w-0 gap-2">
              <span className="text-sm font-medium text-foreground">Desde</span>
              <Input type="date" value={startDate} onChange={(event) => {
                setStartDate(event.target.value)
                setCurrentPage(1)
              }} />
            </div>

            <div className="grid min-w-0 gap-2">
              <span className="text-sm font-medium text-foreground">Hasta</span>
              <Input type="date" value={endDate} onChange={(event) => {
                setEndDate(event.target.value)
                setCurrentPage(1)
              }} />
            </div>

            <Button variant="outline" onClick={() => {
              setSearch('')
              setModule('TODOS')
              setActionGroup('TODOS')
              setUserId('TODOS')
              setStartDate('')
              setEndDate('')
              setCurrentPage(1)
            }}>
              Limpiar
            </Button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Modulo</TableHead>
                  <TableHead>Accion</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length ? (
                  records.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDate(item.createdAt)}</TableCell>
                      <TableCell>
                        <div>
                          <p>{item.username ?? 'Sistema'}</p>
                          <p className="text-xs text-muted-foreground">{item.userRole ? formatRole(item.userRole) : 'Sin rol'}</p>
                        </div>
                      </TableCell>
                      <TableCell>{formatModuleLabel(item.module)}</TableCell>
                      <TableCell>
                        <Badge variant={getActionVariant(item.action)}>{formatModuleLabel(item.action)}</Badge>
                      </TableCell>
                      <TableCell>{item.entityLabel ?? item.entityType ?? 'Sin entidad'}</TableCell>
                      <TableCell>{item.description ?? 'Sin descripcion'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedLog(item)}>
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No hay registros de auditoria para el filtro actual.
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
              singularLabel="evento"
              pluralLabel="eventos"
              onPageChange={setCurrentPage}
            />
          </div>
        </CardContent>
      </Card>

      <ModuleDetailsDrawer
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
        title={selectedLog ? `Evento #${selectedLog.id}` : ''}
        description={selectedLog?.description ?? ''}
      >
        {selectedLog ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Resumen</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Usuario</p><div className="mt-1 text-sm font-medium text-foreground">{selectedLog.username ?? 'Sistema'}</div></div>
                <div><p className="text-xs text-muted-foreground">Rol</p><div className="mt-1 text-sm font-medium text-foreground">{selectedLog.userRole ? formatRole(selectedLog.userRole) : 'Sin rol'}</div></div>
                <div><p className="text-xs text-muted-foreground">Modulo</p><div className="mt-1 text-sm font-medium text-foreground">{formatModuleLabel(selectedLog.module)}</div></div>
                <div><p className="text-xs text-muted-foreground">Accion</p><div className="mt-1 text-sm font-medium text-foreground">{formatModuleLabel(selectedLog.action)}</div></div>
                <div><p className="text-xs text-muted-foreground">Entidad</p><div className="mt-1 text-sm font-medium text-foreground">{selectedLog.entityLabel ?? selectedLog.entityType ?? 'Sin entidad'}</div></div>
                <div><p className="text-xs text-muted-foreground">Fecha</p><div className="mt-1 text-sm font-medium text-foreground">{formatDate(selectedLog.createdAt)}</div></div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Metadata</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-muted/20 p-3 text-xs text-foreground">{JSON.stringify(selectedLog.metadata ?? {}, null, 2)}</pre>
            </div>
          </div>
        ) : null}
      </ModuleDetailsDrawer>
    </div>
  )
}
