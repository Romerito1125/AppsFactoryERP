import {
  addDocumentHeader,
  addMetricsGrid,
  addSectionTable,
  createPdfDocument,
  savePdfDocument,
} from '@/lib/pdf-utils'

function buildReportPdf(reportConfig) {
  const doc = createPdfDocument()
  const startY = addDocumentHeader(doc, {
    eyebrow: 'Reporte subdividido',
    title: reportConfig.title,
    subtitle: reportConfig.subtitle,
    meta: reportConfig.meta,
  })

  const metricsY = reportConfig.metrics?.length ? addMetricsGrid(doc, reportConfig.metrics, startY) : startY

  addSectionTable(doc, {
    title: reportConfig.tableTitle,
    subtitle: reportConfig.tableSubtitle,
    startY: metricsY + 4,
    filenameHint: reportConfig.filename,
    head: [reportConfig.columns.map((column) => column.label)],
    body: reportConfig.rows.map((row) => reportConfig.columns.map((column) => row[column.key] ?? '')),
    columnStyles: reportConfig.columnStyles,
  })

  return doc
}

export function downloadReportPdf(reportConfig) {
  const doc = buildReportPdf(reportConfig)
  savePdfDocument(doc, reportConfig.filename)
}
