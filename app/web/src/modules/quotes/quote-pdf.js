import {
  addDocumentHeader,
  addMetricsGrid,
  addSectionTable,
  createPdfDocument,
  savePdfDocument,
} from '@/lib/pdf-utils'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'

function buildQuotePdf(quote) {
  const doc = createPdfDocument()
  const clientName = `${quote.client?.firstName ?? ''} ${quote.client?.lastName ?? ''}`.trim() || 'Cliente general'
  const startY = addDocumentHeader(doc, {
    eyebrow: 'Cotizacion PDF',
    title: quote.consecutive,
    subtitle: `${clientName} · ${quote.status}`,
    meta: [
      `Fecha: ${formatDate(quote.createdAt)}`,
      `Vigencia: ${quote.expiresAt ? formatDate(quote.expiresAt) : 'Sin fecha'}`,
    ],
  })

  const metricsY = addMetricsGrid(doc, [
    { label: 'Cliente', value: clientName, help: quote.client?.identification ?? 'Sin documento' },
    { label: 'Items', value: formatNumber(quote.items?.length ?? 0), help: 'Lineas cotizadas.' },
    { label: 'Subtotal', value: formatCurrency(quote.subtotal), help: 'Base antes de impuestos.' },
    { label: 'Total', value: formatCurrency(quote.total), help: `IVA ${formatCurrency(quote.taxes)}` },
  ], startY)

  addSectionTable(doc, {
    title: 'Detalle de la cotizacion',
    subtitle: 'Precios y cantidades ofrecidos al cliente.',
    startY: metricsY + 4,
    filenameHint: `${quote.consecutive}.pdf`,
    head: [['Producto', 'Precio', 'Cantidad', 'IVA', 'Total']],
    body: (quote.items ?? []).map((item) => [
      `${item.product?.name ?? `Producto #${item.productId}`}\n${item.productPrice?.name ?? 'Precio default'}`,
      formatCurrency(item.unitPrice),
      formatNumber(item.quantity),
      formatCurrency(item.taxAmount),
      formatCurrency(item.total),
    ]),
    columnStyles: {
      0: { cellWidth: 85 },
      1: { halign: 'right', cellWidth: 28 },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 30 },
    },
  })

  return doc
}

export function downloadQuotePdf(quote) {
  savePdfDocument(buildQuotePdf(quote), `${quote.consecutive}.pdf`)
}
