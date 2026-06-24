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
        path: '/referidos',
        label: 'Referidos',
        description: 'Red comercial',
        icon: Link2,
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
      },
      {
        path: '/tipos-producto',
        label: 'Tipos',
        description: 'Clasificacion base',
        icon: Package,
      },
      {
        path: '/proveedores',
        label: 'Proveedores',
        description: 'Abastecimiento y aliados',
        icon: Building2,
      },
      {
        path: '/etiquetas',
        label: 'Etiquetas',
        description: 'Segmentacion comercial',
        icon: Tag,
      },
      {
        path: '/precios-producto',
        label: 'Precios',
        description: 'Historico y default',
        icon: ReceiptText,
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
      {
        path: '/cotizaciones',
        label: 'Cotizaciones',
        description: 'Propuestas comerciales',
        icon: Files,
      },
      {
        path: '/ofertas',
        label: 'Ofertas',
        description: 'Descuentos y reglas',
        icon: Gift,
      },
      {
        path: '/domicilios',
        label: 'Domicilios',
        description: 'Logistica de entrega',
        icon: Bike,
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
      },
      {
        path: '/cuentas-bancarias',
        label: 'Cuentas',
        description: 'Bancos y saldos',
        icon: Landmark,
      },
      {
        path: '/movimientos-bancarios',
        label: 'Movimientos',
        description: 'Tesoreria operativa',
        icon: ArrowLeftRight,
      },
      {
        path: '/reportes',
        label: 'Reportes',
        description: 'IVA, exogenas y analitica',
        icon: BarChart3,
      },
    ],
  },
]

export const navigationItems = navigationGroups.flatMap((group) => group.items)

export function getNavigationItem(pathname) {
  return navigationItems.find((item) => pathname.startsWith(item.path)) ?? navigationItems[0]
}
