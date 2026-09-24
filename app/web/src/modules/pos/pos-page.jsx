import { useEffect, useState } from "react";

import { LoginDialog } from "@/components/desktop/login-dialog";
import { notificationTargetUrl } from "@/components/desktop/notification-utils";
import { getStoredSession, storeSession } from "@/lib/api-client";
import { PosPageHeader, PosWorkspace } from "./pos-window";

export function PosPage() {
  const [session, setSession] = useState(() => getStoredSession());

  useEffect(() => {
    function handleSessionUpdated(event) {
      setSession(event.detail ?? getStoredSession());
    }

    window.addEventListener("auth:session-updated", handleSessionUpdated);
    return () => window.removeEventListener("auth:session-updated", handleSessionUpdated);
  }, []);

  function requestLogin() {
    storeSession(null);
    setSession(null);
  }

  if (!session) {
    return (
      <div className="new-pos-auth-page">
        <PosPageHeader />
        <div className="new-pos-auth-message">
          <h1>Acceso a Caja POS</h1>
          <p>Inicia sesión con permisos de ventas para entrar a la operación.</p>
        </div>
        <LoginDialog required onLoggedIn={() => setSession(getStoredSession())} />
      </div>
    );
  }

  return (
    <PosWorkspace
      session={session}
      onRequestLogin={requestLogin}
      onOpenNotification={openPosNotificationAction}
    />
  );
}

function openPosNotificationAction(item) {
  const action = item?.action;
  if (!action || action.module === "pos") return;
  window.location.assign(notificationTargetUrl(action));
}
