import { useCallback, useEffect, useState } from "react";

import { ClassicMenuBar } from "@/components/desktop/classic-menu-bar";
import { LoginDialog } from "@/components/desktop/login-dialog";
import {
  NotificationBell,
  NotificationsWindow,
} from "@/components/desktop/notification-center";
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
import { AuditLogWindow } from "@/modules/audit-log/audit-log-window";
import { BanksWindow } from "@/modules/banks/banks-window";
import { PurchasesWindow } from "@/modules/purchases/purchases-window";
import { InventoryTransfersWindow } from "@/modules/inventory/inventory-transfers-window";
import { SalesWindow } from "@/modules/sales/sales-window";
import { UsersWindow } from "@/modules/users/users-window";
import { WarehouseAdminPage } from "@/modules/warehouse-admin/warehouse-admin-page";
import { DeliveryAgentPage } from "@/modules/delivery-agent/delivery-agent-page";
import { OffersWindow } from "@/modules/offers/offers-window";
import { ReferralsWindow } from "@/modules/referrals/referrals-window";
import { ReportsWindow } from "@/modules/reports/reports-window";
import { defaultPermissionCodesByRole } from "@/app/permissions";

const permissionsByWindow = {
  clients: "CLIENTS_VIEW",
  providers: "PROVIDERS_VIEW",
  products: "PRODUCTS_VIEW",
  "product-types": "PRODUCTS_VIEW",
  warehouses: "PRODUCTS_VIEW",
  "inventory-transfers": "INVENTORY_EDIT",
  retentions: "RETENTIONS_VIEW",
  users: "USERS_MANAGE",
  "audit-log": "USERS_MANAGE",
  offers: "OFFERS_VIEW",
  referrals: "REFERRALS_VIEW",
  "reports-library": "REPORTS_VIEW",
  payables: "PAYABLES_VIEW",
  receivables: "RECEIVABLES_VIEW",
  purchases: "PURCHASES_VIEW",
  banks: "BANKS_VIEW",
};

const ACTIVE_MODULE_STORAGE_KEY = "mmm-active-module";

function readStoredActiveModule() {
  try {
    const storedModule = localStorage.getItem(ACTIVE_MODULE_STORAGE_KEY);
    return storedModule === "sales" ||
      storedModule === "purchases" ||
      storedModule === "banks" ||
      storedModule === "administrative"
      ? storedModule
      : "administrative";
  } catch {
    return "administrative";
  }
}

function App() {
  const [activeModule, setActiveModule] = useState(readStoredActiveModule);
  const [activeWindow, setActiveWindow] = useState(null);
  const [salesView, setSalesView] = useState("billing");
  const [salesDocumentId, setSalesDocumentId] = useState(null);
  const [session, setSession] = useState(() => getStoredSession());
  const [loginOpen, setLoginOpen] = useState(() => !getStoredSession());
  const [pendingSalesView, setPendingSalesView] = useState(null);
  const [pendingPosOpen, setPendingPosOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(
    () => new URLSearchParams(window.location.search).get("notifications") === "1",
  );

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

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_MODULE_STORAGE_KEY, activeModule);
    } catch {
      // El sistema puede continuar aunque el navegador bloquee localStorage.
    }
  }, [activeModule]);

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
      const normalizedView = view === "invoices" ? "billing" : view;
      if (!session) {
        setPendingSalesView(normalizedView);
        setLoginOpen(true);
        return;
      }
      if (!canAccess("SALES_CREATE")) return;
      setActiveModule("sales");
      setSalesDocumentId(null);
      setSalesView(normalizedView);
      setActiveWindow(`sales-${normalizedView}`);
    },
    [canAccess, session],
  );

  const openPos = useCallback(() => {
    if (!session) {
      setPendingPosOpen(true);
      setLoginOpen(true);
      return;
    }
    window.location.assign("/pos?pos=1");
  }, [session]);

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

  const openNotificationCenter = useCallback(() => {
    if (!session) {
      setLoginOpen(true);
      return;
    }
    setActiveWindow(null);
    setNotificationOpen(true);
  }, [session]);

  const openNotificationAction = useCallback((item) => {
    const action = item?.action;
    if (!action?.module) return;
    setNotificationOpen(false);
    if (action.module === "pos") {
      if (!canAccess("SALES_CREATE")) return;
      setActiveModule("sales");
      setSalesView("billing");
      setSalesDocumentId(action.entityId ?? null);
      setActiveWindow(buildSalesWindowKey("billing", action.entityId));
      return;
    }
    if (action.module === "sales") {
      if (!canAccess("SALES_CREATE")) return;
      setActiveModule("sales");
      const view = action.view === "invoices" ? "billing" : action.view || "billing";
      const documentId = view === "billing" ? action.entityId : null;
      setSalesView(view);
      setSalesDocumentId(documentId ?? null);
      setActiveWindow(buildSalesWindowKey(view, documentId));
      return;
    }
    if (action.module === "purchases") {
      if (!canAccess("PURCHASES_VIEW")) return;
      setActiveModule("purchases");
      setActiveWindow(`purchases-${action.view || "purchases"}`);
      return;
    }
    if (action.module === "banks") {
      if (!canAccess("BANKS_VIEW")) return;
      setActiveModule("banks");
      setActiveWindow(`banks-${action.view || "home"}`);
      return;
    }
    if (action.module === "administrative" && action.view) {
      openWindow(action.view);
    }
  }, [canAccess, openWindow]);

  useEffect(() => {
    function handleSessionUpdated(event) {
      const nextSession = event.detail ?? getStoredSession();
      setSession(nextSession);
      if (!nextSession) {
        setActiveWindow(null);
        setLoginOpen(true);
      }
    }
    window.addEventListener("auth:session-updated", handleSessionUpdated);
    return () =>
      window.removeEventListener("auth:session-updated", handleSessionUpdated);
  }, []);

  useEffect(() => {
    if (!session || !pendingSalesView || !canAccess("SALES_CREATE")) return;
    const view = pendingSalesView;
    const navigationTimer = window.setTimeout(() => {
      setPendingSalesView(null);
      setActiveModule("sales");
      setSalesDocumentId(null);
      setSalesView(view);
      setActiveWindow(`sales-${view}`);
    }, 0);
    return () => window.clearTimeout(navigationTimer);
  }, [canAccess, pendingSalesView, session]);

  useEffect(() => {
    if (!session || !pendingPosOpen || !canAccess("SALES_CREATE")) return;
    const navigationTimer = window.setTimeout(() => {
      setPendingPosOpen(false);
      window.location.assign("/pos?pos=1");
    }, 0);
    return () => window.clearTimeout(navigationTimer);
  }, [canAccess, pendingPosOpen, session]);

  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const requestedModule = params.get("module");
    const requestedView = params.get("view");
    const requestedDocumentId = Number(params.get("documentId")) || null;
    if (params.get("notifications") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (!requestedModule) return;
    window.history.replaceState({}, "", window.location.pathname);
    const navigationTimer = window.setTimeout(() => {
      if (requestedModule === "sales" && canAccess("SALES_CREATE")) {
        setActiveModule("sales");
        const view = requestedView === "invoices" ? "billing" : requestedView || "billing";
        const documentId = view === "billing" ? requestedDocumentId : null;
        setSalesView(view);
        setSalesDocumentId(documentId);
        setActiveWindow(buildSalesWindowKey(view, documentId));
      } else if (requestedModule === "purchases" && canAccess("PURCHASES_VIEW")) {
        setActiveModule("purchases");
        setActiveWindow(`purchases-${requestedView || "purchases"}`);
      } else if (requestedModule === "banks" && canAccess("BANKS_VIEW")) {
        setActiveModule("banks");
        setActiveWindow(`banks-${requestedView || "home"}`);
      } else if (requestedModule === "administrative" && requestedView) {
        openWindow(requestedView);
      }
    }, 0);
    return () => window.clearTimeout(navigationTimer);
  }, [canAccess, openWindow, session]);

  function logout() {
    storeSession(null);
    setSession(null);
    setActiveWindow(null);
    setLoginOpen(true);
  }

  if (session?.role === "BODEGA") {
    return (
      <WarehouseAdminPage
        session={session}
        onLogout={logout}
        onRequestLogin={openLogin}
      />
    );
  }

  if (session?.role === "DOMICILIARIO") {
    return (
      <DeliveryAgentPage
        session={session}
        onLogout={logout}
        onRequestLogin={openLogin}
      />
    );
  }

  return (
    <div className="classic-app">
      <WindowTitlebar
        activeModule={activeModule}
        notificationControl={
          <NotificationBell
            session={session}
            onOpenCenter={openNotificationCenter}
            onOpenNotification={openNotificationAction}
            onRequestLogin={openLogin}
          />
        }
      />
      <ClassicMenuBar
        onOpenClients={() => openWindow("clients")}
        onOpenProducts={() => openWindow("products")}
        onOpenProductTypes={() => openWindow("product-types")}
        onOpenWarehouses={() => openWindow("warehouses")}
        onOpenProviders={() => openWindow("providers")}
        onOpenRetentions={() => openWindow("retentions")}
        onOpenUsers={() => openWindow("users")}
        onOpenAuditLog={() => openWindow("audit-log")}
        onOpenOffers={() => openWindow("offers")}
        onOpenReferrals={() => openWindow("referrals")}
        onOpenReportsLibrary={() => openWindow("reports-library")}
        onOpenInventoryTransfers={() => openWindow("inventory-transfers")}
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
        onOpenInventoryTransfers={() => openWindow("inventory-transfers")}
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
        onOpenPos={openPos}
        canOpenPos={canAccess("SALES_CREATE")}
      />
      {(activeWindow || notificationOpen) && (
        <div className="window-layer" aria-label="Ventanas abiertas">
          {notificationOpen && (
            <NotificationsWindow
              session={session}
              onClose={() => setNotificationOpen(false)}
              onOpenNotification={openNotificationAction}
              onRequestLogin={openLogin}
            />
          )}
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
          {activeWindow === "audit-log" && (
            <AuditLogWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "offers" && (
            <OffersWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "referrals" && (
            <ReferralsWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "reports-library" && (
            <ReportsWindow
              session={session}
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "inventory-transfers" && (
            <InventoryTransfersWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow?.startsWith("sales-") && (
            <SalesWindow
              key={activeWindow}
              initialView={salesView}
              initialDocumentId={salesDocumentId}
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

function buildSalesWindowKey(view, documentId) {
  return `sales-${view}${documentId ? `-${documentId}` : ""}`;
}

function moduleLabel(moduleName) {
  return (
    {
      administrative: "administrativo",
      sales: "de ventas",
      purchases: "de compras",
      banks: "de finanzas",
    }[moduleName] ?? "administrativo"
  );
}

export default App;
