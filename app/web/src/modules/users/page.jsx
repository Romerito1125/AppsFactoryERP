import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import {
  formatDate,
  formatNumber,
  formatRole,
  getRecordStatus,
  getRecordStatusVariant,
} from '@/lib/format'
import { CrudModulePage } from '@/modules/shared/crud-module-page'

const roleOptions = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'VENDEDOR', label: 'Vendedor' },
  { value: 'BODEGA', label: 'Bodega' },
  { value: 'CONTADOR', label: 'Contador' },
]

const createSchema = z.object({
  username: z.string().min(3, 'Minimo 3 caracteres'),
  password: z.string().min(6, 'Minimo 6 caracteres'),
  role: z.enum(['ADMIN', 'VENDEDOR', 'BODEGA', 'CONTADOR']),
  isActive: z.boolean(),
})

const updateSchema = z.object({
  username: z.string().min(3, 'Minimo 3 caracteres'),
  password: z.string().optional(),
  role: z.enum(['ADMIN', 'VENDEDOR', 'BODEGA', 'CONTADOR']),
  isActive: z.boolean(),
})

const usersConfig = {
  key: 'usuarios',
  title: 'Usuarios del sistema',
  description:
    'Gestiona los accesos del equipo con una estructura lista para crecer a permisos y autenticacion.',
  singularLabel: 'Usuario',
  badgeLabel: 'Seguridad · Roles',
  createButtonLabel: 'Nuevo usuario',
  createTitle: 'Crear usuario',
  editTitle: 'Actualizar usuario',
  createDescription: 'Registra un nuevo acceso interno para el administrador web.',
  editDescription: 'Ajusta credenciales, rol operativo o estado del usuario.',
  submitCreateLabel: 'Crear usuario',
  submitEditLabel: 'Guardar cambios',
  tableTitle: 'Directorio de accesos',
  tableDescription: 'Vista centralizada de usuarios, roles y disponibilidad.',
  searchPlaceholder: 'Buscar por username o rol...',
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
  statusFilter: 'local',
  fields: [
    {
      name: 'username',
      label: 'Username',
      placeholder: 'admin-general',
      autoComplete: 'username',
    },
    {
      name: 'password',
      label: 'Contrasena',
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
      name: 'isActive',
      label: 'Estado activo',
      type: 'switch',
      description: 'Permite acceso operativo al usuario.',
    },
  ],
  createSchema,
  updateSchema,
  getDefaultValues: (_, record) => ({
    username: record?.username ?? '',
    password: '',
    role: record?.role ?? 'VENDEDOR',
    isActive: record?.isActive ?? true,
  }),
  prepareValues: (mode, values) => {
    const payload = { ...values }

    if (mode === 'edit' && !payload.password) {
      delete payload.password
    }

    return payload
  },
  fetchRecords: () => apiClient.get('/usuarios'),
  createRecord: (payload) => apiClient.post('/usuarios', payload),
  updateRecord: (id, payload) => apiClient.patch(`/usuarios/${id}`, payload),
  archiveRecord: (id) => apiClient.delete(`/usuarios/${id}`),
  reactivateRecord: (id) => apiClient.patch(`/usuarios/${id}`, { isActive: true }),
  searchResolver: (record) => [record.username, formatRole(record.role)],
  getSummaryCards: ({ rawRecords }) => {
    const activeCount = rawRecords.filter((record) => record.isActive).length
    const adminCount = rawRecords.filter((record) => record.role === 'ADMIN').length

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
        label: 'Usuarios inactivos',
        value: formatNumber(rawRecords.length - activeCount),
        help: 'Accesos desactivados pero conservados en historial.',
      },
    ]
  },
  columns: [
    {
      key: 'username',
      label: 'Usuario',
      render: (record) => (
        <div>
          <p className="font-medium text-foreground">{record.username}</p>
          <p className="text-xs text-muted-foreground">ID #{record.id}</p>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Rol',
      render: (record) => <Badge variant="outline">{formatRole(record.role)}</Badge>,
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
        { label: 'Username', value: record.username },
        { label: 'Rol', value: formatRole(record.role) },
        { label: 'Estado', value: getRecordStatus(record) },
        { label: 'Registro', value: formatDate(record.createdAt) },
      ],
    },
    {
      label: 'Trazabilidad',
      items: [
        { label: 'Actualizado', value: formatDate(record.updatedAt) },
        { label: 'Eliminado', value: record.deletedAt ? formatDate(record.deletedAt) : 'No' },
      ],
    },
  ],
}

export function UsersPage() {
  return <CrudModulePage config={usersConfig} />
}
