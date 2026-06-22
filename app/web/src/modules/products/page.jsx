import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  getRecordStatus,
  getRecordStatusVariant,
  toApiStatus,
} from '@/lib/format'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

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
    initialPriceName: z.string().min(2, 'Minimo 2 caracteres'),
    initialPrice: z.number({ message: 'Precio obligatorio' }).positive('Debe ser mayor a cero'),
    initialWarehouseId: z.number({ message: 'Selecciona una bodega' }).int().positive('Selecciona una bodega'),
    initialQuantity: z.number({ message: 'Cantidad obligatoria' }).int().positive('Debe ser mayor a cero'),
  })
  .refine(
    (values) => values.maximumStock === undefined || values.maximumStock >= values.minimumStock,
    {
      path: ['maximumStock'],
      message: 'El stock maximo no puede ser menor al minimo',
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

function createProductsConfig(lookups) {
  return {
    key: 'productos',
    title: 'Productos',
    description:
      'Gestiona el catalogo real con tipo, proveedor, marca, precios iniciales e inventario asociado a bodegas.',
    singularLabel: 'Producto',
    badgeLabel: 'Catalogo · Inventario',
    createButtonLabel: 'Nuevo producto',
    createTitle: 'Crear producto',
    editTitle: 'Actualizar producto',
    createDescription: 'Registra un producto con su precio inicial y stock inicial por bodega.',
    editDescription: 'Ajusta datos comerciales base del producto seleccionado.',
    submitCreateLabel: 'Crear producto',
    submitEditLabel: 'Guardar cambios',
    tableTitle: 'Catalogo operativo',
    tableDescription: 'Vista consolidada de tipo, proveedor, precio vigente y stock disponible.',
    searchPlaceholder: 'Buscar por nombre, marca, tipo, proveedor o bodega...',
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
        name: 'description',
        label: 'Descripcion',
        type: 'textarea',
        placeholder: 'Descripcion corta del producto',
        rows: 3,
        fullWidth: true,
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
    }),
    prepareValues: (mode, values) => {
      if (mode === 'edit') {
        const { initialPriceName, initialPrice, initialWarehouseId, initialQuantity, ...payload } = values
        return payload
      }

      return {
        productTypeId: values.productTypeId,
        providerId: values.providerId,
        name: values.name,
        description: values.description,
        brand: values.brand,
        taxRate: values.taxRate,
        minimumStock: values.minimumStock,
        maximumStock: values.maximumStock,
        prices: [
          {
            name: values.initialPriceName,
            price: values.initialPrice,
            isDefault: true,
          },
        ],
        warehouses: [
          {
            warehouseId: values.initialWarehouseId,
            quantity: values.initialQuantity,
          },
        ],
      }
    },
    fetchRecords: (status) => apiClient.get('/productos', { estado: toApiStatus(status) }),
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
          <div>
            <p className="font-medium text-foreground">{record.name}</p>
            <p className="text-xs text-muted-foreground">
              {record.brand} · {record.productType?.name ?? 'Sin tipo'}
            </p>
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
          </div>
        ),
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
            { label: 'Bodegas', value: formatWarehouseStock(record) },
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
    queryFn: () => apiClient.get('/tipos-producto'),
  })

  const providersQuery = useQuery({
    queryKey: ['productos-proveedores-lookup'],
    queryFn: () => apiClient.get('/proveedores'),
  })

  const warehousesQuery = useQuery({
    queryKey: ['productos-bodegas-lookup'],
    queryFn: () => apiClient.get('/bodegas'),
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
