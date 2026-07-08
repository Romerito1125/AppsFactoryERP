import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { inferBarcodeTypeFromCode } from '@/lib/barcodes'

const OCR_LANGUAGES = 'spa+eng'
const MAX_PDF_PAGES = 3
const INVOICE_SKIP_HINTS = [
  'factura',
  'fecha',
  'cliente',
  'direccion',
  'telefono',
  'vendedor',
  'cajero',
  'subtotal',
  'descuento',
  'impuesto',
  'iva',
  'total',
  'nit',
  'resolucion',
  'autorizacion',
  'pagina',
  'unidad',
  'descripcion',
  'cantidad',
  'precio',
  'valor',
]
const PRICE_TOKEN_PATTERN = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?/g
const LONG_CODE_PATTERN = /\b(?:\d{8,14}|[A-Z0-9][A-Z0-9\-._/]{5,})\b/gi

function normalizeSpaces(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function parseNumericToken(token) {
  const cleaned = token.replace(/[^\d,.-]/g, '')

  if (!cleaned) {
    return null
  }

  const hasComma = cleaned.includes(',')
  const hasDot = cleaned.includes('.')

  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.'))
    }

    return Number(cleaned.replace(/,/g, ''))
  }

  if (hasComma) {
    const decimalTail = cleaned.split(',').at(-1) ?? ''
    return Number(decimalTail.length === 2 ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, ''))
  }

  if (hasDot) {
    const decimalTail = cleaned.split('.').at(-1) ?? ''
    return Number(decimalTail.length === 2 ? cleaned.replace(/,/g, '') : cleaned.replace(/\./g, ''))
  }

  return Number(cleaned)
}

function extractPriceNumbers(line, ignoredTokens = []) {
  const ignoredSet = new Set(ignoredTokens.filter(Boolean))

  return [...line.matchAll(PRICE_TOKEN_PATTERN)]
    .map((match) => match[0])
    .filter((token) => !ignoredSet.has(token))
    .map((token) => parseNumericToken(token))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 100000000)
}

function extractPossibleCode(line) {
  const candidates = [...line.matchAll(LONG_CODE_PATTERN)]
    .map((match) => match[0])
    .filter((candidate) => {
      const uppercase = candidate.toUpperCase()
      return !INVOICE_SKIP_HINTS.some((hint) => uppercase.includes(hint.toUpperCase()))
    })

  return candidates[0] ?? ''
}

function extractQuantity(line, defaults) {
  const explicitQuantity = line.match(/(?:cant|cantidad|qty|und|unid|x)\s*[:x-]?\s*(\d{1,4})/i)

  if (explicitQuantity) {
    return Number(explicitQuantity[1])
  }

  const startQuantity = line.match(/^\s*(\d{1,4})\s+(?=[A-Z0-9])/i)

  if (startQuantity) {
    return Number(startQuantity[1])
  }

  return Math.max(1, Number(defaults.defaultQuantity ?? 1))
}

function extractName(line, code, priceTokens, quantity) {
  let name = ` ${line} `

  if (code) {
    name = name.replace(code, ' ')
  }

  for (const token of priceTokens) {
    name = name.replace(token, ' ')
  }

  if (quantity) {
    name = name.replace(new RegExp(`\\b${quantity}\\b`, 'g'), ' ')
  }

  name = normalizeSpaces(
    name
      .replace(/\b(?:cant|cantidad|qty|und|unid|precio|valor|total|iva|desc)\b/gi, ' ')
      .replace(/[|*]+/g, ' ')
      .replace(/\s+x\s+/gi, ' '),
  )

  return name
}

function shouldSkipLine(line) {
  const normalized = normalizeSpaces(line)

  if (!normalized || normalized.length < 6) {
    return true
  }

  const lowerLine = normalized.toLowerCase()

  if (INVOICE_SKIP_HINTS.some((hint) => lowerLine.includes(hint))) {
    return true
  }

  if (!/[a-z]/i.test(normalized)) {
    return true
  }

  return false
}

function parseLineToDraft(line, defaults) {
  if (shouldSkipLine(line)) {
    return null
  }

  const normalizedLine = normalizeSpaces(line)
  const code = extractPossibleCode(normalizedLine)
  const priceMatches = [...normalizedLine.matchAll(PRICE_TOKEN_PATTERN)].map((match) => match[0])
  const priceNumbers = extractPriceNumbers(normalizedLine, [code])

  if (!priceNumbers.length) {
    return null
  }

  const quantity = extractQuantity(normalizedLine, defaults)
  const highestPrice = Math.max(...priceNumbers)
  const bestUnitPrice = priceNumbers.find((value) => value === highestPrice && quantity === 1)
  const unitPrice = bestUnitPrice ?? (priceNumbers.length > 1 ? priceNumbers[priceNumbers.length - 2] : highestPrice / quantity)

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return null
  }

  const name = extractName(normalizedLine, code, priceMatches, quantity)

  if (!name || name.length < 2) {
    return null
  }

  return {
    id: `${code || name}-${unitPrice}-${quantity}`,
    isSelected: true,
    code,
    barcodeType: code ? inferBarcodeTypeFromCode(code) : '',
    name,
    quantity,
    unitPrice: Math.round(unitPrice),
    taxRate: Number(defaults.taxRate ?? 0),
    brand: defaults.brand ?? '',
    description: '',
    rawLine: normalizedLine,
  }
}

async function recognizeImage(source, onProgress) {
  const tesseractModule = await import('tesseract.js')
  const Tesseract = tesseractModule.default ?? tesseractModule
  const result = await Tesseract.recognize(source, OCR_LANGUAGES, {
    logger: (message) => {
      if (message?.status) {
        onProgress?.(message)
      }
    },
  })

  return result.data.text ?? ''
}

async function extractPdfText(file, onProgress) {
  const pdfjsModule = await import('pdfjs-dist/build/pdf.mjs')
  const pdfjs = pdfjsModule.default ?? pdfjsModule
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pageTexts = []
  const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES)

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    onProgress?.({ status: `Procesando pagina ${pageNumber} de ${totalPages}`, progress: pageNumber / totalPages })
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false })

    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    await page.render({ canvasContext: context, viewport }).promise
    pageTexts.push(await recognizeImage(canvas, onProgress))
  }

  return pageTexts.join('\n\n')
}

export async function extractTextFromDocument(file, options = {}) {
  if (!(file instanceof File)) {
    throw new Error('Selecciona una factura valida en PDF o imagen')
  }

  const fileType = file.type.toLowerCase()

  if (fileType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file, options.onProgress)
  }

  if (fileType.startsWith('image/')) {
    return recognizeImage(file, options.onProgress)
  }

  throw new Error('El OCR solo soporta archivos PDF o imagen')
}

export function parseInvoiceTextToProductDrafts(text, defaults = {}) {
  const drafts = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => parseLineToDraft(line, defaults))
    .filter(Boolean)

  const seen = new Set()

  return drafts.filter((draft) => {
    const key = `${draft.code}|${draft.name}|${draft.unitPrice}|${draft.quantity}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}
