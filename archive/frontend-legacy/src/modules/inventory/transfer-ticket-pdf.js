import {
  addDocumentHeader,
  addSectionTable,
  createPdfDocument,
  savePdfDocument,
} from '@/lib/pdf-utils'
import { formatDate, formatNumber } from '@/lib/format'

function buildTransferTicketPdf(movement) {
  const doc = createPdfDocument()
  const ticket = movement.transferTicket
  const startY = addDocumentHeader(doc, {
    eyebrow: 'Soporte de traslado',
    title: ticket?.ticketNumber ?? `Movimiento ${movement.id}`,
    subtitle: `Soporte interno de retiro y traslado para ${movement.product?.name ?? `Producto #${movement.productId}`}.`,
    meta: [
      `Fecha ${formatDate(movement.createdAt)}`,
      `Tipo ${movement.movementType}`,
    ],
  })

  addSectionTable(doc, {
    title: 'Resumen del traslado',
    subtitle: 'Datos operativos del movimiento registrado en inventario.',
    startY: startY + 2,
    filenameHint: `${ticket?.ticketNumber ?? `movimiento-${movement.id}`}.pdf`,
    head: [['Campo', 'Valor']],
    body: [
      ['Producto', movement.product?.name ?? `Producto #${movement.productId}`],
      ['Cantidad', formatNumber(movement.quantity)],
      ['Origen', movement.fromWarehouse?.location ?? 'N/A'],
      ['Destino', movement.toWarehouse?.location ?? 'N/A'],
      ['Motivo', movement.reason ?? 'Sin motivo'],
      ['Soporte', ticket?.supportNote ?? 'Sin soporte'],
      ['Creado por', movement.createdByUser?.username ?? 'Sin dato'],
      ['Aprobado por', movement.approvedByUser?.username ?? 'Sin dato'],
      ['Fecha', formatDate(movement.createdAt)],
    ],
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 140 },
    },
  })

  return doc
}

export function downloadTransferTicketPdf(movement) {
  const filename = `${movement.transferTicket?.ticketNumber ?? `movimiento-${movement.id}`}.pdf`
  savePdfDocument(buildTransferTicketPdf(movement), filename)
}
