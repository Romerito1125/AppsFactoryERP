import { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCcw, ScanLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { scanBarcodeFromVideo } from '@/lib/barcode-reader'

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
  title = 'Escanear codigo',
  description = 'Apunta la camara al codigo de barras hasta que el sistema lo detecte.',
}) {
  const videoRef = useRef(null)
  const [scanError, setScanError] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (!open || !videoRef.current) {
      return undefined
    }

    const abortController = new AbortController()

    async function startScanner() {
      setScanError('')
      setIsScanning(true)

      try {
        const result = await scanBarcodeFromVideo(videoRef.current, {
          signal: abortController.signal,
        })
        onDetected?.(result)
        onOpenChange(false)
      } catch (error) {
        if (error?.name === 'AbortError') {
          return
        }

        setScanError(error?.message ?? 'No se pudo iniciar el escaner de la camara')
      } finally {
        setIsScanning(false)
      }
    }

    startScanner()

    return () => abortController.abort()
  }, [onDetected, onOpenChange, open, retryTick])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-black/90">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Camera className="size-4" />
              {isScanning ? 'Buscando codigo...' : 'Escaner listo'}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Si el navegador pide permiso de camara, aceptalo. Para mejores resultados usa buena luz y acerca el codigo al centro.
            </p>
            {scanError ? <p className="mt-3 text-xs text-destructive">{scanError}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setRetryTick((current) => current + 1)}>
            <RefreshCcw className="mr-2 size-4" />
            Reintentar
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            <ScanLine className="mr-2 size-4" />
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
