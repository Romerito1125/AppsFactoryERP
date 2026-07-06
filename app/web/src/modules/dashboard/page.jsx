import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Activity, Boxes, FileText, TrendingUp, Users, Warehouse } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiClient } from '@/lib/api-client'
import {
  formatCurrency,
  formatDate,
  formatInvoiceStatus,
  formatNumber,
  formatRole,
} from '@/lib/format'

const chartConfig = {
  revenue: { label: 'Ingresos', color: 'var(--chart-1)' },
  stock: { label: 'Stock', color: 'var(--chart-2)' },
  users: { label: 'Usuarios', color: 'var(--chart-3)' },
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-[360px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => {
      const [users, clients, products, warehouses, invoices] = await Promise.all([
        apiClient.getAllPages('/usuarios'),
        apiClient.getAllPages('/clientes', { estado: 'todos' }),
        apiClient.getAllPages('/productos', { estado: 'todos' }),
        apiClient.getAllPages('/bodegas', { estado: 'todos' }),
        apiClient.getAllPages('/facturas'),
      ])

      return { users, clients, products, warehouses, invoices }
    },
  })

  if (dashboardQuery.isLoading) {
    return <DashboardSkeleton />
  }

  if (dashboardQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {dashboardQuery.error.message}
      </div>
    )
  }

  const { users, clients, products, warehouses, invoices } = dashboardQuery.data
  const activeInvoices = invoices.filter((invoice) => invoice.status === 'ACTIVA')
  const totalRevenue = activeInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0)
  const stockUnits = products.reduce(
    (sum, product) =>
      sum +
      (product.warehouses ?? []).reduce(
        (warehouseSum, item) => warehouseSum + Number(item.quantity ?? 0),
        0,
      ),
    0,
  )

  const monthlyRevenue = Array.from({ length: 12 }).map((_, index) => {
    const month = index

    return {
      month: new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(
        new Date(2026, month, 1),
      ),
      revenue: activeInvoices
        .filter((invoice) => new Date(invoice.createdAt).getMonth() === month)
        .reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
    }
  })

  const stockByWarehouse = warehouses.map((warehouse) => {
    return {
      name: warehouse.location,
      stock: products.reduce(
        (sum, product) =>
          sum +
          (product.warehouses ?? [])
            .filter((item) => item.warehouseId === warehouse.id)
            .reduce((warehouseSum, item) => warehouseSum + Number(item.quantity ?? 0), 0),
        0,
      ),
      users: users.filter((user) => user.role === 'BODEGA' && user.isActive).length,
    }
  })

  const recentInvoices = invoices.slice(0, 5)

  const summaryCards = [
    {
      label: 'Ingresos activos',
      value: formatCurrency(totalRevenue),
      help: 'Total de facturas activas cargadas en el sistema.',
      icon: TrendingUp,
    },
    {
      label: 'Clientes registrados',
      value: formatNumber(clients.length),
      help: 'Activos e inactivos listos para seguimiento comercial.',
      icon: Users,
    },
    {
      label: 'Stock consolidado',
      value: formatNumber(stockUnits),
      help: 'Unidades disponibles sumando todo el inventario.',
      icon: Boxes,
    },
    {
      label: 'Facturas emitidas',
      value: formatNumber(invoices.length),
      help: 'Incluye facturas activas y anuladas para trazabilidad.',
      icon: FileText,
    },
  ]

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Vista ejecutiva
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Panorama del negocio
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Resumen ejecutivo de ventas, clientes, inventario y actividad comercial.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => {
          const Icon = card.icon

          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.24 }}
            >
              <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
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
            </motion.div>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Ingresos por mes</CardTitle>
            <CardDescription>Comportamiento de las facturas activas registradas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <LineChart data={monthlyRevenue}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={3}
                  dot={{ fill: 'var(--color-revenue)' }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Stock por bodega</CardTitle>
            <CardDescription>Comparativo de unidades disponibles por ubicacion.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <BarChart data={stockByWarehouse} margin={{ top: 12, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-stock)" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="var(--color-stock)" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis 
                  dataKey="name" 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <YAxis 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  tickFormatter={formatNumber}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="stock" fill="url(#stockGradient)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Ultimas facturas</CardTitle>
            <CardDescription>Actividad reciente del flujo comercial.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consecutivo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.consecutive}</TableCell>
                    <TableCell>{`${invoice.client.firstName} ${invoice.client.lastName}`}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'ACTIVA' ? 'default' : 'secondary'}>
                        {formatInvoiceStatus(invoice.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.total)}</TableCell>
                    <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Lectura rapida</CardTitle>
            <CardDescription>Indicadores complementarios del ecosistema.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-primary">
                <Warehouse className="size-4" />
                <span className="text-sm font-medium">Bodegas operativas</span>
              </div>
              <p className="mt-2 text-2xl font-semibold">{formatNumber(warehouses.filter((warehouse) => warehouse.isActive).length)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-primary">
                <Activity className="size-4" />
                <span className="text-sm font-medium">Roles activos</span>
              </div>
              <div className="mt-3 grid gap-2 text-sm">
                {['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGA', 'CONTADOR'].map((role) => (
                  <div key={role} className="flex items-center justify-between">
                    <span>{formatRole(role)}</span>
                    <span className="font-medium">
                      {formatNumber(users.filter((user) => user.role === role && user.isActive).length)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
