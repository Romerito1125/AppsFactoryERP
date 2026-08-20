import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import {
  formatClientType,
  formatDate,
  formatNumber,
  getRecordStatus,
  getRecordStatusVariant,
  toApiStatus,
} from '@/lib/format'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const optionalEmailSchema = z.union([
  z.literal(''),
  z.string().email('Ingresa un correo valido'),
])
const optionalPasswordSchema = z.union([
  z.literal(''),
  z.string().min(6, 'Minimo 6 caracteres'),
])

const clientFieldsSchema = z.object({
  identification: z.string().min(5, 'Minimo 5 caracteres'),
  firstName: z.string().min(2, 'Minimo 2 caracteres'),
  lastName: z.string().min(2, 'Minimo 2 caracteres'),
  clientType: z.enum(['MAYORISTA', 'MINORISTA']),
  phone: z.string().optional(),
  address: z.string().optional(),
  email: optionalEmailSchema,
  password: optionalPasswordSchema,
})

const createClientSchema = clientFieldsSchema.superRefine((values, context) => {
  const hasEmail = Boolean(values.email)
  const hasPassword = Boolean(values.password)

  if (hasEmail !== hasPassword) {
    context.addIssue({
      code: 'custom',
      path: [hasEmail ? 'password' : 'email'],
      message: 'Ingresa correo y contraseña para crear el acceso de la app.',
    })
  }
})

const clientTypeOptions = [
  { value: 'MAYORISTA', label: 'Mayorista' },
  { value: 'MINORISTA', label: 'Minorista' },
]

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
  createDescription: 'Registra un cliente con su informacion base y, si quieres, su acceso a la app.',
  editDescription: 'Edita datos del cliente y su acceso a la app.',
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
    {
      name: 'clientType',
      label: 'Tipo de cliente',
      type: 'select',
      placeholder: 'Selecciona un tipo',
      options: clientTypeOptions,
    },
    { name: 'phone', label: 'Telefono', placeholder: '3001234567' },
    {
      name: 'address',
      label: 'Direccion',
      placeholder: 'Calle 123 #45-67',
      type: 'textarea',
      rows: 3,
      fullWidth: true,
    },
    {
      name: 'email',
      label: 'Correo para la app (opcional)',
      placeholder: 'cliente@correo.com',
      autoComplete: 'email',
    },
    {
      name: 'password',
      label: 'Contraseña de la app (opcional)',
      type: 'password',
      placeholder: '******',
      autoComplete: 'new-password',
    },
  ],
  createSchema: createClientSchema,
  updateSchema: clientFieldsSchema,
  getDefaultValues: (_, record) => ({
    identification: record?.identification ?? '',
    firstName: record?.firstName ?? '',
    lastName: record?.lastName ?? '',
    clientType: record?.clientType ?? 'MINORISTA',
    phone: record?.phone ?? '',
    address: record?.address ?? '',
    email: record?.user?.username ?? '',
    password: '',
  }),
  prepareValues: (mode, values) => {
    const payload = { ...values }

    if (!payload.email) {
      delete payload.email
    }
    if (!payload.password) {
      delete payload.password
    }

    return payload
  },
  fetchRecords: ({ status, search, page, limit }) =>
    apiClient.get('/clientes', { estado: toApiStatus(status), q: search, page, limit }),
  createRecord: (payload) => apiClient.post('/clientes', payload),
  updateRecord: (id, payload) => apiClient.patch(`/clientes/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/clientes/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/clientes/${id}/reactivar`),
  searchResolver: (record) => [
    record.identification,
    `${record.firstName} ${record.lastName}`,
    formatClientType(record.clientType),
    record.phone,
    record.address,
    record.referralCode,
    record.user?.username,
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
          <p className="text-xs text-muted-foreground">
            {record.identification} · {formatClientType(record.clientType)}
          </p>
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
      key: 'appAccess',
      label: 'App',
      render: (record) => (
        <Badge variant={record.user?.isActive ? 'default' : 'secondary'}>
          {record.user ? 'Con acceso' : 'Sin acceso'}
        </Badge>
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
        { label: 'Tipo', value: formatClientType(record.clientType) },
        { label: 'Telefono', value: record.phone ?? 'Sin telefono' },
        { label: 'Direccion', value: record.address ?? 'Sin direccion' },
        { label: 'Acceso app', value: record.user?.username ?? 'Sin acceso' },
        { label: 'Estado', value: getRecordStatus(record) },
      ],
    },
    {
      label: 'Referidos',
      items: [
        { label: 'Codigo', value: record.referralCode ?? 'Sin generar' },
        { label: 'Nivel', value: formatNumber(record.referralLevel ?? 0) },
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
