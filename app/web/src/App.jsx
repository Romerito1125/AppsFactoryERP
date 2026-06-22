import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppProviders } from '@/app/providers'
import { AdminLayout } from '@/layouts/admin-layout'

const DashboardPage = lazy(() =>
  import('@/modules/dashboard/page').then((module) => ({ default: module.DashboardPage })),
)
const UsersPage = lazy(() =>
  import('@/modules/users/page').then((module) => ({ default: module.UsersPage })),
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

function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<AdminLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/usuarios" element={<UsersPage />} />
              <Route path="/clientes" element={<ClientsPage />} />
              <Route path="/productos" element={<ProductsPage />} />
              <Route path="/inventario" element={<InventoryPage />} />
              <Route path="/precios-producto" element={<ProductPricesPage />} />
              <Route path="/cotizaciones" element={<QuotesPage />} />
              <Route path="/ofertas" element={<OffersPage />} />
              <Route path="/creditos" element={<CreditsPage />} />
              <Route path="/cuentas-bancarias" element={<BankAccountsPage />} />
              <Route path="/movimientos-bancarios" element={<BankMovementsPage />} />
              <Route path="/domicilios" element={<DeliveriesPage />} />
              <Route path="/referidos" element={<ReferralsPage />} />
              <Route path="/tipos-producto" element={<ProductTypesPage />} />
              <Route path="/proveedores" element={<ProvidersPage />} />
              <Route path="/etiquetas" element={<TagsPage />} />
              <Route path="/bodegas" element={<WarehousesPage />} />
              <Route path="/facturas" element={<InvoicesPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  )
}

export default App
