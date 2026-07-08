import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { ProductImage } from '@/components/product-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiClient } from '@/lib/api-client'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  getRecordStatus,
  getRecordStatusVariant,
  toApiStatus,
} from '@/lib/format'
import { barcodeTypeOptions } from '@/lib/barcodes'
import { InvoiceOcrImportAction } from '@/modules/products/invoice-ocr-import-dialog'
import { ProductBarcodesField } from '@/modules/products/barcodes-field'
import { buildCreateProductFormData, buildProductFormData } from '@/modules/products/product-form-data'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const barcodeTypeValues = barcodeTypeOptions.map((option) => option.value)
const barcodeTypeLabels = Object.fromEntries(barcodeTypeOptions.map((option) => [option.value, option.label]))

const optionalImageSchema = z
  .custom(
    (value) => value === undefined || value === null || (typeof File !== 'undefined' && value instanceof File),
    'Selecciona una imagen valida',
  )
  .optional()
  .refine(
    (file) => !file || file.size <= 5 * 1024 * 1024,
    'La imagen no puede superar 5 MB',
  )
  .refine(
    (file) =>
      !file || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
    'Usa una imagen JPG, PNG o WEBP',
  )

const createProductSchema = z
  .object({
    productTypeId: z.number({ message: 'Selecciona un tipo' }).int().positive('Selecciona un tipo'),
    providerId: z.number({ message: 'Selecciona un proveedor' }).int().positive('Selecciona un proveedor'),
    name: z.string().min(2, 'Minimo 2 caracteres'),
    description: z.string().optional(),
    brand: z.string().min(1, 'La marca es obligatoria'),
    taxRate: z.number({ message: 'Impuesto obligatorio' }).min(0, 'No puede ser negativo'),
    minimumStock: z.number({ message: 'Stock minimo obligatorio' }).int().min(0, 'No puede ser negativo'),
    maximumStock: z.number().int().min(0, 'No puede ser negativo').optional(),
    image: optionalImageSchema,
    initialPriceName: z.string().min(2, 'Minimo 2 caracteres'),
    initialPrice: z.number({ message: 'Precio obligatorio' }).positive('Debe ser mayor a cero'),
    initialWarehouseId: z.number({ message: 'Selecciona una bodega' }).int().positive('Selecciona una bodega'),
    initialQuantity: z.number({ message: 'Cantidad obligatoria' }).int().positive('Debe ser mayor a cero'),
    barcodes: z
      .array(
        z.object({
          code: z.string().trim().min(1, 'Ingresa el codigo'),
          type: z.enum(barcodeTypeValues),
          isPrimary: z.boolean().optional(),
        }),
      )
      .optional(),
  })
  .refine(
    (values) => values.maximumStock === undefined || values.maximumStock >= values.minimumStock,
    {
      path: ['maximumStock'],
      message: 'El stock maximo no puede ser menor al minimo',
    },
  )
  .refine(
    (values) => (values.barcodes?.filter((barcode) => barcode.isPrimary).length ?? 0) <= 1,
    {
      path: ['barcodes'],
      message: 'Solo puede existir un codigo principal por producto',
    },
  )

const updateProductSchema = z
  .object({
    productTypeId: z.number({ message: 'Selecciona un tipo' }).int().positive('Selecciona un tipo'),
    providerId: z.number({ message: 'Selecciona un proveedor' }).int().positive('Selecciona un proveedor'),
    name: z.string().min(2, 'Minimo 2 caracteres'),
    description: z.string().optional(),
    brand: z.string().min(1, 'La marca es obligatoria'),
    taxRate: z.number({ message: 'Impuesto obligatorio' }).min(0, 'No puede ser negativo'),
    minimumStock: z.number({ message: 'Stock minimo obligatorio' }).int().min(0, 'No puede ser negativo'),
    maximumStock: z.number().int().min(0, 'No puede ser negativo').optional(),
    image: optionalImageSchema,
  })
  .refine(
    (values) => values.maximumStock === undefined || values.maximumStock >= values.minimumStock,
    {
      path: ['maximumStock'],
      message: 'El stock maximo no puede ser menor al minimo',
    },
  )

function getDefaultPrice(product) {
  return product.prices?.find((price) => price.isDefault) ?? product.prices?.[0] ?? null
}

function getPrimaryBarcode(product) {
  return product.barcodes?.find((barcode) => barcode.isPrimary) ?? product.barcodes?.[0] ?? null
}

function formatBarcodeType(type) {
  return barcodeTypeLabels[type] ?? type ?? 'Sin tipo'
}

function formatBarcodeSummary(product) {
  if (!product.barcodes?.length) {
    return 'Sin codigos registrados'
  }

  return product.barcodes
    .map((barcode) => `${barcode.code}${barcode.isPrimary ? ' (principal)' : ''}`)
    .join(' · ')
}

function getTotalStock(product) {
  return (product.warehouses ?? []).reduce((total, item) => total + Number(item.quantity ?? 0), 0)
}

function formatWarehouseStock(product) {
  if (!product.warehouses?.length) {
    return 'Sin stock asignado'
  }

  return product.warehouses
    .map((item) => `${item.warehouse?.location ?? `Bodega #${item.warehouseId}`}: ${formatNumber(item.quantity)}`)
    .join(' · ')
}

function getStockSignal(product) {
  const totalStock = getTotalStock(product)
  const minimumStock = Number(product.minimumStock ?? 0)
  const maximumStock =
    product.maximumStock === null || product.maximumStock === undefined
      ? null
      : Number(product.maximumStock)
  const warningThreshold = maximumStock !== null ? Math.max(minimumStock + 1, maximumStock * 0.45) : Math.max(6, minimumStock * 2)

  if (totalStock <= minimumStock) {
    return {
      label: 'Falta stock',
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
    }
  }

  if (totalStock <= warningThreshold) {
    return {
      label: 'Stock regular',
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }

  return {
    label: 'Buen stock',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  }
}

const productStockFilterOptions = [
  { value: 'TODOS', label: 'Todo el stock' },
  { value: 'CON_STOCK', label: 'Con stock' },
  { value: 'SIN_STOCK', label: 'Sin stock' },
  { value: 'BAJO_MINIMO', label: 'Bajo minimo' },
  { value: 'EN_RANGO', label: 'En rango' },
  { value: 'SOBRE_MAXIMO', label: 'Sobre maximo' },
]

function createProductsConfig(lookups) {
  return {
    key: 'productos',
    title: 'Productos',
    description:
      'Gestiona el catalogo real con tipo, proveedor, marca, codigos de barras, precios iniciales e inventario asociado a bodegas.',
    singularLabel: 'Producto',
    badgeLabel: 'Catalogo · Inventario',
    createButtonLabel: 'Nuevo producto',
    createTitle: 'Crear producto',
    editTitle: 'Actualizar producto',
    createDescription: 'Registra un producto con su precio inicial, sus codigos de barras opcionales y stock inicial por bodega.',
    editDescription: 'Ajusta datos comerciales base del producto seleccionado.',
    submitCreateLabel: 'Crear producto',
    submitEditLabel: 'Guardar cambios',
    tableTitle: 'Catalogo operativo',
    tableDescription: 'Vista consolidada de tipo, proveedor, precio vigente y stock disponible.',
    searchPlaceholder: 'Buscar por nombre, marca, codigo, tipo, proveedor o bodega...',
    emptyTitle: 'No hay productos disponibles',
    emptyDescription: 'Crea el primer producto para empezar a operar inventario.',
    archiveLoadingLabel: 'Desactivando producto...',
    archiveSuccessLabel: 'Producto desactivado',
    archiveConfirmationLabel:
      'El producto no se eliminara fisicamente y conservara su historial de facturacion.',
    reactivateLoadingLabel: 'Reactivando producto...',
    reactivateSuccessLabel: 'Producto reactivado',
    reactivateConfirmationLabel:
      'El producto volvera a quedar disponible para facturar y operar.',
    statusFilter: 'api',
    getInitialFilters: () => ({
      productTypeId: 'TODOS',
      providerId: 'TODOS',
      warehouseId: 'TODOS',
      stockStatus: 'TODOS',
      brand: '',
      barcode: '',
    }),
    renderTableFilters: ({ filters, updateFilters }) => (
      <>
        <Select
          value={filters.productTypeId}
          onValueChange={(value) => updateFilters((current) => ({ ...current, productTypeId: value }))}
        >
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los tipos</SelectItem>
            {lookups.productTypes.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.providerId}
          onValueChange={(value) => updateFilters((current) => ({ ...current, providerId: value }))}
        >
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los proveedores</SelectItem>
            {lookups.providers.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.warehouseId}
          onValueChange={(value) => updateFilters((current) => ({ ...current, warehouseId: value }))}
        >
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Bodega" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas las bodegas</SelectItem>
            {lookups.warehouses.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.stockStatus}
          onValueChange={(value) => updateFilters((current) => ({ ...current, stockStatus: value }))}
        >
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            {productStockFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={filters.brand}
          onChange={(event) => updateFilters((current) => ({ ...current, brand: event.target.value }))}
          placeholder="Filtrar marca..."
          className="w-full md:w-[180px]"
        />

        <Input
          value={filters.barcode}
          onChange={(event) => updateFilters((current) => ({ ...current, barcode: event.target.value }))}
          placeholder="Filtrar codigo..."
          className="w-full md:w-[180px]"
        />

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            updateFilters({
              productTypeId: 'TODOS',
              providerId: 'TODOS',
              warehouseId: 'TODOS',
              stockStatus: 'TODOS',
              brand: '',
              barcode: '',
            })
          }
        >
          Limpiar filtros
        </Button>
      </>
    ),
    fields: [
      {
        name: 'productTypeId',
        label: 'Tipo de producto',
        type: 'select',
        valueType: 'number',
        placeholder: 'Selecciona un tipo',
        options: lookups.productTypes.map((item) => ({ value: item.id, label: item.name })),
      },
      {
        name: 'providerId',
        label: 'Proveedor',
        type: 'select',
        valueType: 'number',
        placeholder: 'Selecciona un proveedor',
        options: lookups.providers.map((item) => ({ value: item.id, label: item.name })),
      },
      { name: 'name', label: 'Nombre', placeholder: 'Cafe premium' },
      { name: 'brand', label: 'Marca', placeholder: 'Marca propia' },
      {
        name: 'image',
        label: 'Imagen del producto',
        type: 'file',
        accept: 'image/jpeg,image/png,image/webp',
        helpText: 'JPG, PNG o WEBP. Maximo 5 MB.',
        fullWidth: true,
        getPreviewValue: (record) => record?.imageUrl,
      },
      {
        name: 'description',
        label: 'Descripcion',
        type: 'textarea',
        placeholder: 'Descripcion corta del producto',
        rows: 3,
        fullWidth: true,
      },
      {
        name: 'barcodes',
        label: 'Codigos de barras',
        render: ProductBarcodesField,
        fullWidth: true,
        hiddenOnEdit: true,
      },
      { name: 'taxRate', label: 'Impuesto %', type: 'number', placeholder: '19' },
      { name: 'minimumStock', label: 'Stock minimo', type: 'number', placeholder: '10' },
      { name: 'maximumStock', label: 'Stock maximo', type: 'number', placeholder: '100' },
      {
        name: 'initialPriceName',
        label: 'Nombre del precio inicial',
        placeholder: 'Precio base',
        hiddenOnEdit: true,
      },
      {
        name: 'initialPrice',
        label: 'Precio inicial',
        type: 'number',
        placeholder: '25000',
        hiddenOnEdit: true,
      },
      {
        name: 'initialWarehouseId',
        label: 'Bodega inicial',
        type: 'select',
        valueType: 'number',
        placeholder: 'Selecciona una bodega',
        options: lookups.warehouses.map((item) => ({ value: item.id, label: item.location })),
        hiddenOnEdit: true,
      },
      {
        name: 'initialQuantity',
        label: 'Stock inicial',
        type: 'number',
        placeholder: '50',
        hiddenOnEdit: true,
      },
    ],
    createSchema: createProductSchema,
    updateSchema: updateProductSchema,
    getDefaultValues: (_, record) => ({
      productTypeId: record?.productTypeId ?? undefined,
      providerId: record?.providerId ?? undefined,
      name: record?.name ?? '',
      description: record?.description ?? '',
      brand: record?.brand ?? '',
      image: undefined,
      taxRate: Number(record?.taxRate ?? 0),
      minimumStock: Number(record?.minimumStock ?? 0),
      maximumStock:
        record && record.maximumStock !== null && record.maximumStock !== undefined
          ? Number(record.maximumStock)
          : undefined,
      initialPriceName: 'Precio base',
      initialPrice: undefined,
      initialWarehouseId: undefined,
      initialQuantity: undefined,
      barcodes: [],
    }),
    prepareValues: (mode, values) => {
      if (mode === 'edit') {
        const payload = { ...values }
        delete payload.initialPriceName
        delete payload.initialPrice
        delete payload.initialWarehouseId
        delete payload.initialQuantity
        delete payload.barcodes
        return buildProductFormData(payload)
      }

      return buildCreateProductFormData(values)
    },
    renderHeaderActions: ({ invalidateRecords }) => (
      <InvoiceOcrImportAction lookups={lookups} onImported={invalidateRecords} />
    ),
    fetchRecords: ({ status, search, page, limit, filters }) =>
      apiClient.get('/productos', {
        estado: toApiStatus(status),
        q: search,
        page,
        limit,
        productTypeId: filters.productTypeId === 'TODOS' ? undefined : Number(filters.productTypeId),
        providerId: filters.providerId === 'TODOS' ? undefined : Number(filters.providerId),
        warehouseId: filters.warehouseId === 'TODOS' ? undefined : Number(filters.warehouseId),
        stockStatus: filters.stockStatus === 'TODOS' ? undefined : filters.stockStatus,
        brand: filters.brand?.trim() || undefined,
        barcode: filters.barcode?.trim() || undefined,
      }),
    createRecord: (payload) => apiClient.post('/productos', payload),
    updateRecord: (id, payload) => apiClient.patch(`/productos/${id}`, payload),
    archiveRecord: (id) => apiClient.delete(`/productos/${id}`),
    reactivateRecord: (id) => apiClient.patch(`/productos/${id}/reactivar`),
    searchResolver: (record) => [
      record.name,
      record.brand,
      record.description,
      record.productType?.name,
      record.provider?.name,
      ...(record.barcodes ?? []).map((barcode) => barcode.code),
      ...(record.warehouses ?? []).map((item) => item.warehouse?.location),
    ],
    getSummaryCards: ({ rawRecords }) => {
      const inventoryValue = rawRecords.reduce((total, record) => {
        const defaultPrice = getDefaultPrice(record)
        return total + Number(defaultPrice?.price ?? 0) * getTotalStock(record)
      }, 0)
      const activeCount = rawRecords.filter((record) => record.isActive).length
      const stockUnits = rawRecords.reduce((total, record) => total + getTotalStock(record), 0)

      return [
        {
          label: 'Productos visibles',
          value: formatNumber(rawRecords.length),
          help: 'Productos visibles segun el filtro de estado aplicado.',
        },
        {
          label: 'Stock total',
          value: formatNumber(stockUnits),
          help: 'Unidades disponibles sumando todas las bodegas registradas.',
        },
        {
          label: 'Valor inventario',
          value: formatCurrency(inventoryValue),
          help: 'Aproximacion usando precio default por stock total.',
        },
        {
          label: 'Productos activos',
          value: formatNumber(activeCount),
          help: 'Catalogo habilitado para ventas.',
        },
      ]
    },
    columns: [
      {
        key: 'product',
        label: 'Producto',
        render: (record) => (
          <div className="flex items-center gap-3">
            <ProductImage
              src={record.imageUrl}
              alt={record.name}
              className="size-12 rounded-lg"
              iconClassName="size-4"
            />
            <div>
              <p className="font-medium text-foreground">{record.name}</p>
              <p className="text-xs text-muted-foreground">
                {record.brand} · {record.productType?.name ?? 'Sin tipo'}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: 'provider',
        label: 'Proveedor',
        render: (record) => record.provider?.name ?? 'Sin proveedor',
      },
      {
        key: 'price',
        label: 'Precio default',
        render: (record) => {
          const defaultPrice = getDefaultPrice(record)
          return defaultPrice ? formatCurrency(defaultPrice.price) : 'Sin precio'
        },
      },
      {
        key: 'stock',
        label: 'Stock total',
        render: (record) => (
          <div>
            <p>{formatNumber(getTotalStock(record))}</p>
            <p className="text-xs text-muted-foreground">
              Min {formatNumber(record.minimumStock)}
              {record.maximumStock !== null && record.maximumStock !== undefined
                ? ` · Max ${formatNumber(record.maximumStock)}`
                : ''}
            </p>
            <Badge variant="outline" className={`mt-2 ${getStockSignal(record).className}`}>
              {getStockSignal(record).label}
            </Badge>
          </div>
        ),
      },
      {
        key: 'barcode',
        label: 'Codigo principal',
        render: (record) => {
          const primaryBarcode = getPrimaryBarcode(record)

          if (!primaryBarcode) {
            return 'Sin codigo'
          }

          return (
            <div>
              <p className="font-medium text-foreground">{primaryBarcode.code}</p>
              <p className="text-xs text-muted-foreground">
                {formatBarcodeType(primaryBarcode.type)}
                {record.barcodes?.length > 1 ? ` · +${record.barcodes.length - 1} adicional(es)` : ''}
              </p>
            </div>
          )
        },
      },
      {
        key: 'status',
        label: 'Estado',
        render: (record) => (
          <Badge variant={getRecordStatusVariant(record)}>{getRecordStatus(record)}</Badge>
        ),
      },
    ],
    getDetailTitle: (record) => record.name,
    getDetailDescription: (record) => `${record.brand} · ${record.productType?.name ?? 'Sin tipo'}`,
    getDetailSections: (record) => {
      const defaultPrice = getDefaultPrice(record)

      return [
        {
          label: 'Ficha comercial',
          items: [
            {
              label: 'Imagen',
              value: (
                <ProductImage
                  src={record.imageUrl}
                  alt={record.name}
                  className="size-20 rounded-xl"
                  iconClassName="size-5"
                />
              ),
            },
            { label: 'Tipo', value: record.productType?.name ?? 'Sin tipo' },
            { label: 'Proveedor', value: record.provider?.name ?? 'Sin proveedor' },
            { label: 'Marca', value: record.brand },
            { label: 'IVA', value: `${record.taxRate}%` },
          ],
        },
        {
          label: 'Inventario',
          items: [
            { label: 'Stock total', value: formatNumber(getTotalStock(record)) },
            { label: 'Stock minimo', value: formatNumber(record.minimumStock) },
            {
              label: 'Stock maximo',
              value:
                record.maximumStock === null || record.maximumStock === undefined
                  ? 'Sin definir'
                  : formatNumber(record.maximumStock),
            },
            {
              label: 'Semaforo',
              value: (
                <Badge variant="outline" className={getStockSignal(record).className}>
                  {getStockSignal(record).label}
                </Badge>
              ),
            },
            { label: 'Bodegas', value: formatWarehouseStock(record) },
          ],
        },
        {
          label: 'Codigos de barras',
          items: [
            {
              label: 'Principal',
              value: getPrimaryBarcode(record)?.code ?? 'Sin codigo principal',
            },
            {
              label: 'Tipo principal',
              value: formatBarcodeType(getPrimaryBarcode(record)?.type),
            },
            {
              label: 'Total registrados',
              value: record.barcodes?.length ? formatNumber(record.barcodes.length) : '0',
            },
            {
              label: 'Todos los codigos',
              value: formatBarcodeSummary(record),
            },
          ],
        },
        {
          label: 'Precios y trazabilidad',
          items: [
            {
              label: 'Precio default',
              value: defaultPrice ? `${defaultPrice.name} · ${formatCurrency(defaultPrice.price)}` : 'Sin precio',
            },
            {
              label: 'Precios registrados',
              value: record.prices?.length ? formatNumber(record.prices.length) : '0',
            },
            { label: 'Estado', value: getRecordStatus(record) },
            { label: 'Actualizado', value: formatDate(record.updatedAt) },
          ],
        },
      ]
    },
  }
}

export function ProductsPage() {
  const productTypesQuery = useQuery({
    queryKey: ['productos-tipos-lookup'],
    queryFn: () => apiClient.getAllPages('/tipos-producto'),
  })

  const providersQuery = useQuery({
    queryKey: ['productos-proveedores-lookup'],
    queryFn: () => apiClient.getAllPages('/proveedores'),
  })

  const warehousesQuery = useQuery({
    queryKey: ['productos-bodegas-lookup'],
    queryFn: () => apiClient.getAllPages('/bodegas'),
  })

  const lookups = {
    productTypes: productTypesQuery.data ?? [],
    providers: providersQuery.data ?? [],
    warehouses: warehousesQuery.data ?? [],
  }

  return (
    <CrudModulePage
      config={createProductsConfig(lookups)}
      lookupsLoading={productTypesQuery.isLoading || providersQuery.isLoading || warehousesQuery.isLoading}
    />
  )
}
