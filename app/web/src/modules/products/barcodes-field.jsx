import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { Plus, Star, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DEFAULT_BARCODE_TYPE = 'EAN13'

export const barcodeTypeOptions = [
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'UPC_A', label: 'UPC-A' },
  { value: 'UPC_E', label: 'UPC-E' },
  { value: 'CODE128', label: 'Code 128' },
  { value: 'QR', label: 'QR' },
  { value: 'OTHER', label: 'Otro' },
]

function normalizeBarcodes(barcodes) {
  const resolved = (barcodes ?? []).map((barcode) => ({
    code: barcode?.code ?? '',
    type: barcode?.type ?? DEFAULT_BARCODE_TYPE,
    isPrimary: Boolean(barcode?.isPrimary),
  }))

  if (!resolved.length) {
    return resolved
  }

  if (!resolved.some((barcode) => barcode.isPrimary)) {
    resolved[0].isPrimary = true
  }

  return resolved
}

export function ProductBarcodesField({ control, errors }) {
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'barcodes',
  })
  const values = useWatch({ control, name: 'barcodes' }) ?? []

  function handleAddBarcode() {
    append({
      code: '',
      type: DEFAULT_BARCODE_TYPE,
      isPrimary: fields.length === 0,
    })
  }

  function handleSetPrimary(targetIndex) {
    replace(
      normalizeBarcodes(
        values.map((barcode, index) => ({
          ...barcode,
          isPrimary: index === targetIndex,
        })),
      ),
    )
  }

  function handleRemoveBarcode(targetIndex) {
    const nextBarcodes = normalizeBarcodes(values.filter((_, index) => index !== targetIndex))

    if (!nextBarcodes.length) {
      remove(targetIndex)
      return
    }

    replace(nextBarcodes)
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Codigos iniciales</p>
            <p className="text-xs text-muted-foreground">
              Puedes registrar varios codigos desde la creacion. Luego podras administrarlos desde el modulo de codigos de barras.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAddBarcode}>
            <Plus className="size-4" />
            Agregar codigo
          </Button>
        </div>

        {fields.length ? (
          <div className="grid gap-3">
            {fields.map((item, index) => (
              <div key={item.id} className="grid gap-3 rounded-xl border border-border/70 bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Codigo #{index + 1}</p>
                    <p className="text-xs text-muted-foreground">
                      {values[index]?.isPrimary ? 'Principal para busquedas y escaner.' : 'Codigo adicional del mismo producto.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={values[index]?.isPrimary ? 'default' : 'outline'}
                      onClick={() => handleSetPrimary(index)}
                    >
                      <Star className="size-4" />
                      {values[index]?.isPrimary ? 'Principal' : 'Marcar principal'}
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="destructive"
                      onClick={() => handleRemoveBarcode(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="grid gap-2">
                    <Controller
                      name={`barcodes.${index}.code`}
                      control={control}
                      render={({ field }) => <Input {...field} value={field.value ?? ''} placeholder="7701234567890" />}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Controller
                      name={`barcodes.${index}.type`}
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value ?? DEFAULT_BARCODE_TYPE} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {barcodeTypeOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors?.barcodes?.[index]?.type?.message ? (
                      <p className="text-xs text-destructive">
                        {String(errors.barcodes[index].type.message)}
                      </p>
                    ) : null}
                  </div>
                </div>
                {errors?.barcodes?.[index]?.code?.message ? (
                  <p className="text-xs text-destructive">{String(errors.barcodes[index].code.message)}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
            Sin codigos configurados. Puedes guardar el producto sin codigos y agregarlos despues desde el admin.
          </div>
        )}

        {errors?.barcodes?.message ? (
          <p className="text-xs text-destructive">{String(errors.barcodes.message)}</p>
        ) : null}
      </div>
    </div>
  )
}
