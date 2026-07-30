import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Landmark,
  LoaderCircle,
  Mail,
  PackageSearch,
  Printer,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'

import { useAuth } from '@/auth/auth-context'
import { ProductImage } from '@/components/product-image'
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
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { apiClient } from '@/lib/api-client'
import {
  formatClientType,
  formatCurrency,
  formatDate,
  formatInvoiceStatus,
  formatNumber,
} from '@/lib/format'
import { downloadReportPdf } from '@/modules/reports/report-pdf'

const GMF_RATE = 0.004
const GMF_TYPES = new Set(['EGRESO', 'TRANSFERENCIA_SALIENTE'])

const chartConfig = {
  total: { label: 'Total facturado', color: 'var(--chart-1)' },
  taxes: { label: 'IVA', color: 'var(--chart-2)' },
  quantity: { label: 'Unidades', color: 'var(--chart-3)' },
  critical: { label: 'Critico', color: '#ef4444' },
  warning: { label: 'Regular', color: '#f59e0b' },
  good: { label: 'Buen stock', color: '#10b981' },
}

function ReportsSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[360px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
      <Skeleton className="h-[520px] rounded-2xl" />
    </div>
  )
}

function toInputDate(value) {
  return value.toISOString().slice(0, 10)
}

function createDateRange(startDate, endDate) {
  return {
    start: startDate ? new Date(`${startDate}T00:00:00`) : null,
    end: endDate ? new Date(`${endDate}T23:59:59.999`) : null,
  }
}

function getLastSunday(referenceDate) {
  const date = new Date(referenceDate)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  return date
}

function getWeeklySundayCutoff(referenceDate) {
  const sunday = getLastSunday(referenceDate)
  const start = new Date(sunday)
  start.setDate(start.getDate() - 6)
  start.setHours(0, 0, 0, 0)

  const end = new Date(sunday)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

function getTotalStockAtDate(product, movements, cutoffEnd) {
  let total = getTotalStock(product)

  for (const movement of movements) {
    const movementDate = new Date(movement.createdAt)

    if (movementDate <= cutoffEnd || movement.productId !== product.id) {
      continue
    }

    const quantity = Number(movement.quantity ?? 0)

    if (movement.movementType === 'ENTRADA') {
      total -= quantity
      continue
    }

    if (movement.movementType === 'SALIDA') {
      total += quantity
      continue
    }

    if (movement.movementType === 'AJUSTE') {
      total += movement.fromWarehouseId ? quantity : 0
      total -= movement.toWarehouseId ? quantity : 0
    }
  }

  return Math.max(0, total)
}

function isWithinRange(value, range) {
  if (!value) return false

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  if (range.start && date < range.start) return false
  if (range.end && date > range.end) return false
  return true
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

function formatPercent(value) {
  return `${Number(value ?? 0).toFixed(2)}%`
}

function formatSaleMode(value) {
  return value === 'CREDITO' ? 'Credito' : 'Contado'
}

function getTotalStock(product) {
  return (product.warehouses ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
}

function getStockSignal(product) {
  const totalStock = getTotalStock(product)
  const minimumStock = Number(product.minimumStock ?? 0)
  const maximumStock =
    product.maximumStock === null || product.maximumStock === undefined
      ? null
      : Number(product.maximumStock)
  const warningThreshold = maximumStock !== null ? Math.max(minimumStock + 1, maximumStock * 0.45) : Math.max(6, minimumStock * 2)

  if (totalStock <= minimumStock) {
    return {
      label: 'Falta stock',
      tone: 'critical',
      badgeClass: 'border-destructive/30 bg-destructive/10 text-destructive',
    }
  }

  if (totalStock <= warningThreshold) {
    return {
      label: 'Stock regular',
      tone: 'warning',
      badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }

  return {
    label: 'Buen stock',
    tone: 'good',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  }
}

function toCsvValue(value) {
  const normalized = value === null || value === undefined ? '' : String(value)
  return `"${normalized.replace(/"/g, '""')}"`
}

function downloadCsv(filename, rows) {
  if (!rows.length) return

  const csv = rows.map((row) => row.map(toCsvValue).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function rankRows(items, pickLabel) {
  return items.map((item, index) => ({
    rank: index + 1,
    label: pickLabel(item),
    quantity: item.quantity,
    total: item.total,
  }))
}

function getAssociatedProviders(product) {
  return Array.isArray(product?.providers) && product.providers.length
    ? product.providers
    : product?.provider
      ? [{ ...product.provider, isPrimary: true }]
      : []
}

function formatProductProviderSummary(product) {
  const providers = getAssociatedProviders(product)

  if (!providers.length) {
    return 'Sin proveedor'
  }

  const primaryProvider = providers.find((provider) => provider.isPrimary) ?? providers[0]
  const additionalCount = Math.max(0, providers.length - 1)

  return additionalCount ? `${primaryProvider.name} · +${additionalCount} asociado(s)` : primaryProvider.name
}

const reportEmailSectionOptions = [
  { value: 'RESUMEN', label: 'Resumen ejecutivo', description: 'Indicadores principales y lectura del corte.' },
  { value: 'FACTURAS', label: 'Facturas', description: 'Detalle operativo de facturacion por documento.' },
  { value: 'IVA', label: 'IVA', description: 'Consolidado del impuesto por tarifa.' },
  { value: 'EXOGENAS', label: 'Exogenas', description: 'Base consolidada por cliente.' },
  { value: 'GMF', label: '4x1000', description: 'Impacto segmentado por cuenta bancaria.' },
  { value: 'STOCK', label: 'Stock critico', description: 'Productos en seguimiento o reposicion.' },
  { value: 'STOCK_SEMANAL', label: 'Stock semanal', description: 'Corte dominical reconstruido desde movimientos.' },
  { value: 'TRASLADOS', label: 'Traslados', description: 'Traslados recientes entre bodegas con ticket.' },
  { value: 'PRODUCTOS', label: 'Top productos', description: 'Mayor rotacion y facturacion del periodo.' },
]

function buildReportEmailSubject(startDate, endDate) {
  return `Reporte de corte ${startDate} a ${endDate}`
}

function parseEmailRecipients(value) {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

function formatGeneratedAt() {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())
}

function buildReportEmailPayload({ report, summaryCards, startDate, endDate, sections, generatedBy, subject }) {
  return {
    subject,
    startDate,
    endDate,
    generatedAt: formatGeneratedAt(),
    generatedBy,
    sections,
    summaryCards: summaryCards.map((card) => ({
      label: card.label,
      value: card.value,
      help: card.help,
    })),
    highlights: [
      { label: 'Facturas en corte', value: formatNumber(report.rangedInvoices.length) },
      { label: 'Recaudo bancario', value: formatCurrency(report.collectedInBanks) },
      { label: 'Traslados inventario', value: formatNumber(report.transfers.length) },
    ],
    invoiceRows: report.invoiceRows.slice(0, 25).map((row) => ({
      Fecha: formatDate(row.createdAt),
      Numero: row.consecutive,
      Cliente: row.clientName,
      Usuario: row.sellerName,
      Deposito: row.warehouseName,
      Ciudad: row.city,
      Zona: row.zone,
      Estacion: row.station,
      Operacion: `${row.source} · ${formatSaleMode(row.saleMode)}`,
      Estado: formatInvoiceStatus(row.status),
      Neto: formatCurrency(row.subtotal),
      Contado: formatCurrency(row.contado),
      Credito: formatCurrency(row.credito),
      IVA: formatCurrency(row.taxes),
      Total: formatCurrency(row.total),
      Costo: formatCurrency(row.cost),
      Utilidad: formatCurrency(row.profit),
      '% Utilidad': formatPercent(row.profitPercentage),
    })),
    ivaRows: report.ivaRows.slice(0, 20).map((row) => ({
      Tarifa: formatPercent(row.rate),
      Base: formatCurrency(row.base),
      IVA: formatCurrency(row.taxes),
      Total: formatCurrency(row.total),
      Unidades: formatNumber(row.items),
    })),
    exogenousRows: report.exogenousRows.slice(0, 25).map((row) => ({
      Documento: row.identification,
      Cliente: row.clientName,
      Tipo: row.clientType ? formatClientType(row.clientType) : 'Sin tipo',
      Facturas: formatNumber(row.invoices),
      Base: formatCurrency(row.subtotal),
      IVA: formatCurrency(row.taxes),
      Total: formatCurrency(row.total),
      'Credito pendiente': formatCurrency(row.pendingCredit),
    })),
    gmfRows: report.gmfByAccount.slice(0, 20).map((row) => ({
      Cuenta: row.accountName,
      Banco: row.bankName,
      Movimientos: formatNumber(row.movements),
      Base: formatCurrency(row.base),
      '4x1000': formatCurrency(row.tax),
      Impacto: formatCurrency(row.impact),
    })),
    lowStockRows: report.lowStockProducts.slice(0, 20).map((product) => ({
      Producto: product.name,
      Marca: product.brand,
      Stock: formatNumber(product.totalStock),
      'Min / Max':
        product.maximumStock !== null && product.maximumStock !== undefined
          ? `Min ${formatNumber(product.minimumStock)} · Max ${formatNumber(product.maximumStock)}`
          : `Min ${formatNumber(product.minimumStock)} · Max libre`,
      Semaforo: product.signal.label,
    })),
    weeklyStockRows: report.weeklyStockRows.slice(0, 20).map((product) => ({
      Producto: product.name,
      Marca: product.brand,
      'Stock corte domingo': formatNumber(product.totalStockAtCutoff),
      'Movimientos semana': formatNumber(product.weeklyMovements),
      Estado: product.signal.label,
    })),
    transferRows: report.transferDigestRows.slice(0, 25).map((row) => ({
      Ticket: row.ticketNumber,
      Producto: row.productName,
      Origen: row.fromWarehouse,
      Destino: row.toWarehouse,
      Cantidad: formatNumber(row.quantity),
      Soporte: row.supportNote,
      Fecha: formatDate(row.createdAt),
    })),
    topProductRows: report.productSales.slice(0, 20).map((product) => ({
      Producto: product.name,
      Categoria: product.productTypeName,
      Proveedor: product.providerName,
      Unidades: formatNumber(product.quantity),
      Neto: formatCurrency(product.subtotal),
      IVA: formatCurrency(product.taxes),
      Total: formatCurrency(product.total),
    })),
  }
}

function buildReportSectionConfigs({ report, startDate, endDate, transferWindowDays }) {
  const periodLabel = `${startDate} a ${endDate}`

  return [
    {
      key: 'FACTURAS',
      title: 'Facturacion del mes',
      description: 'Corte operativo con neto, contado, credito e impuestos por factura.',
      icon: TrendingUp,
      filename: `reporte-facturacion-${startDate}-${endDate}.pdf`,
      csvFilename: `reporte-facturacion-${startDate}-${endDate}.csv`,
      metrics: [
        { label: 'Facturas en corte', value: formatNumber(report.invoiceRows.length), help: periodLabel },
        { label: 'Neto', value: formatCurrency(report.totals.subtotal), help: 'Base de facturacion activa.' },
        { label: 'Costo', value: formatCurrency(report.totals.cost), help: 'Costo historico registrado en items.' },
        { label: 'Utilidad', value: formatCurrency(report.totals.profit), help: 'Utilidad calculada del corte.' },
      ],
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'consecutivo', label: 'Consecutivo' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'usuario', label: 'Usuario' },
        { key: 'deposito', label: 'Deposito' },
        { key: 'ciudad', label: 'Ciudad' },
        { key: 'zona', label: 'Zona' },
        { key: 'estacion', label: 'Estacion' },
        { key: 'operacion', label: 'Operacion' },
        { key: 'estado', label: 'Estado' },
        { key: 'neto', label: 'Neto' },
        { key: 'contado', label: 'Contado' },
        { key: 'credito', label: 'Credito' },
        { key: 'iva', label: 'IVA' },
        { key: 'total', label: 'Total' },
        { key: 'costo', label: 'Costo' },
        { key: 'utilidad', label: 'Utilidad' },
        { key: 'porcentaje', label: '% Utilidad' },
      ],
      rows: report.invoiceRows.map((row) => ({
        fecha: formatDate(row.createdAt),
        consecutivo: row.consecutive,
        cliente: row.clientName,
        usuario: row.sellerName,
        deposito: row.warehouseName,
        ciudad: row.city,
        zona: row.zone,
        estacion: row.station,
        operacion: `${row.source} · ${formatSaleMode(row.saleMode)}`,
        estado: formatInvoiceStatus(row.status),
        neto: formatCurrency(row.subtotal),
        contado: formatCurrency(row.contado),
        credito: formatCurrency(row.credito),
        iva: formatCurrency(row.taxes),
        total: formatCurrency(row.total),
        costo: formatCurrency(row.cost),
        utilidad: formatCurrency(row.profit),
        porcentaje: formatPercent(row.profitPercentage),
      })),
    },
    {
      key: 'IVA',
      title: 'IVA cobrado',
      description: 'Resumen por tarifa para declaraciones y cierres contables.',
      icon: Receipt,
      filename: `reporte-iva-${startDate}-${endDate}.pdf`,
      csvFilename: `reporte-iva-${startDate}-${endDate}.csv`,
      metrics: [
        { label: 'Tarifas activas', value: formatNumber(report.ivaRows.length), help: periodLabel },
        { label: 'Base', value: formatCurrency(report.totals.subtotal), help: 'Base gravable acumulada.' },
        { label: 'IVA cobrado', value: formatCurrency(report.totals.taxes), help: 'Total del periodo.' },
      ],
      columns: [
        { key: 'tarifa', label: 'Tarifa' },
        { key: 'base', label: 'Base' },
        { key: 'iva', label: 'IVA' },
        { key: 'total', label: 'Total' },
        { key: 'unidades', label: 'Unidades' },
      ],
      rows: report.ivaRows.map((row) => ({
        tarifa: formatPercent(row.rate),
        base: formatCurrency(row.base),
        iva: formatCurrency(row.taxes),
        total: formatCurrency(row.total),
        unidades: formatNumber(row.items),
      })),
    },
    {
      key: 'EXOGENAS',
      title: 'Base para exogenas',
      description: 'Consolidado por cliente listo para soporte contable.',
      icon: FileSpreadsheet,
      filename: `reporte-exogenas-${startDate}-${endDate}.pdf`,
      csvFilename: `reporte-exogenas-${startDate}-${endDate}.csv`,
      metrics: [
        { label: 'Clientes', value: formatNumber(report.exogenousRows.length), help: periodLabel },
        { label: 'Facturado', value: formatCurrency(report.totals.total), help: 'Total comercial del corte.' },
        { label: 'Cartera abierta', value: formatCurrency(report.outstandingCredits), help: 'Saldo pendiente actual.' },
      ],
      columns: [
        { key: 'documento', label: 'Documento' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'facturas', label: 'Facturas' },
        { key: 'base', label: 'Base' },
        { key: 'iva', label: 'IVA' },
        { key: 'total', label: 'Total' },
        { key: 'credito', label: 'Credito pendiente' },
      ],
      rows: report.exogenousRows.map((row) => ({
        documento: row.identification,
        cliente: row.clientName,
        tipo: row.clientType ? formatClientType(row.clientType) : 'Sin tipo',
        facturas: formatNumber(row.invoices),
        base: formatCurrency(row.subtotal),
        iva: formatCurrency(row.taxes),
        total: formatCurrency(row.total),
        credito: formatCurrency(row.pendingCredit),
      })),
    },
    {
      key: 'GMF',
      title: '4x1000 bancario',
      description: 'Impacto persistido sobre egresos y transferencias salientes con 4x1000.',
      icon: Landmark,
      filename: `reporte-4x1000-${startDate}-${endDate}.pdf`,
      csvFilename: `reporte-4x1000-${startDate}-${endDate}.csv`,
      metrics: [
        { label: 'Cuentas impactadas', value: formatNumber(report.gmfByAccount.length), help: periodLabel },
        { label: 'Base gravable', value: formatCurrency(report.gmfMovements.reduce((sum, item) => sum + item.base, 0)), help: 'Movimientos salientes.' },
        { label: 'GMF segmentado', value: formatCurrency(report.gmfMovements.reduce((sum, item) => sum + item.tax, 0)), help: 'Valor persistido por movimiento.' },
      ],
      columns: [
        { key: 'cuenta', label: 'Cuenta' },
        { key: 'banco', label: 'Banco' },
        { key: 'movimientos', label: 'Movimientos' },
        { key: 'base', label: 'Base' },
        { key: 'gmf', label: '4x1000' },
        { key: 'impacto', label: 'Impacto total' },
      ],
      rows: report.gmfByAccount.map((row) => ({
        cuenta: row.accountName,
        banco: row.bankName,
        movimientos: formatNumber(row.movements),
        base: formatCurrency(row.base),
        gmf: formatCurrency(row.tax),
        impacto: formatCurrency(row.impact),
      })),
    },
    {
      key: 'STOCK',
      title: 'Stock critico',
      description: 'Productos que requieren reposicion o seguimiento.',
      icon: PackageSearch,
      filename: `reporte-stock-${startDate}-${endDate}.pdf`,
      csvFilename: `reporte-stock-${startDate}-${endDate}.csv`,
      metrics: [
        { label: 'Criticos', value: formatNumber(report.stockHealth.critical), help: 'En rojo.' },
        { label: 'En alerta', value: formatNumber(report.stockHealth.warning), help: 'En amarillo.' },
        { label: 'Buen stock', value: formatNumber(report.stockHealth.good), help: 'Operativos.' },
      ],
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'marca', label: 'Marca' },
        { key: 'stock', label: 'Stock' },
        { key: 'minmax', label: 'Min / Max' },
        { key: 'semaforo', label: 'Semaforo' },
      ],
      rows: report.lowStockProducts.map((product) => ({
        producto: product.name,
        marca: product.brand,
        stock: formatNumber(product.totalStock),
        minmax:
          product.maximumStock !== null && product.maximumStock !== undefined
            ? `Min ${formatNumber(product.minimumStock)} · Max ${formatNumber(product.maximumStock)}`
            : `Min ${formatNumber(product.minimumStock)} · Max libre`,
        semaforo: product.signal.label,
      })),
    },
    {
      key: 'STOCK_SEMANAL',
      title: 'Stock semanal con corte dominical',
      description: `Snapshot reconstruido para la semana cerrada el ${report.weeklyStockCutoffLabel}.`,
      icon: PackageSearch,
      filename: `reporte-stock-semanal-${report.weeklyStockCutoffDate}.pdf`,
      csvFilename: `reporte-stock-semanal-${report.weeklyStockCutoffDate}.csv`,
      metrics: [
        { label: 'Semana cerrada', value: report.weeklyStockCutoffLabel, help: 'Corte automatico al domingo.' },
        { label: 'Criticos', value: formatNumber(report.weeklyStockRows.filter((product) => product.signal.tone === 'critical').length), help: 'Productos bajo minimo al cierre.' },
        { label: 'Movimientos', value: formatNumber(report.weeklyStockRows.reduce((sum, product) => sum + product.weeklyMovements, 0)), help: 'Movimientos detectados en la semana.' },
      ],
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'marca', label: 'Marca' },
        { key: 'stock', label: 'Stock corte domingo' },
        { key: 'movimientos', label: 'Movimientos semana' },
        { key: 'semaforo', label: 'Semaforo' },
      ],
      rows: report.weeklyStockRows.map((product) => ({
        producto: product.name,
        marca: product.brand,
        stock: formatNumber(product.totalStockAtCutoff),
        movimientos: formatNumber(product.weeklyMovements),
        semaforo: product.signal.label,
      })),
    },
    {
      key: 'TRASLADOS',
      title: 'Traslados entre bodegas',
      description: `Resumen operativo de los ultimos ${transferWindowDays} dia(s).`,
      icon: PackageSearch,
      filename: `reporte-traslados-${transferWindowDays}d-${endDate}.pdf`,
      csvFilename: `reporte-traslados-${transferWindowDays}d-${endDate}.csv`,
      metrics: [
        { label: 'Tickets', value: formatNumber(report.transferDigestRows.length), help: 'Traslados aprobados en la ventana.' },
        { label: 'Unidades', value: formatNumber(report.transferDigestRows.reduce((sum, row) => sum + row.quantity, 0)), help: 'Cantidad movilizada.' },
        { label: 'Ventana', value: `${transferWindowDays} dia(s)`, help: 'Periodo movil configurable.' },
      ],
      columns: [
        { key: 'ticket', label: 'Ticket' },
        { key: 'producto', label: 'Producto' },
        { key: 'origen', label: 'Origen' },
        { key: 'destino', label: 'Destino' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'soporte', label: 'Soporte' },
        { key: 'fecha', label: 'Fecha' },
      ],
      rows: report.transferDigestRows.map((row) => ({
        ticket: row.ticketNumber,
        producto: row.productName,
        origen: row.fromWarehouse,
        destino: row.toWarehouse,
        cantidad: formatNumber(row.quantity),
        soporte: row.supportNote,
        fecha: formatDate(row.createdAt),
      })),
    },
    {
      key: 'PRODUCTOS',
      title: 'Top productos vendidos',
      description: 'Rotacion por referencia, categoria y proveedor principal.',
      icon: BarChart3,
      filename: `reporte-top-productos-${startDate}-${endDate}.pdf`,
      csvFilename: `reporte-top-productos-${startDate}-${endDate}.csv`,
      metrics: [
        { label: 'Referencias con ventas', value: formatNumber(report.productSales.length), help: periodLabel },
        { label: 'Unidades', value: formatNumber(report.totals.items), help: 'Items facturados.' },
        { label: 'Facturado', value: formatCurrency(report.totals.total), help: 'Total del corte.' },
      ],
      columns: [
        { key: 'producto', label: 'Producto' },
        { key: 'categoria', label: 'Categoria' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'unidades', label: 'Unidades' },
        { key: 'neto', label: 'Neto' },
        { key: 'iva', label: 'IVA' },
        { key: 'total', label: 'Total' },
      ],
      rows: report.productSales.map((product) => ({
        producto: product.name,
        categoria: product.productTypeName,
        proveedor: product.providerName,
        unidades: formatNumber(product.quantity),
        neto: formatCurrency(product.subtotal),
        iva: formatCurrency(product.taxes),
        total: formatCurrency(product.total),
      })),
    },
  ]
}

export function ReportsPage() {
  const { user } = useAuth()
  const [startDate, setStartDate] = useState(() => toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [endDate, setEndDate] = useState(() => toInputDate(new Date()))
  const [transferWindowDays, setTransferWindowDays] = useState('3')
  const [operationTypeFilter, setOperationTypeFilter] = useState('TODOS')
  const [clientFilter, setClientFilter] = useState('TODOS')
  const [sellerFilter, setSellerFilter] = useState('TODOS')
  const [warehouseFilter, setWarehouseFilter] = useState('TODOS')
  const [zoneFilter, setZoneFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [stationFilter, setStationFilter] = useState('')
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')
  const [emailSubject, setEmailSubject] = useState(() => buildReportEmailSubject(toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), toInputDate(new Date())))
  const [selectedEmailSections, setSelectedEmailSections] = useState(() => reportEmailSectionOptions.map((option) => option.value))

  const reportsQuery = useQuery({
    queryKey: ['reportes-overview'],
    queryFn: async () => {
      const [invoices, credits, accounts, bankMovements, products, inventoryMovements, clients, users, warehouses] = await Promise.all([
        apiClient.getAllPages('/facturas'),
        apiClient.getAllPages('/creditos'),
        apiClient.getAllPages('/cuentas-bancarias', { estado: 'todos' }),
        apiClient.getAllPages('/movimientos-bancarios'),
        apiClient.getAllPages('/productos', { estado: 'todos' }),
        apiClient.getAllPages('/inventario/movimientos'),
        apiClient.getAllPages('/clientes', { estado: 'todos' }),
        apiClient.getAllPages('/usuarios', { estado: 'todos' }),
        apiClient.getAllPages('/bodegas', { estado: 'todos' }),
      ])

      return { invoices, credits, accounts, bankMovements, products, inventoryMovements, clients, users, warehouses }
    },
  })

  const range = useMemo(() => createDateRange(startDate, endDate), [startDate, endDate])

  const sendReportEmailMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/reportes/email', payload),
  })

  const report = useMemo(() => {
    const source = reportsQuery.data

    if (!source) {
      return null
    }

    const productsById = new Map(source.products.map((product) => [product.id, product]))
    const creditsByInvoiceId = new Map(source.credits.map((credit) => [credit.invoiceId, credit]))

    const rangedInvoicesBase = source.invoices.filter((invoice) => isWithinRange(invoice.createdAt, range))
    const normalizedZoneFilter = zoneFilter.trim().toLowerCase()
    const normalizedCityFilter = cityFilter.trim().toLowerCase()
    const normalizedStationFilter = stationFilter.trim().toLowerCase()
    const rangedInvoices = rangedInvoicesBase.filter((invoice) => {
      const operationType = `${invoice.source ?? 'ADMIN'}-${invoice.saleMode ?? 'CONTADO'}`

      if (operationTypeFilter !== 'TODOS' && operationType !== operationTypeFilter) {
        return false
      }

      if (clientFilter !== 'TODOS' && invoice.clientId !== Number(clientFilter)) {
        return false
      }

      if (sellerFilter !== 'TODOS' && invoice.createdByUserId !== Number(sellerFilter)) {
        return false
      }

      if (warehouseFilter !== 'TODOS' && invoice.warehouseId !== Number(warehouseFilter)) {
        return false
      }

      if (normalizedZoneFilter && !String(invoice.zone ?? '').toLowerCase().includes(normalizedZoneFilter)) {
        return false
      }

      if (normalizedCityFilter && !String(invoice.city ?? '').toLowerCase().includes(normalizedCityFilter)) {
        return false
      }

      if (normalizedStationFilter && !String(invoice.station ?? '').toLowerCase().includes(normalizedStationFilter)) {
        return false
      }

      return true
    })
    const activeInvoices = rangedInvoices.filter((invoice) => invoice.status === 'ACTIVA')
    const rangedBankMovements = source.bankMovements.filter((movement) => isWithinRange(movement.createdAt, range))
    const rangedInventoryMovements = source.inventoryMovements.filter((movement) => isWithinRange(movement.createdAt, range))
    const weeklyStockRange = getWeeklySundayCutoff(range.end ?? new Date())
    const weeklyStockCutoffDate = toInputDate(weeklyStockRange.end)
    const weeklyStockCutoffLabel = formatDate(weeklyStockRange.end)
    const weeklyMovementRows = source.inventoryMovements.filter((movement) => isWithinRange(movement.createdAt, weeklyStockRange))
    const transferWindowRange = createDateRange(
      toInputDate(new Date((range.end ?? new Date()).getTime() - (Number(transferWindowDays) - 1) * 24 * 60 * 60 * 1000)),
      toInputDate(range.end ?? new Date()),
    )

    const invoiceRows = rangedInvoices.map((invoice) => {
      const linkedCredit = creditsByInvoiceId.get(invoice.id)
      const total = Number(invoice.total ?? 0)

        const itemCost = invoice.items.reduce((sum, item) => sum + Number(item.unitCost ?? 0) * Number(item.quantity ?? 0), 0)
        const itemProfit = invoice.items.reduce((sum, item) => sum + Number(item.profitAmount ?? 0), 0)

        return {
          id: invoice.id,
          consecutive: invoice.consecutive,
          clientName: `${invoice.client?.firstName ?? ''} ${invoice.client?.lastName ?? ''}`.trim(),
          clientId: invoice.clientId,
          status: invoice.status,
          createdAt: invoice.createdAt,
          source: invoice.source,
          saleMode: invoice.saleMode ?? (linkedCredit ? 'CREDITO' : 'CONTADO'),
          sellerName: invoice.createdByUsername ?? 'Sistema',
          sellerId: invoice.createdByUserId ?? null,
          warehouseName: invoice.warehouse?.location ?? 'Sin deposito',
          warehouseId: invoice.warehouseId ?? null,
          zone: invoice.zone ?? 'Sin zona',
          city: invoice.city ?? 'Sin ciudad',
          station: invoice.station ?? 'Sin estacion',
          subtotal: Number(invoice.subtotal ?? 0),
          taxes: Number(invoice.taxes ?? 0),
          total,
          contado: linkedCredit ? 0 : total,
          credito: linkedCredit ? total : 0,
          cost: itemCost,
          profit: itemProfit,
          profitPercentage: itemCost > 0 ? (itemProfit / itemCost) * 100 : 0,
        }
      })

    const totals = activeInvoices.reduce(
      (accumulator, invoice) => {
        accumulator.subtotal += Number(invoice.subtotal ?? 0)
        accumulator.taxes += Number(invoice.taxes ?? 0)
        accumulator.total += Number(invoice.total ?? 0)
        accumulator.items += invoice.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
        accumulator.cost += invoice.items.reduce((sum, item) => sum + Number(item.unitCost ?? 0) * Number(item.quantity ?? 0), 0)
        accumulator.profit += invoice.items.reduce((sum, item) => sum + Number(item.profitAmount ?? 0), 0)
        return accumulator
      },
      { subtotal: 0, taxes: 0, total: 0, items: 0, cost: 0, profit: 0 },
    )

    const salesTimeline = Array.from(
      activeInvoices.reduce((map, invoice) => {
        const key = toInputDate(new Date(invoice.createdAt))
        const current = map.get(key) ?? { dateKey: key, label: formatShortDate(invoice.createdAt), total: 0, taxes: 0 }
        current.total += Number(invoice.total ?? 0)
        current.taxes += Number(invoice.taxes ?? 0)
        map.set(key, current)
        return map
      }, new Map()).values(),
    ).sort((left, right) => left.dateKey.localeCompare(right.dateKey))

    const productSales = Array.from(
      activeInvoices.reduce((map, invoice) => {
        for (const item of invoice.items ?? []) {
          const catalogProduct = productsById.get(item.productId)
          const current = map.get(item.productId) ?? {
            productId: item.productId,
            name: item.product?.name ?? catalogProduct?.name ?? `Producto #${item.productId}`,
            brand: catalogProduct?.brand ?? item.product?.brand ?? 'Sin marca',
            imageUrl: catalogProduct?.imageUrl ?? item.product?.imageUrl ?? null,
            productTypeName: catalogProduct?.productType?.name ?? item.product?.productType?.name ?? 'Sin tipo',
            providerName: formatProductProviderSummary(catalogProduct),
            quantity: 0,
            subtotal: 0,
            taxes: 0,
            total: 0,
          }

          current.quantity += Number(item.quantity ?? 0)
          current.subtotal += Number(item.subtotal ?? 0)
          current.taxes += Number(item.taxAmount ?? 0)
          current.total += Number(item.total ?? 0)
          map.set(item.productId, current)
        }

        return map
      }, new Map()).values(),
    ).sort((left, right) => right.quantity - left.quantity)

    const ivaRows = Array.from(
      activeInvoices.reduce((map, invoice) => {
        for (const item of invoice.items ?? []) {
          const key = Number(item.taxRate ?? 0)
          const current = map.get(key) ?? { rate: key, base: 0, taxes: 0, total: 0, items: 0 }
          current.base += Number(item.subtotal ?? 0)
          current.taxes += Number(item.taxAmount ?? 0)
          current.total += Number(item.total ?? 0)
          current.items += Number(item.quantity ?? 0)
          map.set(key, current)
        }

        return map
      }, new Map()).values(),
    ).sort((left, right) => right.taxes - left.taxes)

    const exogenousRows = Array.from(
      activeInvoices.reduce((map, invoice) => {
        const client = source.clients.find((item) => item.id === invoice.clientId) ?? invoice.client
        const current = map.get(invoice.clientId) ?? {
          clientId: invoice.clientId,
          identification: client?.identification ?? 'Sin documento',
          clientName: `${client?.firstName ?? ''} ${client?.lastName ?? ''}`.trim() || 'Cliente',
          clientType: client?.clientType ?? null,
          invoices: 0,
          subtotal: 0,
          taxes: 0,
          total: 0,
          pendingCredit: 0,
        }

        current.invoices += 1
        current.subtotal += Number(invoice.subtotal ?? 0)
        current.taxes += Number(invoice.taxes ?? 0)
        current.total += Number(invoice.total ?? 0)
        current.pendingCredit += Number(creditsByInvoiceId.get(invoice.id)?.balance ?? 0)
        map.set(invoice.clientId, current)
        return map
      }, new Map()).values(),
    ).sort((left, right) => right.total - left.total)

    const gmfMovements = rangedBankMovements
      .filter((movement) => movement.appliesGmf || GMF_TYPES.has(movement.movementType))
      .map((movement) => ({
        ...movement,
        base: Number(movement.baseAmount ?? movement.amount ?? 0),
        tax: Number(movement.gmfAmount ?? 0),
        impact: Number(movement.totalAmount ?? movement.amount ?? 0),
      }))

    const gmfByAccount = Array.from(
      gmfMovements.reduce((map, movement) => {
        const key = movement.bankAccountId ?? 0
        const current = map.get(key) ?? {
          bankAccountId: movement.bankAccountId,
          accountName: movement.bankAccount?.name ?? `Cuenta #${movement.bankAccountId}`,
          bankName: movement.bankAccount?.bankName ?? 'Sin banco',
          movements: 0,
          base: 0,
          tax: 0,
          impact: 0,
        }

        current.movements += 1
        current.base += movement.base
        current.tax += movement.tax
        current.impact += movement.impact
        map.set(key, current)
        return map
      }, new Map()).values(),
    ).sort((left, right) => right.tax - left.tax)

    const outstandingCredits = source.credits.reduce((sum, credit) => sum + Number(credit.balance ?? 0), 0)
    const collectedInBanks = rangedBankMovements
      .filter((movement) => movement.movementType === 'INGRESO')
      .reduce((sum, movement) => sum + Number(movement.amount ?? 0), 0)
    const currentBankBalance = source.accounts
      .filter((account) => account.isActive !== false)
      .reduce((sum, account) => sum + Number(account.currentBalance ?? 0), 0)

    const salesByCategory = Array.from(
      productSales.reduce((map, item) => {
        const key = item.productTypeName
        const current = map.get(key) ?? { label: key, quantity: 0, total: 0 }
        current.quantity += item.quantity
        current.total += item.total
        map.set(key, current)
        return map
      }, new Map()).values(),
    ).sort((left, right) => right.total - left.total)

    const salesByProvider = Array.from(
      productSales.reduce((map, item) => {
        const key = item.providerName
        const current = map.get(key) ?? { label: key, quantity: 0, total: 0 }
        current.quantity += item.quantity
        current.total += item.total
        map.set(key, current)
        return map
      }, new Map()).values(),
    ).sort((left, right) => right.total - left.total)

    const salesByClient = exogenousRows.map((row) => ({
      label: row.clientName,
      quantity: row.invoices,
      total: row.total,
    }))

    const activeProducts = source.products.filter((product) => product.isActive !== false)
    const stockRows = activeProducts.map((product) => ({
      ...product,
      totalStock: getTotalStock(product),
      signal: getStockSignal(product),
    }))

    const weeklyStockRows = activeProducts
      .map((product) => {
        const totalStockAtCutoff = getTotalStockAtDate(product, source.inventoryMovements, weeklyStockRange.end)
        const signal = getStockSignal({ ...product, warehouses: [{ quantity: totalStockAtCutoff }] })

        return {
          ...product,
          totalStockAtCutoff,
          weeklyMovements: weeklyMovementRows.filter((movement) => movement.productId === product.id).length,
          signal,
        }
      })
      .filter((product) => product.signal.tone !== 'good' || product.weeklyMovements > 0)
      .sort((left, right) => left.totalStockAtCutoff - right.totalStockAtCutoff)

    const stockHealth = {
      critical: stockRows.filter((product) => product.signal.tone === 'critical').length,
      warning: stockRows.filter((product) => product.signal.tone === 'warning').length,
      good: stockRows.filter((product) => product.signal.tone === 'good').length,
    }

    const lowStockProducts = stockRows
      .filter((product) => product.signal.tone !== 'good')
      .sort((left, right) => left.totalStock - right.totalStock)

    const transfers = rangedInventoryMovements.filter((movement) => movement.movementType === 'TRASLADO')
    const transferDigestRows = source.inventoryMovements
      .filter((movement) => movement.movementType === 'TRASLADO')
      .filter((movement) => isWithinRange(movement.createdAt, transferWindowRange))
      .map((movement) => ({
        id: movement.id,
        ticketNumber: movement.transferTicket?.ticketNumber ?? `MOV-${movement.id}`,
        productName: movement.product?.name ?? `Producto #${movement.productId}`,
        fromWarehouse: movement.fromWarehouse?.location ?? 'N/A',
        toWarehouse: movement.toWarehouse?.location ?? 'N/A',
        quantity: Number(movement.quantity ?? 0),
        supportNote: movement.transferTicket?.supportNote ?? movement.reason ?? 'Sin soporte',
        createdAt: movement.createdAt,
      }))
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))

    return {
      rangedInvoices,
      activeInvoices,
      invoiceRows,
      totals,
      salesTimeline,
      productSales,
      ivaRows,
      exogenousRows,
      gmfMovements,
      gmfByAccount,
      outstandingCredits,
      collectedInBanks,
      currentBankBalance,
      salesByCategory,
      salesByProvider,
      salesByClient,
      stockRows,
      stockHealth,
      lowStockProducts,
      weeklyStockCutoffDate,
      weeklyStockCutoffLabel,
      weeklyStockRows,
      transfers,
      transferDigestRows,
    }
  }, [
    range,
    reportsQuery.data,
    transferWindowDays,
    operationTypeFilter,
    clientFilter,
    sellerFilter,
    warehouseFilter,
    zoneFilter,
    cityFilter,
    stationFilter,
  ])

  if (reportsQuery.isLoading) {
    return <ReportsSkeleton />
  }

  if (reportsQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {reportsQuery.error.message}
      </div>
    )
  }

  const summaryCards = [
    {
      label: 'Facturacion neta',
      value: formatCurrency(report.totals.subtotal),
      help: 'Base imponible del periodo filtrado.',
      icon: TrendingUp,
    },
    {
      label: 'IVA cobrado',
      value: formatCurrency(report.totals.taxes),
      help: 'Impuesto acumulado en facturas activas del corte.',
      icon: Receipt,
    },
    {
      label: 'Total facturado',
      value: formatCurrency(report.totals.total),
      help: 'Operacion comercial activa dentro del rango.',
      icon: CircleDollarSign,
    },
    {
      label: 'Cartera pendiente',
      value: formatCurrency(report.outstandingCredits),
      help: 'Saldo actual abierto en creditos.',
      icon: Wallet,
    },
    {
      label: 'Saldo bancario',
      value: formatCurrency(report.currentBankBalance),
      help: 'Suma de cuentas activas con la API actual.',
      icon: Landmark,
    },
    {
      label: '4x1000 estimado',
      value: formatCurrency(report.gmfMovements.reduce((sum, item) => sum + item.tax, 0)),
      help: 'Persistido en movimientos marcados con 4x1000.',
      icon: FileSpreadsheet,
    },
  ]

  const topProducts = report.productSales.slice(0, 6)
  const topCategories = rankRows(report.salesByCategory.slice(0, 5), (item) => item.label)
  const topProviders = rankRows(report.salesByProvider.slice(0, 5), (item) => item.label)
  const topClients = rankRows(report.salesByClient.slice(0, 5), (item) => item.label)
  const clients = reportsQuery.data?.clients ?? []
  const users = reportsQuery.data?.users ?? []
  const warehouses = reportsQuery.data?.warehouses ?? []
  const stockDistribution = [
    { name: 'critical', label: 'Falta stock', value: report.stockHealth.critical, fill: chartConfig.critical.color },
    { name: 'warning', label: 'Stock regular', value: report.stockHealth.warning, fill: chartConfig.warning.color },
    { name: 'good', label: 'Buen stock', value: report.stockHealth.good, fill: chartConfig.good.color },
  ]
  const reportSections = buildReportSectionConfigs({ report, startDate, endDate, transferWindowDays: Number(transferWindowDays) })
  const reportSectionByKey = new Map(reportSections.map((section) => [section.key, section]))

  function openEmailDialog() {
    setEmailSubject(buildReportEmailSubject(startDate, endDate))
    setSelectedEmailSections(reportEmailSectionOptions.map((option) => option.value))
    setEmailDialogOpen(true)
  }

  function toggleEmailSection(section) {
    setSelectedEmailSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    )
  }

  async function handleSendReportEmail() {
    const recipients = parseEmailRecipients(emailRecipients)
    const subject = emailSubject.trim() || buildReportEmailSubject(startDate, endDate)

    if (!recipients.length) {
      toast.error('Ingresa al menos un correo destino')
      return
    }

    if (!selectedEmailSections.length) {
      toast.error('Selecciona al menos un bloque del reporte para enviar')
      return
    }

    const payload = buildReportEmailPayload({
      report,
      summaryCards,
      startDate,
      endDate,
      sections: selectedEmailSections,
      generatedBy: user?.username,
      subject,
    })

    await toast.promise(
      sendReportEmailMutation.mutateAsync({
        ...payload,
        to: recipients,
      }),
      {
        loading: 'Enviando reporte por correo...',
        success: 'Reporte enviado correctamente',
        error: (error) => error.message,
      },
    )

    setEmailDialogOpen(false)
  }

  function exportSectionCsv(sectionKey) {
    const section = reportSectionByKey.get(sectionKey)

    if (!section) {
      return
    }

    downloadCsv(section.csvFilename, [
      section.columns.map((column) => column.label),
      ...section.rows.map((row) => section.columns.map((column) => row[column.key] ?? '')),
    ])
  }

  function exportSectionPdf(sectionKey) {
    const section = reportSectionByKey.get(sectionKey)

    if (!section) {
      return
    }

    downloadReportPdf({
      ...section,
      tableTitle: section.title,
      tableSubtitle: section.description,
      subtitle: `Corte ${startDate} a ${endDate}`,
      meta: [`Generado ${formatGeneratedAt()}`, `Facturas en corte: ${formatNumber(report.rangedInvoices.length)}`],
    })
  }

  function exportInvoiceReport() {
    exportSectionCsv('FACTURAS')
  }

  function exportIvaReport() {
    exportSectionCsv('IVA')
  }

  function exportExogenousReport() {
    exportSectionCsv('EXOGENAS')
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            Reportes · Analitica
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Reportes del negocio
          </h2>
          <p className="mt-2 max-w-4xl text-sm text-muted-foreground md:text-base">
            Centro de reportes subdividido por facturacion, IVA, exogenas, 4x1000, stock y productos para descargar cada corte por separado.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openEmailDialog}>
            <Mail className="mr-2 size-4" />
            Enviar correo
          </Button>
          <Button variant="outline" onClick={() => exportSectionPdf('FACTURAS')}>
            <Printer className="mr-2 size-4" />
            PDF facturacion
          </Button>
        </div>
      </div>

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader className="gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle>Corte configurable</CardTitle>
            <CardDescription>
              Filtra el analisis por fecha para cierres, declaraciones y lectura ejecutiva.
            </CardDescription>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:min-w-[420px]">
            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Desde</span>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Hasta</span>
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium text-foreground">Ventana traslados</span>
              <select
                value={transferWindowDays}
                onChange={(event) => setTransferWindowDays(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="1">Ultimo dia</option>
                <option value="3">Ultimos 3 dias</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-3 xl:grid-cols-4">
              <div className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Tipo operacion</span>
                <NativeSelect value={operationTypeFilter} onChange={(event) => setOperationTypeFilter(event.target.value)}>
                  <option value="TODOS">Todos</option>
                  <option value="ADMIN-CONTADO">Admin contado</option>
                  <option value="ADMIN-CREDITO">Admin credito</option>
                  <option value="POS-CONTADO">POS contado</option>
                  <option value="POS-CREDITO">POS credito</option>
                  <option value="APP_MOVIL-CONTADO">App movil contado</option>
                  <option value="APP_MOVIL-CREDITO">App movil credito</option>
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Cliente</span>
                <NativeSelect value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
                  <option value="TODOS">Todos</option>
                  {clients.map((client) => (
                    <option key={client.id} value={String(client.id)}>{`${client.firstName} ${client.lastName}`}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Usuario / vendedor</span>
                <NativeSelect value={sellerFilter} onChange={(event) => setSellerFilter(event.target.value)}>
                  <option value="TODOS">Todos</option>
                  {users.map((u) => (
                    <option key={u.id} value={String(u.id)}>{u.username}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Deposito</span>
                <NativeSelect value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
                  <option value="TODOS">Todos</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={String(warehouse.id)}>{warehouse.location}</option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-4">
              <div className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Zona</span>
                <Input value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} placeholder="Centro" />
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Ciudad</span>
                <Input value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} placeholder="Cartagena" />
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Estacion</span>
                <Input value={stationFilter} onChange={(event) => setStationFilter(event.target.value)} placeholder="Caja 1" />
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={() => {
                  setOperationTypeFilter('TODOS')
                  setClientFilter('TODOS')
                  setSellerFilter('TODOS')
                  setWarehouseFilter('TODOS')
                  setZoneFilter('')
                  setCityFilter('')
                  setStationFilter('')
                }}>
                  Limpiar filtros del cierre
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              Facturas en corte: <span className="font-medium text-foreground">{formatNumber(report.rangedInvoices.length)}</span>
            </span>
            <span>
              Recaudo bancario: <span className="font-medium text-foreground">{formatCurrency(report.collectedInBanks)}</span>
            </span>
            <span>
              Traslados inventario: <span className="font-medium text-foreground">{formatNumber(report.transfers.length)}</span>
            </span>
            <span>
              Corte stock semanal: <span className="font-medium text-foreground">{report.weeklyStockCutoffLabel}</span>
            </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reportSections.map((section) => {
          const Icon = section.icon

          return (
            <Card key={section.key} className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                    <CardDescription className="mt-1">{section.description}</CardDescription>
                  </div>
                  <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                    <Icon className="size-5" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 text-sm">
                  {section.metrics.slice(0, 3).map((metric) => (
                    <div key={metric.label} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/15 px-3 py-2">
                      <span className="text-muted-foreground">{metric.label}</span>
                      <span className="font-medium text-foreground">{metric.value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => exportSectionPdf(section.key)}>
                    <Printer className="mr-2 size-4" />
                    Descargar PDF
                  </Button>
                  <Button variant="outline" onClick={() => exportSectionCsv(section.key)}>
                    <Download className="mr-2 size-4" />
                    Descargar CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
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

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Transacciones procesadas</CardTitle>
            <CardDescription>Comportamiento del total facturado y del IVA dentro del periodo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <LineChart data={report.salesTimeline}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={3} dot={{ fill: 'var(--color-total)' }} />
                <Line type="monotone" dataKey="taxes" stroke="var(--color-taxes)" strokeWidth={2} dot={{ fill: 'var(--color-taxes)' }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Semaforo de stock</CardTitle>
            <CardDescription>Lectura rapida para reposicion, seguimiento y ventas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                <Pie data={stockDistribution} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={4}>
                  {stockDistribution.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Productos mas vendidos</CardTitle>
            <CardDescription>Ranking por unidades y total vendido en facturas activas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <BarChart data={topProducts} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={60} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={formatNumber} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="quantity" fill="var(--color-quantity)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Lectura analitica</CardTitle>
            <CardDescription>Dimensiones comerciales que hoy si soporta la API.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-primary">
                <BarChart3 className="size-4" />
                <span className="font-medium">Mejor categoria</span>
              </div>
              <p className="mt-2 text-lg font-semibold text-foreground">{topCategories[0]?.label ?? 'Sin ventas'}</p>
              <p className="text-xs text-muted-foreground">
                {topCategories[0] ? `${formatCurrency(topCategories[0].total)} en ${formatNumber(topCategories[0].quantity)} unidades` : 'Aun no hay facturas activas en el corte.'}
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-primary">
                <PackageSearch className="size-4" />
                <span className="font-medium">Proveedor lider</span>
              </div>
              <p className="mt-2 text-lg font-semibold text-foreground">{topProviders[0]?.label ?? 'Sin ventas'}</p>
              <p className="text-xs text-muted-foreground">
                {topProviders[0] ? formatCurrency(topProviders[0].total) : 'Sin acumulado en el rango.'}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-900 dark:text-amber-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4" />
                <span className="font-medium">Alcance actual</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Este corte ya cruza usuario, deposito, ciudad, zona, estacion, costos historicos, utilidad y porcentaje de utilidad sobre las transacciones procesadas en el periodo.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>Transacciones procesadas</CardTitle>
            <CardDescription>Lectura operativa con neto, contado, credito, impuestos, total, costo, utilidad y porcentaje por factura.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportSectionPdf('FACTURAS')}>
              <Printer className="mr-2 size-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={exportInvoiceReport}>
              <Download className="mr-2 size-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Numero</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Deposito</TableHead>
                  <TableHead>Operacion</TableHead>
                  <TableHead>Monto neto</TableHead>
                  <TableHead>Contado</TableHead>
                  <TableHead>Credito</TableHead>
                  <TableHead>Impuestos</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Utilidad</TableHead>
                  <TableHead>% Utilidad</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.invoiceRows.length ? (
                  report.invoiceRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.createdAt)}</TableCell>
                      <TableCell className="font-medium">{row.consecutive}</TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell>{row.sellerName}</TableCell>
                      <TableCell>{row.warehouseName}</TableCell>
                      <TableCell>{`${row.source} · ${formatSaleMode(row.saleMode)}`}</TableCell>
                      <TableCell>{formatCurrency(row.subtotal)}</TableCell>
                      <TableCell>{formatCurrency(row.contado)}</TableCell>
                      <TableCell>{formatCurrency(row.credito)}</TableCell>
                      <TableCell>{formatCurrency(row.taxes)}</TableCell>
                      <TableCell>{formatCurrency(row.total)}</TableCell>
                      <TableCell>{formatCurrency(row.cost)}</TableCell>
                      <TableCell>{formatCurrency(row.profit)}</TableCell>
                      <TableCell>{formatPercent(row.profitPercentage)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'ACTIVA' ? 'default' : 'secondary'}>
                          {formatInvoiceStatus(row.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={15} className="py-12 text-center text-muted-foreground">
                      No hay facturas en el rango seleccionado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>IVA cobrado</CardTitle>
              <CardDescription>Detalle del impuesto por tarifa para declaraciones y revisiones.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportSectionPdf('IVA')}>
                <Printer className="mr-2 size-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={exportIvaReport}>
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {report.ivaRows.length ? (
              report.ivaRows.map((row) => (
                <div key={row.rate} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Tarifa {formatPercent(row.rate)}</p>
                      <p className="text-xs text-muted-foreground">Base {formatCurrency(row.base)} · Total {formatCurrency(row.total)}</p>
                    </div>
                    <p className="text-lg font-semibold text-foreground">{formatCurrency(row.taxes)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">
                No hay IVA para el rango seleccionado.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>Base para exogenas</CardTitle>
              <CardDescription>Consolidado por cliente para analisis y exportacion contable.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportSectionPdf('EXOGENAS')}>
                <Printer className="mr-2 size-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={exportExogenousReport}>
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Facturas</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>IVA</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Credito pendiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.exogenousRows.length ? (
                    report.exogenousRows.map((row) => (
                      <TableRow key={row.clientId}>
                        <TableCell>{row.identification}</TableCell>
                        <TableCell className="font-medium">{row.clientName}</TableCell>
                        <TableCell>{row.clientType ? formatClientType(row.clientType) : 'Sin tipo'}</TableCell>
                        <TableCell>{formatNumber(row.invoices)}</TableCell>
                        <TableCell>{formatCurrency(row.subtotal)}</TableCell>
                        <TableCell>{formatCurrency(row.taxes)}</TableCell>
                        <TableCell>{formatCurrency(row.total)}</TableCell>
                        <TableCell>{formatCurrency(row.pendingCredit)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                        No hay base exogena para este corte.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1.25fr]">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>4x1000 segmentado</CardTitle>
              <CardDescription>
                Segmentacion real del GMF sobre movimientos que salen de las cuentas bancarias del negocio.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportSectionPdf('GMF')}>
                <Printer className="mr-2 size-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={() => exportSectionCsv('GMF')}>
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Movimientos</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>4x1000</TableHead>
                    <TableHead>Impacto total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.gmfByAccount.length ? (
                    report.gmfByAccount.map((row) => (
                      <TableRow key={row.bankAccountId}>
                        <TableCell className="font-medium">{row.accountName}</TableCell>
                        <TableCell>{row.bankName}</TableCell>
                        <TableCell>{formatNumber(row.movements)}</TableCell>
                        <TableCell>{formatCurrency(row.base)}</TableCell>
                        <TableCell>{formatCurrency(row.tax)}</TableCell>
                        <TableCell>{formatCurrency(row.impact)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        No hay movimientos gravables con 4x1000 en el corte.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Referencia: por cada {formatCurrency(1000000)} con 4x1000 aplicado, el sistema registra {formatCurrency(1000000 * GMF_RATE)} de GMF y {formatCurrency(1000000 * (1 + GMF_RATE))} de salida total.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Movimientos con impacto GMF</CardTitle>
            <CardDescription>Detalle de cada egreso o transferencia saliente del rango.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>4x1000</TableHead>
                    <TableHead>Factura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.gmfMovements.length ? (
                    report.gmfMovements.slice(0, 10).map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{formatDate(movement.createdAt)}</TableCell>
                        <TableCell>{movement.bankAccount?.name ?? `Cuenta #${movement.bankAccountId}`}</TableCell>
                        <TableCell>{movement.movementType}</TableCell>
                        <TableCell>{formatCurrency(movement.base)}</TableCell>
                        <TableCell>{formatCurrency(movement.tax)}</TableCell>
                        <TableCell>{movement.invoice?.consecutive ?? 'Sin factura'}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        Sin movimientos bancarios que generen calculo de 4x1000.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Ventas por categoria</CardTitle>
            <CardDescription>Que tipo de producto se esta moviendo mas.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {topCategories.length ? topCategories.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">#{row.rank} {row.label}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(row.quantity)} unidades</p>
                </div>
                <span className="font-semibold text-foreground">{formatCurrency(row.total)}</span>
              </div>
            )) : <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">Sin ventas por categoria en el corte.</div>}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Ventas por proveedor</CardTitle>
            <CardDescription>Lectura de dependencia y rotacion por abastecedor.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {topProviders.length ? topProviders.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">#{row.rank} {row.label}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(row.quantity)} unidades</p>
                </div>
                <span className="font-semibold text-foreground">{formatCurrency(row.total)}</span>
              </div>
            )) : <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">Sin ventas por proveedor en el corte.</div>}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Top clientes</CardTitle>
            <CardDescription>Clientes con mayor volumen de facturacion.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {topClients.length ? topClients.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">#{row.rank} {row.label}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(row.quantity)} facturas</p>
                </div>
                <span className="font-semibold text-foreground">{formatCurrency(row.total)}</span>
              </div>
            )) : <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">Sin ventas por cliente en el corte.</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>Stock critico y regular</CardTitle>
              <CardDescription>Semaforo rojo, amarillo y verde para tomar decisiones rapidas.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportSectionPdf('STOCK')}>
                <Printer className="mr-2 size-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={() => exportSectionCsv('STOCK')}>
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Min / Max</TableHead>
                    <TableHead>Semaforo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.lowStockProducts.length ? (
                    report.lowStockProducts.slice(0, 10).map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <ProductImage src={product.imageUrl} alt={product.name} className="size-12 rounded-lg" iconClassName="size-4" />
                            <div>
                              <p className="font-medium text-foreground">{product.name}</p>
                              <p className="text-xs text-muted-foreground">{product.brand}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatNumber(product.totalStock)}</TableCell>
                        <TableCell>
                          Min {formatNumber(product.minimumStock)}
                          {product.maximumStock !== null && product.maximumStock !== undefined
                            ? ` · Max ${formatNumber(product.maximumStock)}`
                            : ' · Max libre'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={product.signal.badgeClass}>
                            {product.signal.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                        No hay productos en rojo o amarillo con el inventario actual.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader>
            <CardTitle>Traslados de inventario</CardTitle>
            <CardDescription>Reporte interno para cierres y control logistico.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {report.transfers.length ? (
              report.transfers.slice(0, 8).map((movement) => (
                <div key={movement.id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{movement.product?.name ?? `Producto #${movement.productId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {movement.fromWarehouse?.location ?? 'Origen N/A'} → {movement.toWarehouse?.location ?? 'Destino N/A'}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                      {formatNumber(movement.quantity)} und
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {movement.reason ?? 'Sin motivo'} · {formatDate(movement.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">
                No hay traslados de inventario en el rango seleccionado.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>Top de productos vendidos</CardTitle>
            <CardDescription>Profundizacion sobre lo que mas rota y cuanto factura cada referencia.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportSectionPdf('PRODUCTOS')}>
              <Printer className="mr-2 size-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={() => exportSectionCsv('PRODUCTOS')}>
              <Download className="mr-2 size-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead>Neto</TableHead>
                  <TableHead>IVA</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.productSales.length ? (
                  report.productSales.map((product) => (
                    <TableRow key={product.productId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductImage src={product.imageUrl} alt={product.name} className="size-12 rounded-lg" iconClassName="size-4" />
                          <div>
                            <p className="font-medium text-foreground">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.brand}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{product.productTypeName}</TableCell>
                      <TableCell>{product.providerName}</TableCell>
                      <TableCell>{formatNumber(product.quantity)}</TableCell>
                      <TableCell>{formatCurrency(product.subtotal)}</TableCell>
                      <TableCell>{formatCurrency(product.taxes)}</TableCell>
                      <TableCell>{formatCurrency(product.total)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      Aun no hay items facturados para el rango actual.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Enviar reporte por correo</DialogTitle>
            <DialogDescription>
              Envia el corte actual por Resend incluyendo la fecha de corte y solo los bloques que necesites compartir.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="report-email-to">Destinatarios</Label>
              <Textarea
                id="report-email-to"
                rows={3}
                value={emailRecipients}
                onChange={(event) => setEmailRecipients(event.target.value)}
                placeholder="contabilidad@empresa.com gerencia@empresa.com"
              />
              <p className="text-xs text-muted-foreground">
                Separa varios correos por coma, espacio o salto de linea.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="report-email-subject">Asunto</Label>
              <Input
                id="report-email-subject"
                value={emailSubject}
                onChange={(event) => setEmailSubject(event.target.value)}
                placeholder="Reporte de corte 2026-07-01 a 2026-07-31"
              />
            </div>

            <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/15 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Bloques a incluir</p>
                <p className="text-xs text-muted-foreground">Puedes enviar solo los reportes necesarios para este corte.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {reportEmailSectionOptions.map((option) => (
                  <label key={option.value} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background p-3 text-left">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedEmailSections.includes(option.value)}
                      onChange={() => toggleEmailSection(option.value)}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEmailDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSendReportEmail} disabled={sendReportEmailMutation.isPending}>
              {sendReportEmailMutation.isPending ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <Mail className="mr-2 size-4" />
              )}
              {sendReportEmailMutation.isPending ? 'Enviando...' : 'Enviar reporte'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
