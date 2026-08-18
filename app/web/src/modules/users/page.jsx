import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import {
  formatDate,
  formatNumber,
  formatRole,
  getRecordStatus,
  getRecordStatusVariant,
  toApiStatus,
} from '@/lib/format'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const roleOptions = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'CAJERO', label: 'Cajero' },
  { value: 'VENDEDOR', label: 'Vendedor' },
  { value: 'BODEGA', label: 'Bodega' },
  { value: 'CONTADOR', label: 'Contador' },
]

const createSchema = z.object({
  clientId: z.number().int().nonnegative('Selecciona un cliente valido').optional(),
  warehouseId: z.number().int().positive().optional(),
  email: z.string().email('Ingresa un correo valido'),
  password: z.string().min(6, 'Minimo 6 caracteres'),
  role: z.enum(['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGA', 'CONTADOR']),
  isActive: z.boolean(),
})

const updateSchema = z.object({
  clientId: z.number().int().nonnegative('Selecciona un cliente valido').optional(),
  warehouseId: z.number().int().positive().optional(),
  email: z.string().email('Ingresa un correo valido'),
  password: z.string().optional(),
  role: z.enum(['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGA', 'CONTADOR']),
  isActive: z.boolean(),
})

function createUsersConfig(clients, warehouses) {
  const clientsMap = new Map(
    clients.map((client) => [client.id, `${client.firstName} ${client.lastName} · ${client.identification}`]),
  )

  return {
    key: 'usuarios',
    title: 'Usuarios del sistema',
    description:
      'Gestiona accesos internos por categoria operativa usando correo como credencial de ingreso.',
    singularLabel: 'Usuario',
    badgeLabel: 'Seguridad · Roles',
    createButtonLabel: 'Nuevo usuario',
    createTitle: 'Crear usuario',
    editTitle: 'Actualizar usuario',
    createDescription: 'Registra un nuevo acceso interno usando correo como inicio de sesion.',
    editDescription: 'Ajusta cliente asociado, correo, clave, rol operativo o estado del usuario.',
    submitCreateLabel: 'Crear usuario',
    submitEditLabel: 'Guardar cambios',
    tableTitle: 'Directorio de accesos',
    tableDescription: 'Vista centralizada de usuarios, categorias, cliente relacionado y disponibilidad.',
    searchPlaceholder: 'Buscar por correo, rol o cliente...',
    emptyTitle: 'No hay usuarios para mostrar',
    emptyDescription: 'Crea el primer usuario para empezar a operar el sistema.',
    archiveLoadingLabel: 'Desactivando usuario...',
    archiveSuccessLabel: 'Usuario desactivado',
    archiveConfirmationLabel:
      'El usuario dejara de estar operativo en el sistema. La accion se conserva en el historial.',
    reactivateLoadingLabel: 'Reactivando usuario...',
    reactivateSuccessLabel: 'Usuario reactivado',
    reactivateConfirmationLabel:
      'El usuario volvera a quedar disponible para operar en el administrador.',
    statusFilter: 'api',
    fields: [
      {
        name: 'clientId',
        label: 'Cliente asociado',
        type: 'select',
        valueType: 'number',
        placeholder: 'Interno sin cliente o selecciona uno',
        options: [
          { value: 0, label: 'Sin cliente · Usuario interno' },
          ...clients.map((client) => ({
            value: client.id,
            label: `${client.firstName} ${client.lastName} · ${client.identification}`,
          })),
        ],
      },
      {
        name: 'email',
        label: 'Correo',
        placeholder: 'admin@empresa.com',
        autoComplete: 'email',
      },
      {
        name: 'password',
        label: 'Contraseña',
        type: 'password',
        placeholder: '******',
        autoComplete: 'new-password',
        helpText: 'En edicion puedes dejarla vacia para conservar la actual.',
      },
      {
        name: 'role',
        label: 'Rol',
        type: 'select',
        placeholder: 'Selecciona un rol',
        options: roleOptions,
      },
      {
        name: 'warehouseId',
        label: 'Bodega asignada',
        type: 'select',
        valueType: 'number',
        placeholder: 'Sin bodega asignada',
        options: [
          { value: 0, label: 'Sin bodega asignada' },
          ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.location })),
        ],
        helpText: 'Para usuarios Bodega, limita el POS a esta ubicación.',
      },
      {
        name: 'isActive',
        label: 'Estado activo',
        type: 'switch',
        description: 'Permite acceso operativo al usuario.',
      },
    ],
    createSchema,
    updateSchema,
    getDefaultValues: (_, record) => ({
      clientId: record?.clientId ?? 0,
      warehouseId: record?.warehouseId ?? 0,
      email: record?.username ?? '',
      password: '',
      role: record?.role ?? 'CAJERO',
      isActive: record?.isActive ?? true,
    }),
    prepareValues: (mode, values) => {
      const payload = { ...values }

      if (!payload.clientId) {
        payload.clientId = null
      }
      if (!payload.warehouseId) {
        payload.warehouseId = null
      }

      if (mode === 'edit' && !payload.password) {
        delete payload.password
      }

      return payload
    },
    fetchRecords: ({ status, search, page, limit }) =>
      apiClient.get('/usuarios', { estado: toApiStatus(status), q: search, page, limit }),
    createRecord: (payload) => apiClient.post('/usuarios', payload),
    updateRecord: (id, payload) => apiClient.patch(`/usuarios/${id}`, payload),
    archiveRecord: (id) => apiClient.delete(`/usuarios/${id}`),
    reactivateRecord: (id) => apiClient.patch(`/usuarios/${id}`, { isActive: true }),
    searchResolver: (record) => [
        record.username,
        formatRole(record.role),
      clientsMap.get(record.clientId),
      warehouses.find((warehouse) => warehouse.id === record.warehouseId)?.location,
      record.clientId ? null : 'interno sin cliente',
      String(record.clientId),
    ],
    getSummaryCards: ({ rawRecords }) => {
      const activeCount = rawRecords.filter((record) => record.isActive).length
      const adminCount = rawRecords.filter((record) => record.role === 'ADMIN').length
      const cashierCount = rawRecords.filter((record) => record.role === 'CAJERO').length

      return [
        {
          label: 'Total de usuarios',
          value: formatNumber(rawRecords.length),
          help: 'Todos los accesos registrados en la plataforma.',
        },
        {
          label: 'Usuarios activos',
          value: formatNumber(activeCount),
          help: 'Credenciales actualmente disponibles para operar.',
        },
        {
          label: 'Administradores',
          value: formatNumber(adminCount),
          help: 'Usuarios con mayor capacidad de administracion.',
        },
        {
          label: 'Cajeros',
          value: formatNumber(cashierCount),
          help: 'Usuarios habilitados para operar el POS y ventas de mostrador.',
        },
      ]
    },
    columns: [
      {
        key: 'email',
        label: 'Correo',
        render: (record) => (
          <div>
            <p className="font-medium text-foreground">{record.username}</p>
            <p className="text-xs text-muted-foreground">ID #{record.id}</p>
          </div>
        ),
      },
      {
        key: 'client',
        label: 'Cliente asociado',
        render: (record) => clientsMap.get(record.clientId) ?? (record.clientId ? `Cliente #${record.clientId}` : 'Interno sin cliente'),
      },
      {
        key: 'role',
        label: 'Rol',
        render: (record) => <Badge variant="outline">{formatRole(record.role)}</Badge>,
      },
      {
        key: 'warehouse',
        label: 'Bodega',
        render: (record) => warehouses.find((warehouse) => warehouse.id === record.warehouseId)?.location ?? 'Sin bodega',
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
        label: 'Creado',
        render: (record) => formatDate(record.createdAt),
      },
    ],
    getDetailTitle: (record) => record.username,
    getDetailDescription: (record) => `Perfil ${formatRole(record.role)} · ID #${record.id}`,
    getDetailSections: (record) => [
      {
        label: 'Informacion general',
        items: [
          { label: 'Correo', value: record.username },
          {
            label: 'Cliente',
            value: clientsMap.get(record.clientId) ?? (record.clientId ? `Cliente #${record.clientId}` : 'Interno sin cliente'),
          },
          { label: 'Rol', value: formatRole(record.role) },
          { label: 'Bodega asignada', value: warehouses.find((warehouse) => warehouse.id === record.warehouseId)?.location ?? 'Sin bodega' },
          { label: 'Estado', value: getRecordStatus(record) },
        ],
      },
      {
        label: 'Trazabilidad',
        items: [
          { label: 'Registro', value: formatDate(record.createdAt) },
          { label: 'Actualizado', value: formatDate(record.updatedAt) },
          { label: 'Eliminado', value: record.deletedAt ? formatDate(record.deletedAt) : 'No' },
        ],
      },
    ],
  }
}

export function UsersPage() {
  const clientsQuery = useQuery({
    queryKey: ['usuarios-clientes-lookup'],
    queryFn: () => apiClient.getAllPages('/clientes'),
  })
  const warehousesQuery = useQuery({
    queryKey: ['usuarios-bodegas-lookup'],
    queryFn: () => apiClient.getAllPages('/bodegas'),
  })

  return (
    <CrudModulePage
      config={createUsersConfig(clientsQuery.data ?? [], warehousesQuery.data ?? [])}
      lookupsLoading={clientsQuery.isLoading || warehousesQuery.isLoading}
    />
  )
}
