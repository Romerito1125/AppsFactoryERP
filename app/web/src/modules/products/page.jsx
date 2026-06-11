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

const productSchema = z.object({
  type: z.string().min(2, 'Minimo 2 caracteres'),
  name: z.string().min(2, 'Minimo 2 caracteres'),
  description: z.string().optional(),
  price: z.number({ message: 'Precio obligatorio' }).min(0, 'No puede ser negativo'),
  taxRate: z.number({ message: 'Impuesto obligatorio' }).min(0, 'No puede ser negativo'),
  quantity: z.number({ message: 'Cantidad obligatoria' }).int().min(0, 'No puede ser negativa'),
  warehouseId: z.number({ message: 'Selecciona una bodega' }).int().positive('Selecciona una bodega'),
})

const productsConfig = {
  key: 'productos',
  title: 'Productos',
  description:
    'Gestiona el catalogo, el stock disponible, el impuesto aplicado y la bodega asignada a cada item.',
  singularLabel: 'Producto',
  badgeLabel: 'Catalogo · Inventario',
  createButtonLabel: 'Nuevo producto',
  createTitle: 'Crear producto',
  editTitle: 'Actualizar producto',
  createDescription: 'Registra un producto con precio, impuesto y stock inicial.',
  editDescription: 'Ajusta datos comerciales o inventario del producto seleccionado.',
  submitCreateLabel: 'Crear producto',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Catalogo operativo',
  tableDescription: 'Inventario conectado a bodegas con control de estado y existencias.',
  searchPlaceholder: 'Buscar por nombre, tipo o bodega...',
  emptyTitle: 'No hay productos disponibles',
  emptyDescription: 'Crea el primer producto para empezar a operar inventario.',
  archiveLoadingLabel: 'Desactivando producto...',
  archiveSuccessLabel: 'Producto desactivado',
  archiveConfirmationLabel:
    'El producto no se eliminara fisicamente y conservara su historial de facturacion.',
  reactivateLoadingLabel: 'Reactivando producto...',
  reactivateSuccessLabel: 'Producto reactivado',
  reactivateConfirmationLabel:
    'El producto volvera a quedar disponible para facturar y mover inventario.',
  statusFilter: 'api',
  fields: [
    { name: 'type', label: 'Tipo', placeholder: 'Alimento' },
    { name: 'name', label: 'Nombre', placeholder: 'Cafe premium' },
    {
      name: 'description',
      label: 'Descripcion',
      type: 'textarea',
      placeholder: 'Descripcion corta del producto',
      rows: 3,
      fullWidth: true,
    },
    { name: 'price', label: 'Precio', type: 'number', placeholder: '25000' },
    { name: 'taxRate', label: 'Impuesto %', type: 'number', placeholder: '19' },
    { name: 'quantity', label: 'Cantidad', type: 'number', placeholder: '50' },
    {
      name: 'warehouseId',
      label: 'Bodega',
      type: 'select',
      valueType: 'number',
      placeholder: 'Selecciona una bodega',
      options: ({ lookups }) =>
        (lookups.warehouses ?? []).map((warehouse) => ({
          value: warehouse.id,
          label: warehouse.location,
        })),
    },
  ],
  createSchema: productSchema,
  updateSchema: productSchema,
  getDefaultValues: (_, record) => ({
    type: record?.type ?? '',
    name: record?.name ?? '',
    description: record?.description ?? '',
    price: Number(record?.price ?? 0),
    taxRate: Number(record?.taxRate ?? 0),
    quantity: Number(record?.quantity ?? 0),
    warehouseId: record?.warehouseId ?? undefined,
  }),
  fetchRecords: (status) => apiClient.get('/productos', { estado: toApiStatus(status) }),
  createRecord: (payload) => apiClient.post('/productos', payload),
  updateRecord: (id, payload) => apiClient.patch(`/productos/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/productos/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/productos/${id}/reactivar`),
  searchResolver: (record) => [record.name, record.type, record.warehouse?.location],
  getSummaryCards: ({ rawRecords }) => {
    const inventoryValue = rawRecords.reduce(
      (total, record) => total + Number(record.price ?? 0) * Number(record.quantity ?? 0),
      0,
    )
    const activeCount = rawRecords.filter((record) => record.isActive).length
    const stockUnits = rawRecords.reduce((total, record) => total + Number(record.quantity ?? 0), 0)

    return [
      {
        label: 'Productos visibles',
        value: formatNumber(rawRecords.length),
        help: 'Productos visibles segun el filtro de estado aplicado.',
      },
      {
        label: 'Stock total',
        value: formatNumber(stockUnits),
        help: 'Unidades disponibles dentro del resultado actual.',
      },
      {
        label: 'Valor inventario',
        value: formatCurrency(inventoryValue),
        help: 'Aproximacion con precio actual por cantidad disponible.',
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
          <p className="text-xs text-muted-foreground">{record.type}</p>
        </div>
      ),
    },
    {
      key: 'warehouse',
      label: 'Bodega',
      render: (record) => record.warehouse?.location ?? 'Sin bodega',
    },
    {
      key: 'price',
      label: 'Precio',
      render: (record) => formatCurrency(record.price),
    },
    {
      key: 'quantity',
      label: 'Cantidad',
      render: (record) => formatNumber(record.quantity),
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
  getDetailDescription: (record) => `${record.type} · Bodega ${record.warehouse?.location ?? 'sin asignar'}`,
  getDetailSections: (record) => [
    {
      label: 'Ficha comercial',
      items: [
        { label: 'Tipo', value: record.type },
        { label: 'Precio', value: formatCurrency(record.price) },
        { label: 'Impuesto', value: `${record.taxRate}%` },
        { label: 'Stock', value: formatNumber(record.quantity) },
      ],
    },
    {
      label: 'Operacion',
      items: [
        { label: 'Bodega', value: record.warehouse?.location ?? 'Sin bodega' },
        { label: 'Estado', value: getRecordStatus(record) },
        { label: 'Descripcion', value: record.description ?? 'Sin descripcion' },
        { label: 'Actualizado', value: formatDate(record.updatedAt) },
      ],
    },
  ],
}

export function ProductsPage() {
  const warehousesQuery = useQuery({
    queryKey: ['productos', 'bodegas-lookup'],
    queryFn: () => apiClient.get('/bodegas', { estado: 'todos' }),
  })

  return (
    <CrudModulePage
      config={productsConfig}
      lookups={{ warehouses: warehousesQuery.data ?? [] }}
      lookupsLoading={warehousesQuery.isLoading}
    />
  )
}
