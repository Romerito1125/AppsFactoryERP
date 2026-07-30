import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const PAGE_MARGIN = 14

function getPageDimensions(doc) {
  return {
    width: doc.internal.pageSize.getWidth(),
    height: doc.internal.pageSize.getHeight(),
  }
}

export function createPdfDocument(options = {}) {
  return new jsPDF({
    orientation: options.orientation ?? 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })
}

export function addDocumentHeader(doc, { eyebrow, title, subtitle, meta = [] }) {
  const { width } = getPageDimensions(doc)
  let y = PAGE_MARGIN

  if (eyebrow) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(37, 99, 235)
    doc.text(String(eyebrow).toUpperCase(), PAGE_MARGIN, y)
    y += 6
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42)
  doc.text(title, PAGE_MARGIN, y)
  y += 7

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(71, 85, 105)
    const lines = doc.splitTextToSize(subtitle, width - PAGE_MARGIN * 2)
    doc.text(lines, PAGE_MARGIN, y)
    y += lines.length * 4.5
  }

  if (meta.length) {
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(meta.join('   |   '), PAGE_MARGIN, y + 1)
    y += 7
  }

  return y
}

export function addMetricsGrid(doc, metrics, startY) {
  const { width } = getPageDimensions(doc)
  const cardWidth = (width - PAGE_MARGIN * 2 - 6) / 2
  let currentY = startY

  metrics.forEach((metric, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = PAGE_MARGIN + column * (cardWidth + 6)
    const y = startY + row * 24

    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, y, cardWidth, 18, 3, 3, 'FD')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(metric.label, x + 4, y + 6)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(15, 23, 42)
    doc.text(metric.value, x + 4, y + 12)

    if (metric.help) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      const help = doc.splitTextToSize(metric.help, cardWidth - 8)
      doc.text(help[0], x + 4, y + 16)
    }

    currentY = Math.max(currentY, y + 22)
  })

  return currentY
}

export function addSectionTitle(doc, title, subtitle, startY) {
  const { width } = getPageDimensions(doc)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text(title, PAGE_MARGIN, startY)

  let nextY = startY + 5

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    const lines = doc.splitTextToSize(subtitle, width - PAGE_MARGIN * 2)
    doc.text(lines, PAGE_MARGIN, nextY)
    nextY += lines.length * 4
  }

  return nextY + 1
}

export function addSectionTable(doc, { title, subtitle, head, body, startY, filenameHint, styles, columnStyles }) {
  const { height } = getPageDimensions(doc)
  const tableStartY = addSectionTitle(doc, title, subtitle, startY)

  autoTable(doc, {
    startY: tableStartY,
    head,
    body,
    margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      textColor: [15, 23, 42],
      overflow: 'linebreak',
      valign: 'middle',
      ...styles,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [248, 250, 252],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    didDrawPage: () => {
      if (filenameHint) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
         doc.text(filenameHint, PAGE_MARGIN, height - 6)
      }
    },
  })

  return doc.lastAutoTable?.finalY ?? tableStartY
}

export function addPageNumbers(doc) {
  const { width, height } = getPageDimensions(doc)
  const pages = doc.getNumberOfPages()

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Pagina ${page} de ${pages}`, width - PAGE_MARGIN, height - 6, { align: 'right' })
  }
}

export function savePdfDocument(doc, filename) {
  addPageNumbers(doc)
  doc.save(filename)
}

export function openPdfDocument(doc, fallbackFilename) {
  addPageNumbers(doc)

  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank', 'noopener,noreferrer')

  if (!popup) {
    doc.save(fallbackFilename)
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
