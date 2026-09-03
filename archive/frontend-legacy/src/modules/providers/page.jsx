import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import {
  formatDate,
  formatNumber,
  getRecordStatus,
  getRecordStatusVariant,
  toApiStatus,
} from '@/lib/format'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const providerSchema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  taxId: z.string().optional(),
  providerType: z.string().optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  phonePrimary: z.string().optional(),
  phoneSecondary: z.string().optional(),
  email: z.string().email('Correo invalido').optional().or(z.literal('')),
  legalRepresentative: z.string().optional(),
})

const providersConfig = {
  key: 'proveedores',
  title: 'Proveedores',
  description: 'Centraliza la ficha completa de proveedores para compras, catalogo y trazabilidad tributaria.',
  singularLabel: 'Proveedor',
  badgeLabel: 'Catalogo · Compras',
  createButtonLabel: 'Nuevo proveedor',
  createTitle: 'Crear proveedor',
  editTitle: 'Actualizar proveedor',
  createDescription: 'Registra un nuevo proveedor para el catalogo y abastecimiento.',
  editDescription: 'Ajusta datos fiscales, de contacto y cobertura del proveedor seleccionado.',
  submitCreateLabel: 'Crear proveedor',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Directorio de proveedores',
  tableDescription: 'Vista centralizada de proveedores activos e inactivos con datos fiscales y de contacto.',
  searchPlaceholder: 'Buscar por nombre, NIT, telefono o correo...',
  emptyTitle: 'No hay proveedores registrados',
  emptyDescription: 'Crea el primer proveedor para empezar a relacionar productos.',
  archiveLoadingLabel: 'Desactivando proveedor...',
  archiveSuccessLabel: 'Proveedor desactivado',
  archiveConfirmationLabel: 'El proveedor dejara de estar disponible para productos nuevos.',
  reactivateLoadingLabel: 'Reactivando proveedor...',
  reactivateSuccessLabel: 'Proveedor reactivado',
  reactivateConfirmationLabel: 'El proveedor volvera a quedar disponible en el catalogo.',
  statusFilter: 'api',
  fields: [
    { name: 'name', label: 'Nombre', placeholder: 'Proveedor principal' },
    { name: 'taxId', label: 'NIT / ID fiscal', placeholder: '900123456-7' },
    { name: 'providerType', label: 'Tipo', placeholder: 'Mayorista, fabricante, importador...' },
    { name: 'country', label: 'Pais', placeholder: 'Colombia' },
    { name: 'phonePrimary', label: 'Telefono principal', placeholder: '3001234567' },
    { name: 'phoneSecondary', label: 'Telefono secundario', placeholder: '6051234567' },
    { name: 'email', label: 'Correo', placeholder: 'compras@proveedor.com' },
    { name: 'legalRepresentative', label: 'Representante', placeholder: 'Maria Perez' },
    {
      name: 'description',
      label: 'Descripcion',
      type: 'textarea',
      placeholder: 'Descripcion breve del proveedor',
      rows: 3,
      fullWidth: true,
    },
    {
      name: 'address',
      label: 'Direccion',
      type: 'textarea',
      placeholder: 'Direccion fiscal o comercial del proveedor',
      rows: 3,
      fullWidth: true,
    },
  ],
  createSchema: providerSchema,
  updateSchema: providerSchema,
  getDefaultValues: (_, record) => ({
    name: record?.name ?? '',
    taxId: record?.taxId ?? '',
    providerType: record?.providerType ?? '',
    description: record?.description ?? '',
    address: record?.address ?? '',
    country: record?.country ?? '',
    phonePrimary: record?.phonePrimary ?? '',
    phoneSecondary: record?.phoneSecondary ?? '',
    email: record?.email ?? '',
    legalRepresentative: record?.legalRepresentative ?? '',
  }),
  prepareValues: (_, values) =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() || undefined : value,
      ]),
    ),
  fetchRecords: ({ status, search, page, limit }) =>
    apiClient.get('/proveedores', { estado: toApiStatus(status), q: search, page, limit }),
  createRecord: (payload) => apiClient.post('/proveedores', payload),
  updateRecord: (id, payload) => apiClient.patch(`/proveedores/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/proveedores/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/proveedores/${id}/reactivar`),
  searchResolver: (record) => [
    record.name,
    record.taxId,
    record.providerType,
    record.description,
    record.address,
    record.country,
    record.phonePrimary,
    record.phoneSecondary,
    record.email,
    record.legalRepresentative,
  ],
  getSummaryCards: ({ rawRecords }) => {
    const activeCount = rawRecords.filter((record) => record.isActive).length

    return [
      {
        label: 'Proveedores visibles',
        value: formatNumber(rawRecords.length),
        help: 'Total mostrado segun el filtro de estado.',
      },
      {
        label: 'Proveedores activos',
        value: formatNumber(activeCount),
        help: 'Disponibles para asignar a productos nuevos.',
      },
      {
        label: 'Con NIT cargado',
        value: formatNumber(rawRecords.filter((record) => record.taxId).length),
        help: 'Base fiscal lista para compras y cruces contables.',
      },
      {
        label: 'Con contacto',
        value: formatNumber(rawRecords.filter((record) => record.phonePrimary || record.email).length),
        help: 'Proveedores con al menos un canal directo de comunicacion.',
      },
    ]
  },
  columns: [
    {
      key: 'name',
      label: 'Proveedor',
      render: (record) => (
        <div>
          <p className="font-medium text-foreground">{record.name}</p>
          <p className="text-xs text-muted-foreground">ID #{record.id}</p>
        </div>
      ),
    },
      {
        key: 'tax',
        label: 'Fiscal',
        render: (record) => (
          <div>
            <p>{record.taxId ?? 'Sin NIT'}</p>
            <p className="text-xs text-muted-foreground">{record.providerType ?? 'Sin tipo'}</p>
          </div>
        ),
      },
      {
        key: 'contact',
        label: 'Contacto',
        render: (record) => (
          <div>
            <p>{record.phonePrimary ?? record.phoneSecondary ?? 'Sin telefono'}</p>
            <p className="text-xs text-muted-foreground">{record.email ?? 'Sin correo'}</p>
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
    {
      key: 'updatedAt',
      label: 'Actualizado',
      render: (record) => formatDate(record.updatedAt),
    },
  ],
  getDetailTitle: (record) => record.name,
  getDetailDescription: (record) => `Proveedor #${record.id}`,
  getDetailSections: (record) => [
    {
      label: 'Informacion general',
      items: [
        { label: 'Nombre', value: record.name },
        { label: 'NIT / ID fiscal', value: record.taxId ?? 'Sin registrar' },
        { label: 'Tipo', value: record.providerType ?? 'Sin tipo' },
        { label: 'Descripcion', value: record.description ?? 'Sin descripcion' },
        { label: 'Estado', value: getRecordStatus(record) },
      ],
    },
    {
      label: 'Contacto y ubicacion',
      items: [
        { label: 'Direccion', value: record.address ?? 'Sin direccion' },
        { label: 'Pais', value: record.country ?? 'Sin pais' },
        { label: 'Telefono principal', value: record.phonePrimary ?? 'Sin telefono' },
        { label: 'Telefono secundario', value: record.phoneSecondary ?? 'Sin telefono' },
        { label: 'Correo', value: record.email ?? 'Sin correo' },
        { label: 'Representante', value: record.legalRepresentative ?? 'Sin representante' },
      ],
    },
    {
      label: 'Trazabilidad',
      items: [
        { label: 'Creado', value: formatDate(record.createdAt) },
        { label: 'Actualizado', value: formatDate(record.updatedAt) },
        { label: 'Eliminado', value: record.deletedAt ? formatDate(record.deletedAt) : 'No' },
      ],
    },
  ],
}

export function ProvidersPage() {
  return <CrudModulePage config={providersConfig} />
}
