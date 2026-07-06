import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Eye, ImageUp, MoreHorizontal, Pencil, Plus, Power, Search, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { z } from 'zod'

import { ProductImage } from '@/components/product-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiClient } from '@/lib/api-client'
import { readBarcodeFromImage } from '@/lib/barcode-reader'
import { formatDate, formatNumber, getRecordStatus, getRecordStatusVariant } from '@/lib/format'
import { barcodeTypeOptions } from '@/modules/products/barcodes-field'
import { ProductVisualPicker } from '@/modules/products/product-visual-picker'
import { LocalPagination } from '@/modules/shared/local-pagination'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'

const PAGE_SIZE = 20
const PRODUCT_PICKER_PAGE_SIZE = 12
const barcodeTypeValues = barcodeTypeOptions.map((option) => option.value)
const barcodeTypeLabels = Object.fromEntries(barcodeTypeOptions.map((option) => [option.value, option.label]))
const statusOptions = [
  { value: 'activos', label: 'Activos' },
  { value: 'inactivos', label: 'Inactivos' },
  { value: 'todos', label: 'Todos' },
]
const barcodeTypeFilterOptions = [{ value: 'TODOS', label: 'Todos los tipos' }, ...barcodeTypeOptions]

const barcodeExampleTemplates = [
  {
    type: 'EAN13',
    label: 'EAN-13',
    description: 'Ideal para retail y lectura lineal estandar.',
    getCode: (product) => `7701234${String(product.id).padStart(6, '0')}`,
  },
  {
    type: 'EAN8',
    label: 'EAN-8',
    description: 'Version corta para empaques pequenos.',
    getCode: (product) => `96${String(product.id).padStart(6, '0')}`,
  },
  {
    type: 'UPC_A',
    label: 'UPC-A',
    description: 'Comun en productos empacados y cajas.',
    getCode: (product) => `0421${String(product.id).padStart(8, '0')}`,
  },
  {
    type: 'UPC_E',
    label: 'UPC-E',
    description: 'Alternativa compacta para etiquetas chicas.',
    getCode: (product) => `42${String(product.id).padStart(4, '0')}`,
  },
  {
    type: 'CODE128',
    label: 'Code 128',
    description: 'Util para codigos internos o promocionales.',
    getCode: (product) => `PROD-${product.id}-PROMO`,
  },
  {
    type: 'QR',
    label: 'QR',
    description: 'Puede resolver a una URL o detalle rapido.',
    getCode: (product) => `https://erp.local/p/${product.id}`,
  },
  {
    type: 'OTHER',
    label: 'Interno',
    description: 'Codigo auxiliar para operacion interna.',
    getCode: (product) => `INTERNO-${String(product.id).padStart(3, '0')}`,
  },
]

const createBarcodeSchema = z.object({
  productId: z.number({ message: 'Selecciona un producto' }).int().positive('Selecciona un producto'),
  code: z.string().trim().min(1, 'Ingresa el codigo'),
  type: z.enum(barcodeTypeValues),
  isPrimary: z.boolean(),
})

const updateBarcodeSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa el codigo'),
  type: z.enum(barcodeTypeValues),
  isPrimary: z.boolean(),
})

function ProductBarcodesSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[520px] rounded-2xl" />
    </div>
  )
}

function formatBarcodeType(type) {
  return barcodeTypeLabels[type] ?? type ?? 'Sin tipo'
}

function getProductLabel(product) {
  if (!product) {
    return 'Producto no disponible'
  }

  return `${product.name} · ${product.brand}`
}

function getPrimaryBarcode(product) {
  return product?.barcodes?.find((barcode) => barcode.isPrimary) ?? product?.barcodes?.[0] ?? null
}

function buildBarcodeExampleAssignments(products) {
  return barcodeExampleTemplates
    .map((template, index) => {
      const product = products[index]

      if (!product) {
        return null
      }

      return {
        productId: product.id,
        productName: product.name,
        brand: product.brand,
        imageUrl: product.imageUrl,
        type: template.type,
        label: template.label,
        description: template.description,
        code: template.getCode(product),
      }
    })
    .filter(Boolean)
}

function BarcodeFormDialog({ open, onOpenChange, mode, barcode, preset, examples, onSubmit, isSubmitting }) {
  const schema = mode === 'create' ? createBarcodeSchema : updateBarcodeSchema
  const fileInputRef = useRef(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productPage, setProductPage] = useState(1)
  const deferredProductSearch = useDeferredValue(productSearch)

  const formDefaults = useMemo(
    () =>
      mode === 'create'
        ? {
            productId: preset?.productId ?? undefined,
            code: preset?.code ?? '',
            type: preset?.type ?? 'EAN13',
            isPrimary: preset?.isPrimary ?? false,
          }
        : {
            code: barcode?.code ?? '',
            type: barcode?.type ?? 'EAN13',
            isPrimary: barcode?.isPrimary ?? false,
          },
    [barcode, mode, preset],
  )

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: formDefaults,
  })

  useEffect(() => {
    form.reset(formDefaults)
  }, [form, formDefaults])

  useEffect(() => {
    setProductSearch('')
    setProductPage(1)
  }, [open, mode])

  const productsQuery = useQuery({
    queryKey: ['barcode-form-products', deferredProductSearch, productPage],
    queryFn: () =>
      apiClient.get('/productos', {
        estado: 'activos',
        q: deferredProductSearch || undefined,
        page: productPage,
        limit: PRODUCT_PICKER_PAGE_SIZE,
      }),
    enabled: open && mode === 'create',
    placeholderData: (previousData) => previousData,
  })

  const selectedProductId = useWatch({ control: form.control, name: 'productId' })
  const pickerProducts = productsQuery.data?.data ?? []

  const selectedProductQuery = useQuery({
    queryKey: ['barcode-form-selected-product', selectedProductId],
    queryFn: () => apiClient.get(`/productos/${selectedProductId}`),
    enabled: open && mode === 'create' && Boolean(selectedProductId) && !pickerProducts.some((product) => product.id === selectedProductId),
  })

  const selectedProduct = useMemo(
    () => pickerProducts.find((product) => product.id === selectedProductId) ?? selectedProductQuery.data ?? null,
    [pickerProducts, selectedProductId, selectedProductQuery.data],
  )
  const selectProducts = useMemo(
    () =>
      selectedProduct && !pickerProducts.some((product) => product.id === selectedProduct.id)
        ? [selectedProduct, ...pickerProducts]
        : pickerProducts,
    [pickerProducts, selectedProduct],
  )

  function closeDialog(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      form.reset(formDefaults)
    }
  }

  function applyExample(example) {
    form.setValue('productId', example.productId, { shouldDirty: true, shouldValidate: true })
    form.setValue('code', example.code, { shouldDirty: true, shouldValidate: true })
    form.setValue('type', example.type, { shouldDirty: true, shouldValidate: true })
  }

  async function handleReadImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setScanLoading(true)

    try {
      const result = await readBarcodeFromImage(file)
      form.setValue('code', result.code, { shouldDirty: true, shouldValidate: true })
      form.setValue('type', result.type, { shouldDirty: true, shouldValidate: true })
      toast.success(`Codigo detectado: ${result.code}`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setScanLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nuevo codigo de barras' : 'Actualizar codigo de barras'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Asocia varios codigos a un producto, busca por foto y tambien puedes leer un codigo desde una imagen.'
              : 'Actualiza el codigo, su formato o el indicador principal del registro seleccionado.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              ...values,
              code: values.code.trim(),
            }),
          )}
        >
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
            <div className="grid gap-4">
              {mode === 'create' ? (
                <>
                  <div className="grid gap-2">
                    <Label>Producto</Label>
                    <Controller
                      name="productId"
                      control={form.control}
                      render={({ field }) => (
                        <NativeSelect
                          value={field.value ? String(field.value) : ''}
                          onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                        >
                          <option value="">Selecciona un producto</option>
                          {selectProducts.map((product) => (
                            <option key={product.id} value={String(product.id)}>
                              {getProductLabel(product)}
                            </option>
                          ))}
                        </NativeSelect>
                      )}
                    />
                    {form.formState.errors.productId ? (
                      <p className="text-xs text-destructive">{String(form.formState.errors.productId.message)}</p>
                    ) : null}
                  </div>

                  {selectedProduct ? (
                    <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/15 p-4 md:grid-cols-[88px_minmax(0,1fr)] md:items-center">
                      <ProductImage
                        src={selectedProduct.imageUrl}
                        alt={selectedProduct.name}
                        className="size-20 rounded-xl"
                        iconClassName="size-5"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{selectedProduct.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedProduct.brand} · {selectedProduct.productType?.name ?? 'Sin tipo'}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {getPrimaryBarcode(selectedProduct)?.code ?? 'Sin codigo principal'}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <ProductVisualPicker
                    products={pickerProducts}
                    selectedProductId={selectedProductId}
                    onSelectProduct={(productId) =>
                      form.setValue('productId', productId, { shouldDirty: true, shouldValidate: true })
                    }
                    actionLabel="Elegir producto"
                    title="Selecciona el producto por imagen"
                    description="Busqueda visual optimizada con paginacion real del catalogo activo."
                    searchPlaceholder="Buscar por nombre, marca o codigo..."
                    searchValue={productSearch}
                    onSearchValueChange={(value) => {
                      setProductSearch(value)
                      setProductPage(1)
                    }}
                    disableLocalSearch
                    totalCount={productsQuery.data?.total ?? pickerProducts.length}
                    maxHeightClassName="h-[360px]"
                    footerContent={
                      <LocalPagination
                        currentPage={Number(productsQuery.data?.page ?? 1)}
                        totalPages={Math.max(1, Number(productsQuery.data?.totalPages ?? 1))}
                        totalItems={Number(productsQuery.data?.total ?? pickerProducts.length)}
                        startItem={
                          Number(productsQuery.data?.total ?? 0) === 0
                            ? 0
                            : (Number(productsQuery.data?.page ?? 1) - 1) * PRODUCT_PICKER_PAGE_SIZE + 1
                        }
                        endItem={Math.min(
                          (Number(productsQuery.data?.page ?? 1) - 1) * PRODUCT_PICKER_PAGE_SIZE + pickerProducts.length,
                          Number(productsQuery.data?.total ?? pickerProducts.length),
                        )}
                        singularLabel="producto"
                        pluralLabel="productos"
                        onPageChange={setProductPage}
                      />
                    }
                  />
                </>
              ) : null}
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Codigo</Label>
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleReadImage}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={scanLoading}>
                        <ImageUp className="mr-2 size-4" />
                        {scanLoading ? 'Leyendo...' : 'Leer desde imagen'}
                      </Button>
                    </>
                  </div>
                  <Input {...form.register('code')} placeholder="7701234567890" />
                  <p className="text-xs text-muted-foreground">
                    Puedes cargar una foto del codigo y el sistema intentara leerlo automaticamente.
                  </p>
                  {form.formState.errors.code ? (
                    <p className="text-xs text-destructive">{String(form.formState.errors.code.message)}</p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Controller
                    name="type"
                    control={form.control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un tipo" />
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
                </div>

                <div className="grid gap-2">
                  <Label>Principal</Label>
                  <Controller
                    name="isPrimary"
                    control={form.control}
                    render={({ field }) => (
                      <Select value={String(Boolean(field.value))} onValueChange={(value) => field.onChange(value === 'true')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">No</SelectItem>
                          <SelectItem value="true">Si</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              {mode === 'create' && examples?.length ? (
                <div className="grid gap-2">
                  <Label>Ejemplos rapidos conectados a productos</Label>
                  <div className="grid gap-2">
                    {examples.map((example) => (
                      <button
                        key={`${example.productId}-${example.type}`}
                        type="button"
                        onClick={() => applyExample(example)}
                        className="flex items-start gap-3 rounded-xl border border-border/70 bg-background px-3 py-2 text-left transition hover:border-primary/35 hover:bg-primary/5"
                      >
                        <ProductImage
                          src={example.imageUrl}
                          alt={example.productName}
                          className="size-14 rounded-xl"
                          iconClassName="size-4"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {example.label}: {example.code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {example.productName} · {example.brand}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeDialog(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || scanLoading}>
              {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Crear codigo' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProductBarcodesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('activos')
  const [typeFilter, setTypeFilter] = useState('TODOS')
  const [currentPage, setCurrentPage] = useState(1)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogPage, setCatalogPage] = useState(1)
  const [formState, setFormState] = useState({ open: false, mode: 'create', record: null, preset: null })
  const [detailRecord, setDetailRecord] = useState(null)
  const deferredSearch = useDeferredValue(search)
  const deferredCatalogSearch = useDeferredValue(catalogSearch)

  const barcodesQuery = useQuery({
    queryKey: ['codigos-barras', status, typeFilter, deferredSearch, currentPage],
    queryFn: () =>
      apiClient.get('/codigos-barras', {
        estado: status === 'activos' ? undefined : status,
        type: typeFilter === 'TODOS' ? undefined : typeFilter,
        q: deferredSearch || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })

  const catalogProductsQuery = useQuery({
    queryKey: ['codigos-barras-catalogo', deferredCatalogSearch, catalogPage],
    queryFn: () =>
      apiClient.get('/productos', {
        estado: 'activos',
        q: deferredCatalogSearch || undefined,
        page: catalogPage,
        limit: PRODUCT_PICKER_PAGE_SIZE,
      }),
    placeholderData: (previousData) => previousData,
  })

  const exampleProductsQuery = useQuery({
    queryKey: ['codigos-barras-example-products'],
    queryFn: () =>
      apiClient.get('/productos', {
        estado: 'activos',
        page: 1,
        limit: barcodeExampleTemplates.length,
      }),
  })

  const records = barcodesQuery.data?.data ?? []
  const catalogProducts = catalogProductsQuery.data?.data ?? []
  const barcodeExamples = useMemo(
    () => buildBarcodeExampleAssignments(exampleProductsQuery.data?.data ?? []),
    [exampleProductsQuery.data?.data],
  )

  function openCreateDialog(preset = null) {
    setFormState({ open: true, mode: 'create', record: null, preset })
  }

  function invalidateBarcodeQueries() {
    queryClient.invalidateQueries({ queryKey: ['codigos-barras'] })
    queryClient.invalidateQueries({ queryKey: ['productos'] })
    queryClient.invalidateQueries({ queryKey: ['codigos-barras-catalogo'] })
    queryClient.invalidateQueries({ queryKey: ['codigos-barras-example-products'] })
  }

  const createMutation = useMutation({
    mutationFn: ({ productId, ...payload }) => apiClient.post(`/productos/${productId}/codigos-barras`, payload),
    onSuccess: () => {
      invalidateBarcodeQueries()
      setFormState({ open: false, mode: 'create', record: null, preset: null })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiClient.patch(`/codigos-barras/${id}`, payload),
    onSuccess: () => {
      invalidateBarcodeQueries()
      setFormState({ open: false, mode: 'create', record: null, preset: null })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => apiClient.delete(`/codigos-barras/${id}`),
    onSuccess: () => {
      invalidateBarcodeQueries()
    },
  })

  const markPrimaryMutation = useMutation({
    mutationFn: (id) => apiClient.patch(`/codigos-barras/${id}/principal`),
    onSuccess: () => {
      invalidateBarcodeQueries()
    },
  })

  async function handleSubmit(payload) {
    if (formState.mode === 'create') {
      await toast.promise(createMutation.mutateAsync(payload), {
        loading: 'Creando codigo de barras...',
        success: 'Codigo de barras creado correctamente',
        error: (error) => error.message,
      })
      return
    }

    await toast.promise(updateMutation.mutateAsync({ id: formState.record.id, payload }), {
      loading: 'Actualizando codigo de barras...',
      success: 'Codigo de barras actualizado correctamente',
      error: (error) => error.message,
    })
  }

  async function handleDeleteBarcode(record) {
    await toast.promise(deleteMutation.mutateAsync(record.id), {
      loading: 'Desactivando codigo de barras...',
      success: 'Codigo de barras desactivado',
      error: (error) => error.message,
    })
  }

  async function handleMarkPrimary(record) {
    await toast.promise(markPrimaryMutation.mutateAsync(record.id), {
      loading: 'Marcando codigo principal...',
      success: 'Codigo marcado como principal',
      error: (error) => error.message,
    })
  }

  const summaryCards = useMemo(() => {
    const totalVisible = Number(barcodesQuery.data?.total ?? 0)
    const activeInPage = records.filter((record) => record.isActive).length
    const primaryInPage = records.filter((record) => record.isPrimary).length

    return [
      {
        label: 'Codigos visibles',
        value: formatNumber(totalVisible),
        help: 'Total segun busqueda, filtros y paginacion del backend.',
      },
      {
        label: 'Cargados en pagina',
        value: formatNumber(records.length),
        help: 'Registros que renderiza la vista actual.',
      },
      {
        label: 'Activos en pagina',
        value: formatNumber(activeInPage),
        help: 'Codigos listos para lectura y operacion.',
      },
      {
        label: 'Principales en pagina',
        value: formatNumber(primaryInPage),
        help: 'Codigos marcados como principal dentro de la pagina actual.',
      },
    ]
  }, [barcodesQuery.data?.total, records])

  if (barcodesQuery.isLoading || catalogProductsQuery.isLoading || exampleProductsQuery.isLoading) {
    return <ProductBarcodesSkeleton />
  }

  return (
    <>
      <div className="grid gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">Catalogo · Identificacion</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Codigos de barras
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Gestion rapida con paginacion real, multiples codigos por producto, lectura desde imagen y selector visual por foto.
            </p>
          </div>
          <Button className="rounded-full px-5" onClick={() => openCreateDialog()}>
            <Plus className="mr-2 size-4" />
            Nuevo codigo
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card, index) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.24 }}
            >
              <Card className="border-border/70 bg-card/92 shadow-sm shadow-primary/5">
                <CardHeader>
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-2xl font-semibold">{card.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{card.help}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <ProductVisualPicker
            products={catalogProducts}
            actionLabel="Agregar codigo"
            onAction={(product) => openCreateDialog({ productId: product.id })}
            title="Productos por foto"
            description="Busqueda visual optimizada con paginacion del catalogo activo para abrir rapido el alta de codigos."
            searchPlaceholder="Buscar por nombre, marca o codigo..."
            searchValue={catalogSearch}
            onSearchValueChange={(value) => {
              setCatalogSearch(value)
              setCatalogPage(1)
            }}
            disableLocalSearch
            totalCount={Number(catalogProductsQuery.data?.total ?? catalogProducts.length)}
            emptyTitle="No hay productos visibles"
            emptyDescription="Cambia la busqueda para traer otras coincidencias del backend."
            maxHeightClassName="h-[460px]"
            footerContent={
              <LocalPagination
                currentPage={Number(catalogProductsQuery.data?.page ?? 1)}
                totalPages={Math.max(1, Number(catalogProductsQuery.data?.totalPages ?? 1))}
                totalItems={Number(catalogProductsQuery.data?.total ?? catalogProducts.length)}
                startItem={
                  Number(catalogProductsQuery.data?.total ?? 0) === 0
                    ? 0
                    : (Number(catalogProductsQuery.data?.page ?? 1) - 1) * PRODUCT_PICKER_PAGE_SIZE + 1
                }
                endItem={Math.min(
                  (Number(catalogProductsQuery.data?.page ?? 1) - 1) * PRODUCT_PICKER_PAGE_SIZE + catalogProducts.length,
                  Number(catalogProductsQuery.data?.total ?? catalogProducts.length),
                )}
                singularLabel="producto"
                pluralLabel="productos"
                onPageChange={setCatalogPage}
              />
            }
          />

          <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
            <CardHeader>
              <CardTitle>Ejemplos listos para pruebas</CardTitle>
              <CardDescription>
                Estos ejemplos ya quedaron conectados a productos activos de la BD y puedes reusarlos desde el formulario.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {barcodeExamples.map((example) => (
                <button
                  key={`${example.productId}-${example.type}`}
                  type="button"
                  onClick={() => openCreateDialog({ productId: example.productId, code: example.code, type: example.type, isPrimary: false })}
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/15 p-3 text-left transition hover:border-primary/35 hover:bg-primary/5"
                >
                  <ProductImage
                    src={example.imageUrl}
                    alt={example.productName}
                    className="size-16 rounded-xl"
                    iconClassName="size-4"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{example.label}</p>
                      <Badge>Sembrado</Badge>
                    </div>
                    <p className="mt-1 break-all text-xs text-foreground">{example.code}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {example.productName} · {example.brand}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{example.description}</p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Relacion producto-codigo</CardTitle>
              <CardDescription>Consulta codigos activos e inactivos, su formato y el producto asociado usando filtros rapidos del backend.</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-3 md:flex-row lg:w-auto">
              <div className="relative min-w-[240px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Buscar por codigo, producto o marca..."
                  className="pl-9"
                />
              </div>

              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-full md:w-[190px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  {barcodeTypeFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-full md:w-[170px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            {barcodesQuery.isError ? (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
                {barcodesQuery.error.message}
              </div>
            ) : null}

            {!barcodesQuery.isError ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Codigo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Actualizado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length ? (
                      records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="align-top">
                            <div>
                              <p className="font-medium text-foreground">{record.code}</p>
                              <p className="text-xs text-muted-foreground">ID #{record.id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">{formatBarcodeType(record.type)}</TableCell>
                          <TableCell className="align-top">
                            <div>
                              <p className="font-medium text-foreground">{record.product?.name ?? 'Producto eliminado'}</p>
                              <p className="text-xs text-muted-foreground">{record.product?.brand ?? 'Sin marca'}</p>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            {record.isPrimary ? <Badge>Principal</Badge> : <Badge variant="outline">Secundario</Badge>}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant={getRecordStatusVariant(record)}>{getRecordStatus(record)}</Badge>
                          </TableCell>
                          <TableCell className="align-top">{formatDate(record.updatedAt)}</TableCell>
                          <TableCell className="text-right align-top">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetailRecord(record)}>
                                  <Eye className="mr-2 size-4" />
                                  Ver detalle
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setFormState({ open: true, mode: 'edit', record, preset: null })}>
                                  <Pencil className="mr-2 size-4" />
                                  Editar
                                </DropdownMenuItem>
                                {record.isActive && !record.isPrimary ? (
                                  <DropdownMenuItem onClick={() => handleMarkPrimary(record)}>
                                    <Star className="mr-2 size-4" />
                                    Marcar principal
                                  </DropdownMenuItem>
                                ) : null}
                                {record.isActive ? (
                                  <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteBarcode(record)}>
                                    <Power className="mr-2 size-4" />
                                    Desactivar
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center">
                          <div className="mx-auto max-w-md space-y-2">
                            <p className="font-medium text-foreground">No hay codigos para este filtro</p>
                            <p className="text-sm text-muted-foreground">
                              Ajusta la busqueda, cambia estado o tipo, o crea un nuevo codigo desde el boton superior.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                <LocalPagination
                  currentPage={Number(barcodesQuery.data?.page ?? 1)}
                  totalPages={Math.max(1, Number(barcodesQuery.data?.totalPages ?? 1))}
                  totalItems={Number(barcodesQuery.data?.total ?? records.length)}
                  startItem={
                    Number(barcodesQuery.data?.total ?? 0) === 0
                      ? 0
                      : (Number(barcodesQuery.data?.page ?? 1) - 1) * PAGE_SIZE + 1
                  }
                  endItem={Math.min(
                    (Number(barcodesQuery.data?.page ?? 1) - 1) * PAGE_SIZE + records.length,
                    Number(barcodesQuery.data?.total ?? records.length),
                  )}
                  singularLabel="codigo"
                  pluralLabel="codigos"
                  onPageChange={setCurrentPage}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <BarcodeFormDialog
        open={formState.open}
        onOpenChange={(open) =>
          setFormState((current) => ({
            ...current,
            open,
            record: open ? current.record : null,
            preset: open ? current.preset : null,
          }))
        }
        mode={formState.mode}
        barcode={formState.record}
        preset={formState.preset}
        examples={barcodeExamples}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailRecord)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailRecord(null)
          }
        }}
        title={detailRecord?.code ?? 'Detalle del codigo'}
        description={detailRecord ? getProductLabel(detailRecord.product) : ''}
        badge={detailRecord ? { label: getRecordStatus(detailRecord), variant: getRecordStatusVariant(detailRecord) } : undefined}
        fields={
          detailRecord
            ? [
                {
                  label: 'Ficha del codigo',
                  items: [
                    { label: 'Codigo', value: detailRecord.code },
                    { label: 'Tipo', value: formatBarcodeType(detailRecord.type) },
                    { label: 'Principal', value: detailRecord.isPrimary ? 'Si' : 'No' },
                    { label: 'Estado', value: getRecordStatus(detailRecord) },
                  ],
                },
                {
                  label: 'Producto asociado',
                  items: [
                    { label: 'Producto', value: detailRecord.product?.name ?? 'Producto eliminado' },
                    { label: 'Marca', value: detailRecord.product?.brand ?? 'Sin marca' },
                    { label: 'Creado', value: formatDate(detailRecord.createdAt) },
                    { label: 'Actualizado', value: formatDate(detailRecord.updatedAt) },
                  ],
                },
              ]
            : []
        }
      />
    </>
  )
}
