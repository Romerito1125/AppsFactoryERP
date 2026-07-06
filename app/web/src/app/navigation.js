import {
  ArrowLeftRight,
  BarChart3,
  Bike,
  Box,
  Building2,
  CreditCard,
  FileText,
  Files,
  Gift,
  Landmark,
  Layers3,
  LayoutDashboard,
  Link2,
  Package,
  ReceiptText,
  ShieldUser,
  Smartphone,
  Tag,
  Users,
  Warehouse,
} from 'lucide-react'

export const navigationGroups = [
  {
    label: 'General',
    items: [
      {
        path: '/dashboard',
        label: 'Dashboard',
        description: 'Resumen operativo',
        icon: LayoutDashboard,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/usuarios',
        label: 'Usuarios',
        description: 'Accesos y roles',
        icon: ShieldUser,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/clientes',
        label: 'Clientes',
        description: 'Base comercial',
        icon: Users,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/referidos',
        label: 'Referidos',
        description: 'Red comercial',
        icon: Link2,
        allowedRoles: ['ADMIN'],
      },
    ],
  },
  {
    label: 'Catalogo',
    items: [
      {
        path: '/productos',
        label: 'Productos',
        description: 'Catalogo e inventario',
        icon: Box,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/codigos-barras',
        label: 'Codigos',
        description: 'Multiples codigos por producto',
        icon: Tag,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/tipos-producto',
        label: 'Tipos',
        description: 'Clasificacion base',
        icon: Package,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/proveedores',
        label: 'Proveedores',
        description: 'Abastecimiento y aliados',
        icon: Building2,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/etiquetas',
        label: 'Etiquetas',
        description: 'Segmentacion comercial',
        icon: Tag,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/precios-producto',
        label: 'Precios',
        description: 'Historico y default',
        icon: ReceiptText,
        allowedRoles: ['ADMIN'],
      },
    ],
  },
  {
    label: 'Operacion',
    items: [
      {
        path: '/inventario',
        label: 'Inventario',
        description: 'Stock y movimientos',
        icon: Layers3,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/bodegas',
        label: 'Bodegas',
        description: 'Ubicaciones fisicas',
        icon: Warehouse,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/facturas',
        label: 'Facturas',
        description: 'Ventas y trazabilidad',
        icon: FileText,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/cotizaciones',
        label: 'Cotizaciones',
        description: 'Propuestas comerciales',
        icon: Files,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/ofertas',
        label: 'Ofertas',
        description: 'Descuentos y reglas',
        icon: Gift,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/domicilios',
        label: 'Domicilios',
        description: 'Logistica de entrega',
        icon: Bike,
        allowedRoles: ['ADMIN'],
      },
      {
        path: '/pedidos-app',
        label: 'Pedidos app',
        description: 'Checkout movil y seguimiento',
        icon: Smartphone,
        allowedRoles: ['ADMIN'],
      },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      {
        path: '/creditos',
        label: 'Creditos',
        description: 'Cuentas por cobrar',
        icon: CreditCard,
        allowedRoles: ['ADMIN', 'CONTADOR'],
      },
      {
        path: '/cuentas-bancarias',
        label: 'Cuentas',
        description: 'Bancos y saldos',
        icon: Landmark,
        allowedRoles: ['ADMIN', 'CONTADOR'],
      },
      {
        path: '/movimientos-bancarios',
        label: 'Movimientos',
        description: 'Tesoreria operativa',
        icon: ArrowLeftRight,
        allowedRoles: ['ADMIN', 'CONTADOR'],
      },
      {
        path: '/reportes',
        label: 'Reportes',
        description: 'IVA, exogenas y analitica',
        icon: BarChart3,
        allowedRoles: ['ADMIN', 'CONTADOR'],
      },
    ],
  },
]

export const navigationItems = navigationGroups.flatMap((group) => group.items)

export function getNavigationGroupsForRole(role) {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.allowedRoles || item.allowedRoles.includes(role)),
    }))
    .filter((group) => group.items.length > 0)
}

export function getNavigationItem(pathname) {
  return navigationItems.find((item) => pathname.startsWith(item.path)) ?? navigationItems[0]
}
