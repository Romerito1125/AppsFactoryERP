import { useCallback, useEffect, useState } from "react";

import { ClassicMenuBar } from "@/components/desktop/classic-menu-bar";
import { LoginDialog } from "@/components/desktop/login-dialog";
import { ShortcutToolbar } from "@/components/desktop/shortcut-toolbar";
import { SystemStatusbar } from "@/components/desktop/system-statusbar";
import { WindowTitlebar } from "@/components/desktop/window-titlebar";
import { getStoredSession, storeSession } from "@/lib/api-client";
import { ClientsWindow } from "@/modules/clients/clients-window";
import { ProductsWindow } from "@/modules/products/products-window";
import { ProvidersWindow } from "@/modules/providers/providers-window";
import { RetentionsWindow } from "@/modules/retentions/retentions-window";
import { AccountsPayableWindow } from "@/modules/payables/accounts-payable-window";
import { UsersWindow } from "@/modules/users/users-window";

function App() {
  const [activeWindow, setActiveWindow] = useState(null);
  const [session, setSession] = useState(() => getStoredSession());
  const [loginOpen, setLoginOpen] = useState(() => !getStoredSession());

  const openLogin = useCallback(() => setLoginOpen(true), []);
  const openWindow = useCallback(
    (windowName) => {
      if (!session) {
        setLoginOpen(true);
        return;
      }
      setActiveWindow(windowName);
    },
    [session],
  );

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

  function logout() {
    storeSession(null);
    setSession(null);
    setActiveWindow(null);
    setLoginOpen(true);
  }

  return (
    <div className="classic-app">
      <WindowTitlebar />
      <ClassicMenuBar
        onOpenClients={() => openWindow("clients")}
        onOpenProducts={() => openWindow("products")}
        onOpenProviders={() => openWindow("providers")}
        onOpenRetentions={() => openWindow("retentions")}
        onOpenUsers={() => openWindow("users")}
        onOpenPayables={() => openWindow("payables")}
      />
      <ShortcutToolbar
        onOpenClients={() => openWindow("clients")}
        onOpenProducts={() => openWindow("products")}
        onOpenProviders={() => openWindow("providers")}
      />

      <main
        className="empty-workspace"
        aria-label="Área de trabajo del módulo administrativo"
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
            />
          )}
          {activeWindow === "providers" && (
            <ProvidersWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "products" && (
            <ProductsWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "retentions" && (
            <RetentionsWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "payables" && (
            <AccountsPayableWindow
              onClose={() => setActiveWindow(null)}
              onRequestLogin={openLogin}
            />
          )}
          {activeWindow === "users" && (
            <UsersWindow
              onClose={() => setActiveWindow(null)}
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

export default App;
