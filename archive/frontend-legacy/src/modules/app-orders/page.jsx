import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bike, ReceiptText, Search, Smartphone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { formatCurrency, formatDate, formatInvoiceStatus, formatNumber } from '@/lib/format'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { LocalPagination } from '@/modules/shared/local-pagination'

const PAGE_SIZE = 20

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

function AppOrdersSkeleton() {
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

export function AppOrdersPage() {
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('TODOS')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const ordersQuery = useQuery({
    queryKey: ['tienda-pedidos', statusTab, search, currentPage],
    queryFn: () =>
      apiClient.get('/tienda/pedidos', {
        status: statusTab === 'TODOS' ? undefined : statusTab,
        q: search,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })

  const orders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data])
  const totalItems = Number(ordersQuery.data?.total ?? 0)
  const totalPages = Math.max(1, Number(ordersQuery.data?.totalPages ?? 1))
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(startItem + orders.length - 1, totalItems)

  const summaryCards = useMemo(
    () => [
      {
        label: 'Pedidos app',
        value: formatNumber(orders.length),
        help: 'Facturas creadas desde el checkout movil.',
      },
      {
        label: 'Pendientes',
        value: formatNumber(orders.filter((order) => !['ENTREGADO', 'CANCELADO'].includes(order.delivery?.status)).length),
        help: 'Pedidos aun abiertos en entrega.',
      },
      {
        label: 'Entregados',
        value: formatNumber(orders.filter((order) => order.delivery?.status === 'ENTREGADO').length),
        help: 'Pedidos finalizados correctamente.',
      },
      {
        label: 'Facturado',
        value: formatCurrency(orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0)),
        help: 'Total acumulado de pedidos moviles.',
      },
    ],
    [orders],
  )

  if (ordersQuery.isLoading) {
    return <AppOrdersSkeleton />
  }

  if (ordersQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {ordersQuery.error.message}
      </div>
    )
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="size-4" />
                Pedidos desde la app
              </CardTitle>
              <CardDescription>
                Seguimiento operativo de compras creadas desde el storefront movil.
              </CardDescription>
            </div>

            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Buscar por cliente, pedido o direccion..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Tabs
            value={statusTab}
            onValueChange={(value) => {
                setStatusTab(value)
                setCurrentPage(1)
              }}
          >
            <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
              {['TODOS', 'PENDIENTE', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'].map((status) => (
                <TabsTrigger key={status} value={status}>
                  {status === 'TODOS' ? 'Todos' : formatDeliveryStatus(status)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length ? (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.consecutive}</p>
                          <p className="text-xs text-muted-foreground">{formatInvoiceStatus(order.status)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{`${order.client?.firstName ?? ''} ${order.client?.lastName ?? ''}`.trim()}</p>
                          <p className="text-xs text-muted-foreground">{order.client?.identification ?? 'Sin documento'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{order.delivery?.recipientName ?? 'Sin destinatario'}</p>
                          <p className="text-xs text-muted-foreground">{order.delivery?.address ?? 'Sin direccion'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={deliveryStatusVariants[order.delivery?.status] ?? 'outline'}>
                          {formatDeliveryStatus(order.delivery?.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(order.total)}</TableCell>
                      <TableCell>{formatDate(order.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No hay pedidos de app que coincidan con el filtro actual.
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
              singularLabel="pedido"
              pluralLabel="pedidos"
              onPageChange={setCurrentPage}
            />
          </div>
        </CardContent>
      </Card>

      <ModuleDetailsDrawer
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null)
          }
        }}
        title={selectedOrder?.consecutive ?? 'Pedido app'}
        description="Detalle del pedido capturado desde la app movil."
        badge={{ label: 'App movil', variant: 'outline' }}
        fields={
          selectedOrder
            ? [
                {
                  label: 'Resumen',
                  items: [
                    { label: 'Factura', value: selectedOrder.consecutive },
                    { label: 'Estado factura', value: formatInvoiceStatus(selectedOrder.status) },
                    { label: 'Total', value: formatCurrency(selectedOrder.total) },
                    { label: 'Fecha', value: formatDate(selectedOrder.createdAt) },
                  ],
                },
                {
                  label: 'Cliente',
                  items: [
                    {
                      label: 'Nombre',
                      value: `${selectedOrder.client?.firstName ?? ''} ${selectedOrder.client?.lastName ?? ''}`.trim() || 'Sin nombre',
                    },
                    { label: 'Documento', value: selectedOrder.client?.identification ?? 'Sin documento' },
                    { label: 'Telefono', value: selectedOrder.client?.phone ?? 'Sin telefono' },
                    { label: 'Direccion cliente', value: selectedOrder.client?.address ?? 'Sin direccion' },
                  ],
                },
                {
                  label: 'Entrega',
                  items: [
                    { label: 'Estado', value: formatDeliveryStatus(selectedOrder.delivery?.status) },
                    { label: 'Destinatario', value: selectedOrder.delivery?.recipientName ?? 'Sin destinatario' },
                    { label: 'Telefono', value: selectedOrder.delivery?.recipientPhone ?? 'Sin telefono' },
                    { label: 'Direccion', value: selectedOrder.delivery?.address ?? 'Sin direccion' },
                  ],
                },
              ]
            : []
        }
      >
        {selectedOrder ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Notas de entrega</p>
              <p className="mt-3 text-sm text-foreground">{selectedOrder.delivery?.notes ?? 'Sin notas registradas'}</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-center gap-2">
                <ReceiptText className="size-4 text-primary" />
                <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Items del pedido</p>
              </div>
              <div className="mt-4 grid gap-3">
                {selectedOrder.items?.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{item.product?.name ?? `Producto #${item.productId}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.product?.productType?.name ?? 'Sin categoria'} · {formatNumber(item.quantity)} und
                        </p>
                      </div>
                      <Badge variant="outline">{formatCurrency(item.total)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bike className="size-4" />
                Trazabilidad operativa disponible desde el modulo de domicilios.
              </div>
            </div>
          </div>
        ) : null}
      </ModuleDetailsDrawer>
    </div>
  )
}
