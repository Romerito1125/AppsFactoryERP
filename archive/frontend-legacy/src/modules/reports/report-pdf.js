import {
  addDocumentHeader,
  addMetricsGrid,
  addSectionTable,
  createPdfDocument,
  savePdfDocument,
} from '@/lib/pdf-utils'

function buildReportPdf(reportConfig) {
  const wideTable = (reportConfig.columns?.length ?? 0) > 10
  const doc = createPdfDocument({ orientation: wideTable ? 'landscape' : 'portrait' })
  const startY = addDocumentHeader(doc, {
    eyebrow: 'Reporte subdividido',
    title: reportConfig.title,
    subtitle: reportConfig.subtitle,
    meta: reportConfig.meta,
  })

  if (reportConfig.semaphoreColor) {
    const colors = {
      VERDE: [16, 185, 129],
      AMARILLO: [245, 158, 11],
      ROJO: [239, 68, 68],
    }
    const color = colors[reportConfig.semaphoreColor] ?? colors.VERDE
    doc.setFillColor(...color)
    doc.circle(doc.internal.pageSize.getWidth() - 18, 16, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...color)
    doc.text(`Semaforo: ${reportConfig.semaphoreColor}`, doc.internal.pageSize.getWidth() - 14, 17, { align: 'right' })
  }

  const metricsY = reportConfig.metrics?.length ? addMetricsGrid(doc, reportConfig.metrics, startY) : startY

  addSectionTable(doc, {
    title: reportConfig.tableTitle,
    subtitle: reportConfig.tableSubtitle,
    startY: metricsY + 4,
    filenameHint: reportConfig.filename,
    head: [reportConfig.columns.map((column) => column.pdfLabel ?? column.label)],
    body: reportConfig.rows.map((row) => reportConfig.columns.map((column) => row[column.key] ?? '')),
    columnStyles: reportConfig.columnStyles,
    styles: wideTable
      ? {
          fontSize: 6.5,
          cellPadding: 1.5,
        }
      : undefined,
  })

  return doc
}

export function downloadReportPdf(reportConfig) {
  const doc = buildReportPdf(reportConfig)
  savePdfDocument(doc, reportConfig.filename)
}
