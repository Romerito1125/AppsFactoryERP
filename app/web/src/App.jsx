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
