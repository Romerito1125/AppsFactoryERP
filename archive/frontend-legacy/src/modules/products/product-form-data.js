import { DEFAULT_BARCODE_TYPE, inferBarcodeTypeFromCode } from '@/lib/barcodes'

export function normalizeBarcodePayload(barcodes) {
  const resolved = (barcodes ?? [])
    .map((barcode) => ({
      code: barcode.code.trim(),
      type: barcode.type || inferBarcodeTypeFromCode(barcode.code) || DEFAULT_BARCODE_TYPE,
      isPrimary: Boolean(barcode.isPrimary),
    }))
    .filter((barcode) => barcode.code)

  if (resolved.length === 1 && !resolved[0].isPrimary) {
    resolved[0].isPrimary = true
  }

  if (resolved.length > 1 && !resolved.some((barcode) => barcode.isPrimary)) {
    resolved[0].isPrimary = true
  }

  return resolved
}

export function normalizePricePayload(prices) {
  const resolved = (prices ?? [])
    .map((price) => ({
      name: price?.name?.trim() ?? '',
      price: Number(price?.price ?? 0),
      isDefault: Boolean(price?.isDefault),
    }))
    .filter((price) => price.name && price.price > 0)

  if (!resolved.length) {
    return []
  }

  if (!resolved.some((price) => price.isDefault)) {
    resolved[0].isDefault = true
  }

  const defaultIndex = resolved.findIndex((price) => price.isDefault)

  return resolved.map((price, index) => ({
    ...price,
    isDefault: index === defaultIndex,
  }))
}

function appendFormValue(formData, key, value) {
  if (value === undefined || value === null || value === '') {
    return
  }

  if (typeof File !== 'undefined' && value instanceof File) {
    formData.append(key, value)
    return
  }

  if (Array.isArray(value) || typeof value === 'object') {
    formData.append(key, JSON.stringify(value))
    return
  }

  formData.append(key, String(value))
}

export function buildProductFormData(values) {
  const formData = new FormData()

  Object.entries(values).forEach(([key, value]) => appendFormValue(formData, key, value))

  return formData
}

export function buildCreateProductFormData(values) {
  const resolvedPrices = values.prices?.length
    ? normalizePricePayload(values.prices)
    : normalizePricePayload([
        {
          name: values.initialPriceName,
          price: values.initialPrice,
          isDefault: true,
        },
      ])

  return buildProductFormData({
    productTypeId: values.productTypeId,
    providerId: values.providerId,
    providerIds: values.providerIds,
    name: values.name,
    image: values.image,
    description: values.description,
    brand: values.brand,
    taxRate: values.taxRate,
    minimumStock: values.minimumStock,
    maximumStock: values.maximumStock,
    prices: resolvedPrices,
    warehouses: [
      {
        warehouseId: values.initialWarehouseId,
        quantity: values.initialQuantity,
      },
    ],
    barcodes: normalizeBarcodePayload(values.barcodes),
    packaging: values.packaging,
  })
}

export function buildImportedProductFormData(draft, defaults) {
  const brand = draft.brand?.trim() || defaults.brand?.trim() || defaults.providerLabel || 'Sin marca'
  const quantity = Math.max(1, Number(draft.quantity ?? defaults.defaultQuantity ?? 1))
  const descriptionParts = [
    draft.description?.trim(),
    draft.rawLine ? `Linea OCR: ${draft.rawLine}` : null,
    defaults.sourceFileName ? `Archivo: ${defaults.sourceFileName}` : null,
  ].filter(Boolean)

  return buildCreateProductFormData({
    productTypeId: defaults.productTypeId,
    providerId: defaults.providerId,
    providerIds: [],
    name: draft.name.trim(),
    description: descriptionParts.join(' | '),
    brand,
    taxRate: Number(draft.taxRate ?? defaults.taxRate ?? 0),
    minimumStock: Number(defaults.minimumStock ?? 0),
    maximumStock: undefined,
    prices: [
      {
        name: defaults.priceName?.trim() || 'Precio factura',
        price: Number(draft.unitPrice ?? 0),
        isDefault: true,
      },
    ],
    initialWarehouseId: defaults.warehouseId,
    initialQuantity: quantity,
    barcodes: draft.code
      ? [
          {
            code: draft.code,
            type: draft.barcodeType || inferBarcodeTypeFromCode(draft.code),
            isPrimary: true,
          },
        ]
      : [],
    packaging: undefined,
  })
}
