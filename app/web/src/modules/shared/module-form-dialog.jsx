import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { ProductImage } from '@/components/product-image'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

function resolveOptions(options, lookups, record) {
  if (typeof options === 'function') {
    return options({ lookups, record })
  }

  return options ?? []
}

export function ModuleFormDialog({
  open,
  onOpenChange,
  mode,
  config,
  record,
  lookups,
  isSubmitting,
  onSubmit,
}) {
  const schema = mode === 'create' ? config.createSchema : config.updateSchema
  const defaultValues = useMemo(
    () => config.getDefaultValues(mode, record),
    [config, mode, record],
  )

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  })

  useEffect(() => {
    reset(defaultValues)
  }, [defaultValues, reset])

  const fields = config.fields.filter((field) => {
    if (mode === 'create' && field.hiddenOnCreate) {
      return false
    }

    if (mode === 'edit' && field.hiddenOnEdit) {
      return false
    }

    return true
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? config.createTitle : config.editTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' ? config.createDescription : config.editDescription}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={handleSubmit((values) =>
            onSubmit(config.prepareValues ? config.prepareValues(mode, values, record) : values),
          )}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => {
              const error = errors[field.name]?.message
              const options = resolveOptions(field.options, lookups, record)

              return (
                <div
                  key={field.name}
                  className={cn('grid gap-2', field.fullWidth && 'md:col-span-2')}
                >
                  <Label htmlFor={field.name}>{field.label}</Label>

                  {field.type === 'textarea' ? (
                    <Textarea
                      id={field.name}
                      placeholder={field.placeholder}
                      rows={field.rows ?? 4}
                      {...register(field.name)}
                    />
                  ) : null}

                  {field.type === 'select' ? (
                    <Controller
                      name={field.name}
                      control={control}
                      render={({ field: controllerField }) => (
                        <Select
                          value={controllerField.value ? String(controllerField.value) : undefined}
                          onValueChange={(value) =>
                            controllerField.onChange(field.valueType === 'number' ? Number(value) : value)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={field.placeholder} />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((option) => (
                              <SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  ) : null}

                  {field.type === 'switch' ? (
                    <Controller
                      name={field.name}
                      control={control}
                      render={({ field: controllerField }) => (
                        <div className="flex min-h-10 items-center rounded-xl border border-border/70 px-3">
                          <Switch
                            checked={Boolean(controllerField.value)}
                            onCheckedChange={controllerField.onChange}
                          />
                          <span className="ml-3 text-sm text-muted-foreground">
                            {field.description ?? 'Alterna el estado del registro'}
                          </span>
                        </div>
                      )}
                    />
                  ) : null}

                  {field.type === 'file' ? (
                    <Controller
                      name={field.name}
                      control={control}
                      render={({ field: controllerField }) => {
                        const currentImage = field.getPreviewValue?.(record)

                        return (
                          <div className="grid gap-3">
                            {currentImage ? (
                              <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                                <ProductImage
                                  src={currentImage}
                                  alt={record?.name ?? field.label}
                                  className="size-16 rounded-lg"
                                  iconClassName="size-4"
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">Imagen actual</p>
                                  <p className="text-xs text-muted-foreground">
                                    Selecciona otra imagen solo si deseas reemplazarla.
                                  </p>
                                </div>
                              </div>
                            ) : null}

                            <Input
                              id={field.name}
                              type="file"
                              accept={field.accept}
                              onChange={(event) =>
                                controllerField.onChange(event.target.files?.[0] ?? undefined)
                              }
                            />

                            {controllerField.value?.name ? (
                              <p className="text-xs text-muted-foreground">
                                Archivo seleccionado: {controllerField.value.name}
                              </p>
                            ) : null}
                          </div>
                        )
                      }}
                    />
                  ) : null}

                  {!['textarea', 'select', 'switch', 'file'].includes(field.type) ? (
                    <Input
                      id={field.name}
                      type={field.type ?? 'text'}
                      placeholder={field.placeholder}
                      autoComplete={field.autoComplete}
                      {...register(field.name, {
                        setValueAs:
                          field.type === 'number'
                            ? (value) => toNumber(value)
                            : (value) => (typeof value === 'string' ? value.trim() : value),
                      })}
                    />
                  ) : null}

                  {field.helpText ? (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  ) : null}
                  {error ? <p className="text-xs text-destructive">{String(error)}</p> : null}
                </div>
              )
            })}
          </div>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Guardando...'
                : mode === 'create'
                  ? config.submitCreateLabel
                  : config.submitEditLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
