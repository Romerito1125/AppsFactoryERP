export const DEFAULT_BARCODE_TYPE = 'EAN13'

export const barcodeTypeOptions = [
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'UPC_A', label: 'UPC-A' },
  { value: 'UPC_E', label: 'UPC-E' },
  { value: 'CODE128', label: 'Code 128' },
  { value: 'QR', label: 'QR' },
  { value: 'OTHER', label: 'Otro' },
]

export const barcodeTypeLabels = Object.fromEntries(
  barcodeTypeOptions.map((option) => [option.value, option.label]),
)

export function inferBarcodeTypeFromCode(code) {
  const normalizedCode = code?.trim()

  if (!normalizedCode) {
    return DEFAULT_BARCODE_TYPE
  }

  if (/^https?:\/\//i.test(normalizedCode)) {
    return 'QR'
  }

  if (/^\d{13}$/.test(normalizedCode)) {
    return 'EAN13'
  }

  if (/^\d{8}$/.test(normalizedCode)) {
    return 'EAN8'
  }

  if (/^\d{12}$/.test(normalizedCode)) {
    return 'UPC_A'
  }

  if (/^\d{6,7}$/.test(normalizedCode)) {
    return 'UPC_E'
  }

  if (/^[A-Z0-9\-._/]+$/i.test(normalizedCode) && /[A-Z\-._/]/i.test(normalizedCode)) {
    return 'CODE128'
  }

  return 'OTHER'
}
