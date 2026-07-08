import { useMemo, useRef, useState } from 'react'
import { FileSearch, LoaderCircle, ScanText, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { barcodeTypeLabels, inferBarcodeTypeFromCode } from '@/lib/barcodes'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatNumber } from '@/lib/format'
import { extractTextFromDocument, parseInvoiceTextToProductDrafts } from '@/lib/invoice-ocr'
import { buildImportedProductFormData } from '@/modules/products/product-form-data'

function getInitialDefaults() {
  return {
    providerId: undefined,
    productTypeId: undefined,
    warehouseId: undefined,
    brand: '',
    priceName: 'Precio factura',
    taxRate: 19,
    minimumStock: 0,
    defaultQuantity: 1,
  }
}

function getProviderLabel(providers, providerId) {
  return providers.find((provider) => provider.id === providerId)?.name ?? ''
}

function isDraftReady(draft) {
  return Boolean(draft.name?.trim()) && Number(draft.unitPrice) > 0 && Number(draft.quantity) > 0
}

export function InvoiceOcrImportAction({ lookups, onImported }) {
  const fileInputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [sourceFile, setSourceFile] = useState(null)
  const [ocrText, setOcrText] = useState('')
  const [drafts, setDrafts] = useState([])
  const [defaults, setDefaults] = useState(() => getInitialDefaults())
  const [ocrStatus, setOcrStatus] = useState('')
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const selectedCount = useMemo(() => drafts.filter((draft) => draft.isSelected).length, [drafts])
  const readyCount = useMemo(() => drafts.filter((draft) => draft.isSelected && isDraftReady(draft)).length, [drafts])

  function resetState() {
    setSourceFile(null)
    setOcrText('')
    setDrafts([])
    setDefaults(getInitialDefaults())
    setOcrStatus('')
    setIsRecognizing(false)
    setIsImporting(false)
  }

  function closeDialog(nextOpen) {
    setOpen(nextOpen)

    if (!nextOpen) {
      resetState()
    }
  }

  function updateDefaults(field, value) {
    setDefaults((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function regenerateDrafts() {
    const nextDrafts = parseInvoiceTextToProductDrafts(ocrText, defaults)
    setDrafts(nextDrafts)

    if (nextDrafts.length) {
      toast.success(`${nextDrafts.length} producto(s) detectado(s) desde el texto OCR`)
      return
    }

    toast.error('No se detectaron lineas de producto en el texto OCR')
  }

  async function handleRunOcr() {
    if (!sourceFile) {
      toast.error('Selecciona primero una factura en PDF o imagen')
      return
    }

    setIsRecognizing(true)
    setOcrStatus('Iniciando OCR...')

    try {
      const text = await extractTextFromDocument(sourceFile, {
        onProgress: (progress) => {
          const percentage = Number.isFinite(progress?.progress) ? `${Math.round(progress.progress * 100)}%` : ''
          setOcrStatus([progress?.status, percentage].filter(Boolean).join(' - '))
        },
      })

      setOcrText(text)
      const nextDrafts = parseInvoiceTextToProductDrafts(text, defaults)
      setDrafts(nextDrafts)
      toast.success(`OCR completado. ${nextDrafts.length} posible(s) producto(s) detectado(s)`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsRecognizing(false)
    }
  }

  function updateDraft(targetId, patch) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === targetId
          ? {
              ...draft,
              ...patch,
              error: undefined,
            }
          : draft,
      ),
    )
  }

  async function handleImport() {
    if (!defaults.providerId || !defaults.productTypeId || !defaults.warehouseId) {
      toast.error('Selecciona proveedor, tipo de producto y bodega antes de importar')
      return
    }

    const selectedDrafts = drafts.filter((draft) => draft.isSelected)

    if (!selectedDrafts.length) {
      toast.error('Selecciona al menos un producto para importar')
      return
    }

    const invalidDraft = selectedDrafts.find((draft) => !isDraftReady(draft))

    if (invalidDraft) {
      toast.error('Hay productos seleccionados sin nombre, cantidad o precio validos')
      return
    }

    setIsImporting(true)

    const providerLabel = getProviderLabel(lookups.providers, defaults.providerId)
    const remainingDrafts = []
    let successCount = 0

    for (const draft of drafts) {
      if (!draft.isSelected) {
        remainingDrafts.push(draft)
        continue
      }

      try {
        const payload = buildImportedProductFormData(draft, {
          ...defaults,
          providerLabel,
          sourceFileName: sourceFile?.name,
        })
        await apiClient.post('/productos', payload)
        successCount += 1
      } catch (error) {
        remainingDrafts.push({
          ...draft,
          error: error.message,
        })
      }
    }

    setDrafts(remainingDrafts)
    setIsImporting(false)

    if (successCount) {
      onImported?.()
    }

    if (!remainingDrafts.length) {
      toast.success(`${successCount} producto(s) importado(s) desde la factura OCR`)
      closeDialog(false)
      return
    }

    if (successCount) {
      toast.success(`${successCount} producto(s) importado(s). Revisa los que quedaron con error.`)
      return
    }

    toast.error('No se pudo importar ningun producto. Revisa los errores en los borradores.')
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileSearch className="mr-2 size-4" />
        Importar factura OCR
      </Button>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Importar productos desde factura</DialogTitle>
            <DialogDescription>
              Sube una factura en PDF o imagen, extrae el texto con OCR y genera borradores editables para crear productos sin capturarlos uno por uno.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
            <div className="grid gap-4">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Archivo origen</p>
                    <p className="text-xs text-muted-foreground">Acepta PDF o imagen. El OCR usa espanol e ingles para capturar nombres, cantidades, precios y codigos.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
                    />
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-2 size-4" />
                      Seleccionar archivo
                    </Button>
                    <Button type="button" onClick={handleRunOcr} disabled={isRecognizing || !sourceFile}>
                      {isRecognizing ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <ScanText className="mr-2 size-4" />}
                      {isRecognizing ? 'Procesando OCR...' : 'Extraer texto'}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-border/70 bg-background p-3 text-sm">
                  <p className="font-medium text-foreground">{sourceFile?.name ?? 'Sin archivo seleccionado'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ocrStatus || 'Cuando termine el OCR podras editar el texto y regenerar los borradores.'}</p>
                </div>
              </div>

              <div className="grid gap-4 rounded-2xl border border-border/70 bg-card p-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Proveedor</Label>
                  <NativeSelect
                    value={defaults.providerId ? String(defaults.providerId) : ''}
                    onChange={(event) => updateDefaults('providerId', event.target.value ? Number(event.target.value) : undefined)}
                  >
                    <option value="">Selecciona un proveedor</option>
                    {lookups.providers.map((provider) => (
                      <option key={provider.id} value={String(provider.id)}>
                        {provider.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="grid gap-2">
                  <Label>Tipo de producto</Label>
                  <NativeSelect
                    value={defaults.productTypeId ? String(defaults.productTypeId) : ''}
                    onChange={(event) => updateDefaults('productTypeId', event.target.value ? Number(event.target.value) : undefined)}
                  >
                    <option value="">Selecciona un tipo</option>
                    {lookups.productTypes.map((productType) => (
                      <option key={productType.id} value={String(productType.id)}>
                        {productType.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="grid gap-2">
                  <Label>Bodega inicial</Label>
                  <NativeSelect
                    value={defaults.warehouseId ? String(defaults.warehouseId) : ''}
                    onChange={(event) => updateDefaults('warehouseId', event.target.value ? Number(event.target.value) : undefined)}
                  >
                    <option value="">Selecciona una bodega</option>
                    {lookups.warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={String(warehouse.id)}>
                        {warehouse.location}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="grid gap-2">
                  <Label>Marca por defecto</Label>
                  <Input value={defaults.brand} onChange={(event) => updateDefaults('brand', event.target.value)} placeholder="Marca del proveedor" />
                </div>

                <div className="grid gap-2">
                  <Label>Nombre del precio</Label>
                  <Input value={defaults.priceName} onChange={(event) => updateDefaults('priceName', event.target.value)} placeholder="Precio factura" />
                </div>

                <div className="grid gap-2">
                  <Label>IVA por defecto %</Label>
                  <Input type="number" min="0" value={defaults.taxRate} onChange={(event) => updateDefaults('taxRate', Number(event.target.value || 0))} />
                </div>

                <div className="grid gap-2">
                  <Label>Stock minimo</Label>
                  <Input type="number" min="0" value={defaults.minimumStock} onChange={(event) => updateDefaults('minimumStock', Number(event.target.value || 0))} />
                </div>

                <div className="grid gap-2">
                  <Label>Cantidad por defecto</Label>
                  <Input type="number" min="1" value={defaults.defaultQuantity} onChange={(event) => updateDefaults('defaultQuantity', Number(event.target.value || 1))} />
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Texto OCR editable</Label>
                  <Button type="button" variant="outline" size="sm" onClick={regenerateDrafts} disabled={!ocrText.trim()}>
                    Regenerar borradores
                  </Button>
                </div>
                <Textarea
                  value={ocrText}
                  onChange={(event) => setOcrText(event.target.value)}
                  rows={14}
                  placeholder="El texto reconocido de la factura aparecera aqui para corregirlo antes de generar los productos."
                />
              </div>
            </div>

            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                <Badge variant="outline">Seleccionados {formatNumber(selectedCount)}</Badge>
                <Badge variant="outline">Listos {formatNumber(readyCount)}</Badge>
                <Button type="button" variant="outline" size="sm" onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, isSelected: true })))} disabled={!drafts.length}>
                  Seleccionar todo
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, isSelected: isDraftReady(draft) })))} disabled={!drafts.length}>
                  Solo validos
                </Button>
              </div>

              <ScrollArea className="h-[640px] rounded-2xl border border-border/70 bg-card p-4">
                {drafts.length ? (
                  <div className="grid gap-3 pr-4">
                    {drafts.map((draft, index) => (
                      <div key={draft.id} className="grid gap-3 rounded-2xl border border-border/70 bg-background p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">Producto OCR #{index + 1}</p>
                            <p className="text-xs text-muted-foreground">{draft.rawLine}</p>
                          </div>
                          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <input type="checkbox" checked={Boolean(draft.isSelected)} onChange={(event) => updateDraft(draft.id, { isSelected: event.target.checked })} />
                            Importar
                          </label>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="grid gap-2 md:col-span-2">
                            <Label>Nombre</Label>
                            <Input value={draft.name} onChange={(event) => updateDraft(draft.id, { name: event.target.value })} />
                          </div>

                          <div className="grid gap-2">
                            <Label>Codigo</Label>
                            <Input value={draft.code} onChange={(event) => updateDraft(draft.id, { code: event.target.value, barcodeType: event.target.value ? inferBarcodeTypeFromCode(event.target.value) : '' })} placeholder="Opcional" />
                          </div>

                          <div className="grid gap-2">
                            <Label>Tipo de codigo</Label>
                            <div className="flex min-h-10 items-center rounded-xl border border-border/70 px-3 text-sm text-muted-foreground">
                              {draft.code ? barcodeTypeLabels[draft.barcodeType] ?? draft.barcodeType : 'Sin codigo'}
                            </div>
                          </div>

                          <div className="grid gap-2">
                            <Label>Cantidad inicial</Label>
                            <Input type="number" min="1" value={draft.quantity} onChange={(event) => updateDraft(draft.id, { quantity: Number(event.target.value || 1) })} />
                          </div>

                          <div className="grid gap-2">
                            <Label>Precio inicial</Label>
                            <Input type="number" min="1" value={draft.unitPrice} onChange={(event) => updateDraft(draft.id, { unitPrice: Number(event.target.value || 0) })} />
                          </div>

                          <div className="grid gap-2">
                            <Label>Marca</Label>
                            <Input value={draft.brand} onChange={(event) => updateDraft(draft.id, { brand: event.target.value })} placeholder="Usara la marca por defecto si lo dejas vacio" />
                          </div>

                          <div className="grid gap-2">
                            <Label>IVA %</Label>
                            <Input type="number" min="0" value={draft.taxRate} onChange={(event) => updateDraft(draft.id, { taxRate: Number(event.target.value || 0) })} />
                          </div>

                          <div className="grid gap-2 md:col-span-2">
                            <Label>Descripcion opcional</Label>
                            <Textarea value={draft.description} onChange={(event) => updateDraft(draft.id, { description: event.target.value })} rows={2} placeholder="Notas adicionales antes de crear el producto" />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>Stock inicial {formatNumber(draft.quantity)}</span>
                          <span>Precio {formatCurrency(draft.unitPrice || 0)}</span>
                        </div>

                        {draft.error ? <p className="text-xs text-destructive">{draft.error}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-center">
                    <p className="font-medium text-foreground">Todavia no hay borradores</p>
                    <p className="mt-1 text-sm text-muted-foreground">Carga una factura, ejecuta el OCR y corrige el texto si hace falta para generar los productos detectados.</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleImport} disabled={isImporting || !drafts.length}>
              {isImporting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
              {isImporting ? 'Importando productos...' : 'Crear productos desde OCR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
