import { inferBarcodeTypeFromCode } from '@/lib/barcodes'

const ZXING_TYPE_TO_APP_TYPE = {
  EAN_13: 'EAN13',
  EAN_8: 'EAN8',
  UPC_A: 'UPC_A',
  UPC_E: 'UPC_E',
  CODE_128: 'CODE128',
  QR_CODE: 'QR',
}

function buildDecodedBarcode(result, BarcodeFormat) {
  const code = result.getText()
  const rawFormat = BarcodeFormat[result.getBarcodeFormat?.()]

  return {
    code,
    type: ZXING_TYPE_TO_APP_TYPE[rawFormat] ?? inferBarcodeTypeFromCode(code),
    rawFormat,
  }
}

export async function readBarcodeFromImage(file) {
  if (!(file instanceof File)) {
    throw new Error('Selecciona una imagen valida')
  }

  const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])

  const reader = new BrowserMultiFormatReader()
  const objectUrl = URL.createObjectURL(file)

  try {
    const result = await reader.decodeFromImageUrl(objectUrl)
    return buildDecodedBarcode(result, BarcodeFormat)
  } catch {
    throw new Error('No se pudo leer un codigo de barras en la imagen')
  } finally {
    reader.reset()
    URL.revokeObjectURL(objectUrl)
  }
}

export async function scanBarcodeFromVideo(videoElement, options = {}) {
  if (!videoElement) {
    throw new Error('No se pudo abrir la vista previa de la camara')
  }

  const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])

  const reader = new BrowserMultiFormatReader()

  return new Promise((resolve, reject) => {
    let controls = null
    let settled = false

    const finish = (callback, value) => {
      if (settled) {
        return
      }

      settled = true

      try {
        controls?.stop?.()
      } finally {
        reader.reset()
        options.signal?.removeEventListener('abort', abortHandler)
      }

      callback(value)
    }

    const abortHandler = () => finish(reject, new DOMException('Escaneo cancelado', 'AbortError'))
    options.signal?.addEventListener('abort', abortHandler, { once: true })

    ;(async () => {
      try {
        controls = await reader.decodeFromVideoDevice(options.deviceId, videoElement, (result) => {
          if (!result) {
            return
          }

          finish(resolve, buildDecodedBarcode(result, BarcodeFormat))
        })
      } catch {
        finish(reject, new Error('No se pudo iniciar la camara para escanear'))
      }
    })()
  })
}
