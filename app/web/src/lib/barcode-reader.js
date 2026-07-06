const ZXING_TYPE_TO_APP_TYPE = {
  EAN_13: 'EAN13',
  EAN_8: 'EAN8',
  UPC_A: 'UPC_A',
  UPC_E: 'UPC_E',
  CODE_128: 'CODE128',
  QR_CODE: 'QR',
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
    const rawFormat = BarcodeFormat[result.getBarcodeFormat?.()]

    return {
      code: result.getText(),
      type: ZXING_TYPE_TO_APP_TYPE[rawFormat] ?? 'OTHER',
      rawFormat,
    }
  } catch {
    throw new Error('No se pudo leer un codigo de barras en la imagen')
  } finally {
    reader.reset()
    URL.revokeObjectURL(objectUrl)
  }
}
