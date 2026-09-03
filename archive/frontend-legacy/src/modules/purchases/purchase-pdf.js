import {
  addDocumentHeader,
  addMetricsGrid,
  addSectionTable,
  createPdfDocument,
  savePdfDocument,
} from '@/lib/pdf-utils'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'

function getProviderName(purchase) {
  return purchase.provider?.name ?? `Proveedor #${purchase.providerId}`
}

function buildPurchasePdf(purchase) {
  const doc = createPdfDocument()
  const startY = addDocumentHeader(doc, {
    eyebrow: 'Orden de compra PDF',
    title: purchase.consecutive,
    subtitle: `${getProviderName(purchase)} · ${purchase.status}`,
    meta: [
      `Fecha: ${formatDate(purchase.orderedAt)}`,
      `Bodega: ${purchase.warehouse?.location ?? 'Sin bodega'}`,
    ],
  })
  const metricsY = addMetricsGrid(doc, [
    { label: 'Proveedor', value: getProviderName(purchase), help: purchase.provider?.phonePrimary ?? 'Sin telefono' },
    { label: 'Items', value: formatNumber(purchase.items?.length ?? 0), help: 'Lineas del pedido.' },
    { label: 'Subtotal', value: formatCurrency(purchase.subtotal), help: 'Base de compra.' },
    { label: 'Total', value: formatCurrency(purchase.total), help: `Impuestos ${formatCurrency(purchase.taxes)}` },
  ], startY)
  addSectionTable(doc, {
    title: 'Productos solicitados',
    subtitle: purchase.notes ?? 'Documento para compartir con el proveedor.',
    startY: metricsY + 4,
    filenameHint: `${purchase.consecutive}.pdf`,
    head: [['Producto', 'Cantidad', 'Costo unitario', 'Impuesto', 'Total']],
    body: (purchase.items ?? []).map((item) => [
      item.product?.name ?? `Producto #${item.productId}`,
      formatNumber(item.quantity),
      formatCurrency(item.unitCost),
      `${formatNumber(item.taxRate)}%`,
      formatCurrency(item.total),
    ]),
    columnStyles: {
      0: { cellWidth: 82 },
      1: { halign: 'right', cellWidth: 24 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 24 },
      4: { halign: 'right', cellWidth: 32 },
    },
  })
  return doc
}

export function downloadPurchasePdf(purchase) {
  savePdfDocument(buildPurchasePdf(purchase), `${purchase.consecutive}.pdf`)
}

export function sharePurchaseOnWhatsApp(purchase) {
  downloadPurchasePdf(purchase)
  const message = `Orden ${purchase.consecutive} para ${getProviderName(purchase)}. Total: ${formatCurrency(purchase.total)}. El PDF se descargó para adjuntarlo en este chat.`
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}
