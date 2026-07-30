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
