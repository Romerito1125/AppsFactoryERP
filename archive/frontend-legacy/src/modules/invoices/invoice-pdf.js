import {
  addDocumentHeader,
  addMetricsGrid,
  addSectionTable,
  createPdfDocument,
  openPdfDocument,
  savePdfDocument,
} from '@/lib/pdf-utils'
import { formatCurrency, formatDate, formatInvoiceSource, formatInvoiceStatus, formatNumber } from '@/lib/format'

function getInvoiceActorLabel(invoice) {
  if (invoice.source === 'APP_MOVIL') {
    return 'App movil'
  }

  if (invoice.createdByRole || invoice.createdByUsername) {
    return [invoice.createdByRole, invoice.createdByUsername].filter(Boolean).join(' · ')
  }

  return formatInvoiceSource(invoice.source)
}

function buildInvoicePdf(invoice) {
  const doc = createPdfDocument()
  const clientName = `${invoice.client?.firstName ?? ''} ${invoice.client?.lastName ?? ''}`.trim() || 'Cliente general'
  const startY = addDocumentHeader(doc, {
    eyebrow: 'Factura PDF',
    title: invoice.consecutive,
    subtitle: `${clientName} · ${formatInvoiceStatus(invoice.status)}`,
    meta: [
      `Fecha: ${formatDate(invoice.createdAt)}`,
      `Origen: ${formatInvoiceSource(invoice.source)}`,
      `Generado: ${formatDate(new Date().toISOString())}`,
    ],
  })

  const metricsY = addMetricsGrid(
    doc,
    [
      { label: 'Cliente', value: clientName, help: invoice.client?.identification ?? 'Sin documento' },
      { label: 'Creada por', value: getInvoiceActorLabel(invoice), help: formatInvoiceSource(invoice.source) },
      { label: 'Subtotal', value: formatCurrency(invoice.subtotal), help: 'Base antes de impuestos.' },
      { label: 'Total', value: formatCurrency(invoice.total), help: `IVA ${formatCurrency(invoice.taxes)}` },
      { label: 'Descuento total', value: formatCurrency(invoice.discountTotal ?? invoice.referralDiscount ?? 0), help: `Red ${formatCurrency(invoice.referralDiscount ?? 0)} · ofertas incluidas.` },
      { label: 'Estado', value: formatInvoiceStatus(invoice.status), help: `Items: ${formatNumber(invoice.items?.length ?? 0)}` },
    ],
    startY,
  )

  addSectionTable(doc, {
    title: 'Detalle facturado',
    subtitle: 'Las tablas se paginan automaticamente para que la informacion no se corte entre paginas.',
    startY: metricsY + 4,
    filenameHint: `${invoice.consecutive}.pdf`,
    head: [['Producto', 'Precio', 'Cantidad', 'IVA', 'Subtotal', 'Total']],
    body: (invoice.items ?? []).map((item) => [
      `${item.product?.name ?? `Producto #${item.productId}`}\n${item.product?.brand ?? item.productPrice?.name ?? 'Sin referencia'}`,
      formatCurrency(item.unitPrice),
      formatNumber(item.quantity),
      `${formatNumber(item.taxRate)}%`,
      formatCurrency(item.subtotal),
      formatCurrency(item.total),
    ]),
    columnStyles: {
      0: { cellWidth: 66 },
      1: { halign: 'right', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 16 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 26 },
    },
  })

  return doc
}

export function downloadInvoicePdf(invoice) {
  const doc = buildInvoicePdf(invoice)
  savePdfDocument(doc, `${invoice.consecutive}.pdf`)
}

export function openInvoicePdf(invoice) {
  const doc = buildInvoicePdf(invoice)
  openPdfDocument(doc, `${invoice.consecutive}.pdf`)
}
