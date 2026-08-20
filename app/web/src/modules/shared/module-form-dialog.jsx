import { useEffect, useMemo, useState } from 'react'
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
import { NativeSelect } from '@/components/ui/native-select'
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
import {
  getErrorPaths,
  getFirstErrorPath,
  focusErrorField,
  pathBelongsToField,
  stepHasErrors,
} from './form-step-validation'

function resolveOptions(options, lookups, record) {
  if (typeof options === 'function') {
    return options({ lookups, record })
  }

  return options ?? []
}

const LARGE_OPTIONS_THRESHOLD = 50

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
    setValue,
    getValues,
    trigger,
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
  const formSteps = useMemo(
    () =>
      (config.formSteps ?? []).filter((step) =>
        fields.some((field) => field.stepId === step.id),
      ),
    [config.formSteps, fields],
  )
  const hasSteps = formSteps.length > 0
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  useEffect(() => {
    if (!open) {
      setCurrentStepIndex(0)
    }
  }, [open])

  useEffect(() => {
    if (!formSteps.length) {
      if (currentStepIndex !== 0) {
        setCurrentStepIndex(0)
      }
      return
    }

    if (currentStepIndex > formSteps.length - 1) {
      setCurrentStepIndex(formSteps.length - 1)
    }
  }, [currentStepIndex, formSteps])

  const currentStep = hasSteps ? formSteps[Math.min(currentStepIndex, formSteps.length - 1)] : null
  const visibleFields = hasSteps ? fields.filter((field) => field.stepId === currentStep?.id) : fields
  const errorPaths = getErrorPaths(errors)

  function getStepFields(step) {
    return fields.filter((field) => field.stepId === step.id).map((field) => field.name)
  }

  function handleInvalid(validationErrors) {
    const firstErrorPath = getFirstErrorPath(validationErrors)
    if (!firstErrorPath) {
      return
    }

    const errorStepIndex = formSteps.findIndex((step) =>
      getStepFields(step).some((fieldName) => pathBelongsToField(firstErrorPath, fieldName)),
    )

    if (errorStepIndex >= 0) {
      setCurrentStepIndex(errorStepIndex)
    }
    setTimeout(() => focusErrorField(firstErrorPath), 0)
  }

  async function handleNextStep() {
    const currentFieldNames = visibleFields.map((field) => field.name)
    const isValid = await trigger(currentFieldNames)

    if (!isValid) {
      return
    }

    setCurrentStepIndex((index) => Math.min(index + 1, formSteps.length - 1))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[92vh] overflow-y-auto sm:max-w-2xl', config.dialogContentClassName)}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? config.createTitle : config.editTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' ? config.createDescription : config.editDescription}
          </DialogDescription>
        </DialogHeader>

        {hasSteps ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {formSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCurrentStepIndex(index)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition',
                    index === currentStepIndex
                      ? 'border-primary bg-primary text-primary-foreground'
                      : stepHasErrors(errorPaths, getStepFields(step))
                        ? 'border-destructive/50 bg-destructive/10 text-destructive hover:border-destructive/70'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {index + 1}. {step.title}
                  {stepHasErrors(errorPaths, getStepFields(step)) ? ' · Revisar' : ''}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <p className="text-sm font-medium text-foreground">{currentStep?.title}</p>
              {currentStep?.description ? (
                <p className="mt-1 text-xs text-muted-foreground">{currentStep.description}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <form
          className="grid gap-4"
          onSubmit={handleSubmit(
            (values) => onSubmit(config.prepareValues ? config.prepareValues(mode, values, record) : values),
            handleInvalid,
          )}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {visibleFields.map((field) => {
              const error = errors[field.name]?.message
              const options = resolveOptions(field.options, lookups, record)
              const CustomField = field.render
              const useNativeSelect = field.type === 'select' && (field.native === true || options.length > LARGE_OPTIONS_THRESHOLD)

              return (
                <div
                  key={field.name}
                  className={cn('grid gap-2', field.fullWidth && 'md:col-span-2', field.containerClassName)}
                >
                  {!field.hideLabel ? <Label htmlFor={field.name}>{field.label}</Label> : null}

                  {CustomField ? (
                    <CustomField
                      field={field}
                      control={control}
                      register={register}
                      setValue={setValue}
                      getValues={getValues}
                      errors={errors}
                      lookups={lookups}
                      mode={mode}
                      record={record}
                    />
                  ) : null}

                  {!CustomField && field.type === 'textarea' ? (
                    <Textarea
                      id={field.name}
                      placeholder={field.placeholder}
                      rows={field.rows ?? 4}
                      {...register(field.name)}
                    />
                  ) : null}

                  {!CustomField && field.type === 'select' && useNativeSelect ? (
                    <Controller
                      name={field.name}
                      control={control}
                      render={({ field: controllerField }) => (
                        <NativeSelect
                          value={
                            controllerField.value === undefined || controllerField.value === null
                              ? ''
                              : String(controllerField.value)
                          }
                          onChange={(event) => {
                            const { value } = event.target
                            controllerField.onChange(value === '' ? undefined : field.valueType === 'number' ? Number(value) : value)
                          }}
                        >
                          <option value="">{field.placeholder ?? 'Selecciona una opcion'}</option>
                          {options.map((option) => (
                            <option key={option.value} value={String(option.value)}>
                              {option.label}
                            </option>
                          ))}
                        </NativeSelect>
                      )}
                    />
                  ) : null}

                  {!CustomField && field.type === 'select' && !useNativeSelect ? (
                    <Controller
                      name={field.name}
                      control={control}
                      render={({ field: controllerField }) => (
                        <Select
                          value={
                            controllerField.value === undefined || controllerField.value === null
                              ? undefined
                              : String(controllerField.value)
                          }
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

                  {!CustomField && field.type === 'switch' ? (
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

                  {!CustomField && field.type === 'file' ? (
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

                  {!CustomField && !['textarea', 'select', 'switch', 'file'].includes(field.type) ? (
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
            {hasSteps && currentStepIndex > 0 ? (
              <Button type="button" variant="outline" onClick={() => setCurrentStepIndex((index) => Math.max(index - 1, 0))}>
                Atras
              </Button>
            ) : null}
            {hasSteps && currentStepIndex < formSteps.length - 1 ? (
              <Button type="button" onClick={handleNextStep}>
                Siguiente
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Guardando...'
                  : mode === 'create'
                    ? config.submitCreateLabel
                    : config.submitEditLabel}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
