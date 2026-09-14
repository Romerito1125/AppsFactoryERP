import { useCallback, useEffect, useState } from "react";

import { ClassicMenuBar } from "@/components/desktop/classic-menu-bar";
import { LoginDialog } from "@/components/desktop/login-dialog";
import { ShortcutToolbar } from "@/components/desktop/shortcut-toolbar";
import { SystemStatusbar } from "@/components/desktop/system-statusbar";
import { WindowTitlebar } from "@/components/desktop/window-titlebar";
import { getStoredSession, storeSession } from "@/lib/api-client";
import { ClientsWindow } from "@/modules/clients/clients-window";
import { CatalogWindow } from "@/modules/catalogs/catalog-window";
import { ProductsWindow } from "@/modules/products/products-window";
import { ProvidersWindow } from "@/modules/providers/providers-window";
import { RetentionsWindow } from "@/modules/retentions/retentions-window";
import { AccountsPayableWindow } from "@/modules/payables/accounts-payable-window";
import { AccountsReceivableWindow } from "@/modules/receivables/accounts-receivable-window";
import { BanksWindow } from "@/modules/banks/banks-window";
import { PurchasesWindow } from "@/modules/purchases/purchases-window";
import { SalesWindow } from "@/modules/sales/sales-window";
import { UsersWindow } from "@/modules/users/users-window";
import { defaultPermissionCodesByRole } from "@/app/permissions";

const permissionsByWindow = {
  clients: "CLIENTS_VIEW",
  providers: "PROVIDERS_VIEW",
  products: "PRODUCTS_VIEW",
  "product-types": "PRODUCTS_VIEW",
  warehouses: "PRODUCTS_VIEW",
  retentions: "RETENTIONS_VIEW",
  users: "USERS_MANAGE",
  payables: "PAYABLES_VIEW",
  receivables: "RECEIVABLES_VIEW",
  purchases: "PURCHASES_VIEW",
  banks: "BANKS_VIEW",
};

function App() {
  const [activeModule, setActiveModule] = useState("administrative");
  const [activeWindow, setActiveWindow] = useState(null);
  const [salesView, setSalesView] = useState("billing");
  const [session, setSession] = useState(() => getStoredSession());
  const [loginOpen, setLoginOpen] = useState(() => !getStoredSession());

  const canAccess = useCallback(
    (permission) => {
      if (!session) return false;
      if (session.role === "ADMIN") return true;
      const permissions =
        session.permissions ?? defaultPermissionCodesByRole[session.role] ?? [];
      return permissions.includes(permission);
    },
    [session],
  );

  const openLogin = useCallback(() => setLoginOpen(true), []);
  const openWindow = useCallback(
    (windowName) => {
      if (!session) {
        setLoginOpen(true);
        return;
      }
      if (
        permissionsByWindow[windowName] &&
        !canAccess(permissionsByWindow[windowName])
      )
        return;
      setActiveModule("administrative");
      setActiveWindow(windowName);
    },
    [canAccess, session],
  );

  const switchModule = useCallback(
    (moduleName) => {
      const modulePermission =
        moduleName === "sales"
          ? "SALES_CREATE"
          : moduleName === "purchases"
            ? "PURCHASES_VIEW"
            : moduleName === "banks"
              ? "BANKS_VIEW"
              : null;
      if (modulePermission && !canAccess(modulePermission)) return;
      setActiveModule(moduleName);
      setActiveWindow(null);
    },
    [canAccess],
  );

  const openSalesView = useCallback(
    (view = "billing") => {
      if (!session) {
        setLoginOpen(true);
        return;
      }
      if (!canAccess("SALES_CREATE")) return;
      setActiveModule("sales");
      setSalesView(view);
      setActiveWindow(`sales-${view}`);
    },
    [canAccess, session],
  );

  const openPurchasesView = useCallback(
    (view = "purchases") => {
      if (!session) {
        setLoginOpen(true);
        return;
      }
      if (!canAccess("PURCHASES_VIEW")) return;
      setActiveModule("purchases");
      setActiveWindow(`purchases-${view}`);
    },
    [canAccess, session],
  );

  const openBanksView = useCallback(
    (view = "home") => {
      if (!session) {
        setLoginOpen(true);
        return;
      }
      if (!canAccess("BANKS_VIEW")) return;
      setActiveModule("banks");
      setActiveWindow(`banks-${view}`);
    },
    [canAccess, session],
  );

  useEffect(() => {
    function handleSessionUpdated(event) {
      const nextSession = event.detail ?? getStoredSession();
      setSession(nextSession);
      if (!nextSession) {
        setActiveWindow(null);
        setActiveModule("administrative");
        setLoginOpen(true);
      }
    }
    window.addEventListener("auth:session-updated", handleSessionUpdated);
    return () =>
      window.removeEventListener("auth:session-updated", handleSessionUpdated);
  }, []);

  function logout() {
    storeSession(null);
    setSession(null);
    setActiveWindow(null);
    setActiveModule("administrative");
    setLoginOpen(true);
  }

  return (
    <div className="classic-app">
      <WindowTitlebar activeModule={activeModule} />
      <ClassicMenuBar
        onOpenClients={() => openWindow("clients")}
        onOpenProducts={() => openWindow("products")}
        onOpenProductTypes={() => openWindow("product-types")}
        onOpenWarehouses={() => openWindow("warehouses")}
        onOpenProviders={() => openWindow("providers")}
        onOpenRetentions={() => openWindow("retentions")}
        onOpenUsers={() => openWindow("users")}
        onOpenPayables={() => openWindow("payables")}
        onOpenReceivables={() => openWindow("receivables")}
        onOpenSalesView={openSalesView}
        onOpenPurchasesView={openPurchasesView}
        onOpenBanksView={openBanksView}
        onSwitchModule={switchModule}
        activeModule={activeModule}
        canAccess={canAccess}
      />
      <ShortcutToolbar
        onOpenClients={() => openWindow("clients")}
        onOpenProducts={() => openWindow("products")}
        onOpenProviders={() => openWindow("providers")}
        onOpenPayables={() => openWindow("payables")}
        onOpenReceivables={() => openWindow("receivables")}
        onOpenSalesView={openSalesView}
        onOpenPurchasesView={openPurchasesView}
        onOpenBanksView={openBanksView}
        activeModule={activeModule}
        canAccess={canAccess}
      />

      <main
        className="empty-workspace"
        aria-label={`Área de trabajo del módulo ${moduleLabel(activeModule)}`}
      />

      <SystemStatusbar
        session={session}
        onLogin={openLogin}
        onLogout={logout}
      />
      {activeWindow && (
        <div className="window-layer" aria-label="Ventanas abiertas">
          {activeWindow === "clients" && (
            <ClientsWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
              canAccess={canAccess}
            />
          )}
          {activeWindow === "providers" && (
            <ProvidersWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
              canAccess={canAccess}
            />
          )}
          {activeWindow === "products" && (
            <ProductsWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
              canAccess={canAccess}
            />
          )}
          {activeWindow === "product-types" && (
            <CatalogWindow
              catalog="product-types"
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
              canAccess={canAccess}
            />
          )}
          {activeWindow === "warehouses" && (
            <CatalogWindow
              catalog="warehouses"
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
              canAccess={canAccess}
            />
          )}
          {activeWindow === "retentions" && (
            <RetentionsWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
              canAccess={canAccess}
            />
          )}
          {activeWindow === "payables" && (
            <AccountsPayableWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
              canAccess={canAccess}
            />
          )}
          {activeWindow === "receivables" && (
            <AccountsReceivableWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
              canAccess={canAccess}
            />
          )}
          {activeWindow?.startsWith("purchases-") && (
            <PurchasesWindow
              key={activeWindow}
              initialView={activeWindow.replace("purchases-", "")}
              session={session}
              onClose={() => setActiveWindow(null)}
              onOpenView={openPurchasesView}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow?.startsWith("banks-") && (
            <BanksWindow
              key={activeWindow}
              initialView={activeWindow.replace("banks-", "")}
              session={session}
              onClose={() => setActiveWindow(null)}
              onOpenView={openBanksView}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "users" && (
            <UsersWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow?.startsWith("sales-") && (
            <SalesWindow
              key={activeWindow}
              initialView={salesView}
              session={session}
              onClose={() => setActiveWindow(null)}
              onOpenView={openSalesView}
              onRequestLogin={openLogin}
            />
          )}
        </div>
      )}
      {loginOpen && (
        <LoginDialog
          required={!session}
          onClose={() => setLoginOpen(false)}
          onLoggedIn={() => setLoginOpen(false)}
        />
      )}
    </div>
  );
}

function moduleLabel(moduleName) {
  return (
    {
      administrative: "administrativo",
      sales: "de ventas",
      purchases: "de compras",
      banks: "de bancos",
    }[moduleName] ?? "administrativo"
  );
}

export default App;
