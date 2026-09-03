import { useEffect, useRef } from 'react'

import { inferBarcodeTypeFromCode } from '@/lib/barcodes'

const DEFAULT_MAX_INTER_KEY_DELAY = 90
const DEFAULT_MIN_LENGTH = 3

export function useBarcodeKeyboardScanner({
  enabled = true,
  onDetected,
  maxInterKeyDelay = DEFAULT_MAX_INTER_KEY_DELAY,
  minLength = DEFAULT_MIN_LENGTH,
}) {
  const onDetectedRef = useRef(onDetected)
  const bufferRef = useRef('')
  const lastKeyAtRef = useRef(0)
  const rapidKeyCountRef = useRef(0)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    function resetBuffer() {
      bufferRef.current = ''
      lastKeyAtRef.current = 0
      rapidKeyCountRef.current = 0
    }

    function handleKeyDown(event) {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return
      }

      const now = performance.now()

      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = bufferRef.current.trim()
        const isScannerSequence = code.length >= minLength && rapidKeyCountRef.current >= 2

        if (isScannerSequence) {
          event.preventDefault()
          event.stopPropagation()
          resetBuffer()

          Promise.resolve(
            onDetectedRef.current?.({
              code,
              type: inferBarcodeTypeFromCode(code),
            }),
          ).catch(() => undefined)
          return
        }

        resetBuffer()
        return
      }

      if (event.key.length !== 1) {
        return
      }

      const isRapidCharacter = lastKeyAtRef.current > 0 && now - lastKeyAtRef.current <= maxInterKeyDelay

      if (!isRapidCharacter) {
        bufferRef.current = event.key
        rapidKeyCountRef.current = 1
      } else {
        bufferRef.current += event.key
        rapidKeyCountRef.current += 1
      }

      lastKeyAtRef.current = now
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      resetBuffer()
    }
  }, [enabled, maxInterKeyDelay, minLength])
}
