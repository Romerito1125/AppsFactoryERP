import {
  Box,
  FileText,
  LayoutDashboard,
  ShieldUser,
  Users,
  Warehouse,
} from 'lucide-react'

export const navigationItems = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    description: 'Resumen operativo',
    icon: LayoutDashboard,
  },
  {
    path: '/usuarios',
    label: 'Usuarios',
    description: 'Accesos y roles',
    icon: ShieldUser,
  },
  {
    path: '/clientes',
    label: 'Clientes',
    description: 'Base comercial',
    icon: Users,
  },
  {
    path: '/productos',
    label: 'Productos',
    description: 'Catalogo e inventario',
    icon: Box,
  },
  {
    path: '/bodegas',
    label: 'Bodegas',
    description: 'Ubicaciones fisicas',
    icon: Warehouse,
  },
  {
    path: '/facturas',
    label: 'Facturas',
    description: 'Ventas y trazabilidad',
    icon: FileText,
  },
]

export function getNavigationItem(pathname) {
  return (
    navigationItems.find((item) => pathname.startsWith(item.path)) ??
    navigationItems[0]
  )
}
