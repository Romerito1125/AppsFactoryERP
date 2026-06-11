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

const clientSchema = z.object({
  identification: z.string().min(5, 'Minimo 5 caracteres'),
  firstName: z.string().min(2, 'Minimo 2 caracteres'),
  lastName: z.string().min(2, 'Minimo 2 caracteres'),
  phone: z.string().optional(),
  address: z.string().optional(),
})

const clientsConfig = {
  key: 'clientes',
  title: 'Clientes',
  description:
    'Administra la base comercial, el estado de cada cliente y la informacion operativa para facturacion.',
  singularLabel: 'Cliente',
  badgeLabel: 'CRM · Ventas',
  createButtonLabel: 'Nuevo cliente',
  createTitle: 'Crear cliente',
  editTitle: 'Actualizar cliente',
  createDescription: 'Registra un cliente con su informacion base para ventas.',
  editDescription: 'Edita datos de contacto, identificacion o estado del cliente.',
  submitCreateLabel: 'Crear cliente',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Base de clientes',
  tableDescription: 'Consulta rapida del estado comercial y contacto principal.',
  searchPlaceholder: 'Buscar por nombre, documento o telefono...',
  emptyTitle: 'No hay clientes disponibles',
  emptyDescription: 'Registra el primer cliente para empezar a facturar.',
  archiveLoadingLabel: 'Desactivando cliente...',
  archiveSuccessLabel: 'Cliente desactivado',
  archiveConfirmationLabel:
    'El cliente dejara de estar disponible para nuevas operaciones hasta ser reactivado.',
  reactivateLoadingLabel: 'Reactivando cliente...',
  reactivateSuccessLabel: 'Cliente reactivado',
  reactivateConfirmationLabel:
    'El cliente volvera a quedar disponible para ventas y facturacion.',
  statusFilter: 'api',
  fields: [
    { name: 'identification', label: 'Identificacion', placeholder: '123456789' },
    { name: 'firstName', label: 'Nombres', placeholder: 'Juan' },
    { name: 'lastName', label: 'Apellidos', placeholder: 'Perez' },
    { name: 'phone', label: 'Telefono', placeholder: '3001234567' },
    {
      name: 'address',
      label: 'Direccion',
      placeholder: 'Calle 123 #45-67',
      type: 'textarea',
      rows: 3,
      fullWidth: true,
    },
  ],
  createSchema: clientSchema,
  updateSchema: clientSchema,
  getDefaultValues: (_, record) => ({
    identification: record?.identification ?? '',
    firstName: record?.firstName ?? '',
    lastName: record?.lastName ?? '',
    phone: record?.phone ?? '',
    address: record?.address ?? '',
  }),
  fetchRecords: (status) => apiClient.get('/clientes', { estado: toApiStatus(status) }),
  createRecord: (payload) => apiClient.post('/clientes', payload),
  updateRecord: (id, payload) => apiClient.patch(`/clientes/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/clientes/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/clientes/${id}/reactivar`),
  searchResolver: (record) => [
    record.identification,
    `${record.firstName} ${record.lastName}`,
    record.phone,
    record.address,
  ],
  getSummaryCards: ({ rawRecords }) => {
    const activeCount = rawRecords.filter((record) => record.isActive).length

    return [
      {
        label: 'Clientes visibles',
        value: formatNumber(rawRecords.length),
        help: 'Cantidad mostrada segun el filtro actual de estado.',
      },
      {
        label: 'Con telefono',
        value: formatNumber(rawRecords.filter((record) => record.phone).length),
        help: 'Clientes con contacto telefonico registrado.',
      },
      {
        label: 'Activos en vista',
        value: formatNumber(activeCount),
        help: 'Clientes actualmente operativos dentro del resultado cargado.',
      },
      {
        label: 'Inactivos en vista',
        value: formatNumber(rawRecords.length - activeCount),
        help: 'Clientes conservados para historico y posible reactivacion.',
      },
    ]
  },
  columns: [
    {
      key: 'name',
      label: 'Cliente',
      render: (record) => (
        <div>
          <p className="font-medium text-foreground">{`${record.firstName} ${record.lastName}`}</p>
          <p className="text-xs text-muted-foreground">{record.identification}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      label: 'Contacto',
      render: (record) => (
        <div>
          <p>{record.phone ?? 'Sin telefono'}</p>
          <p className="text-xs text-muted-foreground">{record.address ?? 'Sin direccion'}</p>
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
      key: 'createdAt',
      label: 'Registro',
      render: (record) => formatDate(record.createdAt),
    },
  ],
  getDetailTitle: (record) => `${record.firstName} ${record.lastName}`,
  getDetailDescription: (record) => `Identificacion ${record.identification}`,
  getDetailSections: (record) => [
    {
      label: 'Perfil comercial',
      items: [
        { label: 'Documento', value: record.identification },
        { label: 'Telefono', value: record.phone ?? 'Sin telefono' },
        { label: 'Direccion', value: record.address ?? 'Sin direccion' },
        { label: 'Estado', value: getRecordStatus(record) },
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

export function ClientsPage() {
  return <CrudModulePage config={clientsConfig} />
}
