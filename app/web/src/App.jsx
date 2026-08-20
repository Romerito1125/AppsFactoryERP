import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { defaultRouteForRole, useAuth } from '@/auth/auth-context'
import { ProtectedRoute, PublicOnlyRoute } from '@/auth/route-guard'
import { AppProviders } from '@/app/providers'
import { AdminLayout } from '@/layouts/admin-layout'

const DashboardPage = lazy(() =>
  import('@/modules/dashboard/page').then((module) => ({ default: module.DashboardPage })),
)
const UsersPage = lazy(() =>
  import('@/modules/users/page').then((module) => ({ default: module.UsersPage })),
)
const AuditLogPage = lazy(() =>
  import('@/modules/audit-log/page').then((module) => ({ default: module.AuditLogPage })),
)
const ClientsPage = lazy(() =>
  import('@/modules/clients/page').then((module) => ({ default: module.ClientsPage })),
)
const ProductsPage = lazy(() =>
  import('@/modules/products/page').then((module) => ({ default: module.ProductsPage })),
)
const InventoryPage = lazy(() =>
  import('@/modules/inventory/page').then((module) => ({ default: module.InventoryPage })),
)
const ProductPricesPage = lazy(() =>
  import('@/modules/product-prices/page').then((module) => ({ default: module.ProductPricesPage })),
)
const ProductBarcodesPage = lazy(() =>
  import('@/modules/product-barcodes/page').then((module) => ({ default: module.ProductBarcodesPage })),
)
const QuotesPage = lazy(() =>
  import('@/modules/quotes/page').then((module) => ({ default: module.QuotesPage })),
)
const OffersPage = lazy(() =>
  import('@/modules/offers/page').then((module) => ({ default: module.OffersPage })),
)
const CreditsPage = lazy(() =>
  import('@/modules/credits/page').then((module) => ({ default: module.CreditsPage })),
)
const BankAccountsPage = lazy(() =>
  import('@/modules/bank-accounts/page').then((module) => ({ default: module.BankAccountsPage })),
)
const BankMovementsPage = lazy(() =>
  import('@/modules/bank-movements/page').then((module) => ({ default: module.BankMovementsPage })),
)
const DeliveriesPage = lazy(() =>
  import('@/modules/deliveries/page').then((module) => ({ default: module.DeliveriesPage })),
)
const AppOrdersPage = lazy(() =>
  import('@/modules/app-orders/page').then((module) => ({ default: module.AppOrdersPage })),
)
const ReferralsPage = lazy(() =>
  import('@/modules/referrals/page').then((module) => ({ default: module.ReferralsPage })),
)
const ProductTypesPage = lazy(() =>
  import('@/modules/product-types/page').then((module) => ({ default: module.ProductTypesPage })),
)
const ProvidersPage = lazy(() =>
  import('@/modules/providers/page').then((module) => ({ default: module.ProvidersPage })),
)
const TagsPage = lazy(() =>
  import('@/modules/tags/page').then((module) => ({ default: module.TagsPage })),
)
const WarehousesPage = lazy(() =>
  import('@/modules/warehouses/page').then((module) => ({ default: module.WarehousesPage })),
)
const InvoicesPage = lazy(() =>
  import('@/modules/invoices/page').then((module) => ({ default: module.InvoicesPage })),
)
const PurchasesPage = lazy(() =>
  import('@/modules/purchases/page').then((module) => ({ default: module.PurchasesPage })),
)
const ReportsPage = lazy(() =>
  import('@/modules/reports/page').then((module) => ({ default: module.ReportsPage })),
)
const LoginPage = lazy(() =>
  import('@/modules/auth/login-page').then((module) => ({ default: module.LoginPage })),
)
const PosPage = lazy(() =>
  import('@/modules/pos/page').then((module) => ({ default: module.PosPage })),
)

function RouteFallback() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-border/70 bg-card/80" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-2xl border border-border/70 bg-card/80" />
    </div>
  )
}

function RoleHomeRedirect() {
  const { user } = useAuth()

  return <Navigate to={defaultRouteForRole(user.role)} replace />
}

function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}> 
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eff7ff,transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,250,1))] px-4 py-8 dark:bg-[radial-gradient(circle_at_top,#132235,transparent_35%),linear-gradient(180deg,rgba(12,18,28,0.96),rgba(8,12,20,1))] md:px-6 md:py-10">
                    <LoginPage />
                  </div>
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/pos"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR', 'CONTADOR']}>
                  <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eff7ff,transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,250,1))] px-4 py-6 dark:bg-[radial-gradient(circle_at_top,#132235,transparent_35%),linear-gradient(180deg,rgba(12,18,28,0.96),rgba(8,12,20,1))] md:px-6 md:py-8">
                    <PosPage />
                  </div>
                </ProtectedRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'CONTADOR', 'BODEGA']}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<RoleHomeRedirect />} />
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['ADMIN']}><DashboardPage /></ProtectedRoute>} />
              <Route path="/usuarios" element={<ProtectedRoute allowedRoles={['ADMIN']}><UsersPage /></ProtectedRoute>} />
              <Route path="/auditoria" element={<ProtectedRoute allowedRoles={['ADMIN']}><AuditLogPage /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute allowedRoles={['ADMIN']}><ClientsPage /></ProtectedRoute>} />
              <Route path="/productos" element={<ProtectedRoute allowedRoles={['ADMIN']}><ProductsPage /></ProtectedRoute>} />
              <Route path="/codigos-barras" element={<ProtectedRoute allowedRoles={['ADMIN']}><ProductBarcodesPage /></ProtectedRoute>} />
              <Route path="/inventario" element={<ProtectedRoute allowedRoles={['ADMIN']}><InventoryPage /></ProtectedRoute>} />
              <Route path="/precios-producto" element={<ProtectedRoute allowedRoles={['ADMIN']}><ProductPricesPage /></ProtectedRoute>} />
              <Route path="/cotizaciones" element={<ProtectedRoute allowedRoles={['ADMIN']}><QuotesPage /></ProtectedRoute>} />
              <Route path="/ofertas" element={<ProtectedRoute allowedRoles={['ADMIN']}><OffersPage /></ProtectedRoute>} />
              <Route path="/creditos" element={<ProtectedRoute allowedRoles={['ADMIN', 'CONTADOR']}><CreditsPage /></ProtectedRoute>} />
              <Route path="/cuentas-bancarias" element={<ProtectedRoute allowedRoles={['ADMIN', 'CONTADOR']}><BankAccountsPage /></ProtectedRoute>} />
              <Route path="/movimientos-bancarios" element={<ProtectedRoute allowedRoles={['ADMIN', 'CONTADOR']}><BankMovementsPage /></ProtectedRoute>} />
              <Route path="/domicilios" element={<ProtectedRoute allowedRoles={['ADMIN']}><DeliveriesPage /></ProtectedRoute>} />
              <Route path="/pedidos-app" element={<ProtectedRoute allowedRoles={['ADMIN']}><AppOrdersPage /></ProtectedRoute>} />
              <Route path="/referidos" element={<ProtectedRoute allowedRoles={['ADMIN']}><ReferralsPage /></ProtectedRoute>} />
              <Route path="/tipos-producto" element={<ProtectedRoute allowedRoles={['ADMIN']}><ProductTypesPage /></ProtectedRoute>} />
              <Route path="/proveedores" element={<ProtectedRoute allowedRoles={['ADMIN']}><ProvidersPage /></ProtectedRoute>} />
              <Route path="/etiquetas" element={<ProtectedRoute allowedRoles={['ADMIN']}><TagsPage /></ProtectedRoute>} />
              <Route path="/bodegas" element={<ProtectedRoute allowedRoles={['ADMIN']}><WarehousesPage /></ProtectedRoute>} />
              <Route path="/facturas" element={<ProtectedRoute allowedRoles={['ADMIN']}><InvoicesPage /></ProtectedRoute>} />
              <Route path="/compras" element={<ProtectedRoute allowedRoles={['ADMIN', 'BODEGA']}><PurchasesPage /></ProtectedRoute>} />
              <Route path="/reportes" element={<ProtectedRoute allowedRoles={['ADMIN', 'CONTADOR']}><ReportsPage /></ProtectedRoute>} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  )
}

export default App
