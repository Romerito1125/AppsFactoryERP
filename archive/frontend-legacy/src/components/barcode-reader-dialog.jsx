import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'

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
import { inferBarcodeTypeFromCode } from '@/lib/barcodes'

export function BarcodeReaderDialog({
  open,
  onOpenChange,
  onDetected,
  title = 'Escanear con lector de códigos',
  description = 'Conecta el lector, apunta al código y espera a que termine la lectura.',
}) {
  const inputRef = useRef(null)
  const [code, setCode] = useState('')
  const [scanError, setScanError] = useState('')
  const [isReading, setIsReading] = useState(false)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80)

    return () => window.clearTimeout(focusTimer)
  }, [open])

  async function handleSubmit(event) {
    event.preventDefault()
    const normalizedCode = code.trim()

    if (!normalizedCode) {
      setScanError('Escanea un código para continuar.')
      inputRef.current?.focus()
      return
    }

    setScanError('')
    setIsReading(true)

    try {
      await onDetected?.({
        code: normalizedCode,
        type: inferBarcodeTypeFromCode(normalizedCode),
      })
      onOpenChange(false)
    } catch (error) {
      setScanError(error?.message ?? 'No se pudo procesar el código escaneado.')
      inputRef.current?.focus()
    } finally {
      setIsReading(false)
    }
  }

  function handleDialogOpenChange(nextOpen) {
    if (!nextOpen) {
      setCode('')
      setScanError('')
    }

    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <label htmlFor="hardware-barcode-input" className="text-sm font-medium text-foreground">
              Código de barras
            </label>
            <Input
              ref={inputRef}
              id="hardware-barcode-input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Escanea aquí..."
              autoComplete="off"
              inputMode="numeric"
              disabled={isReading}
            />
            {scanError ? <p className="text-xs text-destructive">{scanError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isReading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isReading}>
              <ScanLine className="mr-2 size-4" />
              {isReading ? 'Procesando...' : 'Usar código'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
