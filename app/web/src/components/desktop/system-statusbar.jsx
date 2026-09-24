import { ShoppingCart } from "lucide-react";

export function SystemStatusbar({
  session,
  onLogin,
  onLogout,
  onOpenPos,
  canOpenPos = true,
}) {
  return (
    <footer className="system-statusbar">
      <div className="footer-brand">
        <img className="footer-logo" src="/logo.jpeg" alt="" aria-hidden="true" />
        <strong>Mundo<span>Tienda</span></strong>
      </div>
      <div className="license-block">
        <strong>LICENCIA OPERATIVA</strong>
        <span>Centro de control comercial</span>
      </div>
      <div className="connection-block">
        <span>Conexión:</span>
        <strong>Empresa Nueva</strong>
      </div>
      <div className="session-block">
        <span className={session ? 'session-dot is-online' : 'session-dot'} />
        <span>{session ? session.user?.username ?? 'Sesión activa' : 'Sin sesión'}</span>
        {canOpenPos && (
          <button
            type="button"
            className="status-pos-button"
            onClick={onOpenPos}
            aria-label="Abrir Caja POS"
          >
            <ShoppingCart size={12} strokeWidth={2} />
            Caja POS
          </button>
        )}
        {session ? <button type="button" onClick={onLogout}>Cerrar sesión</button> : <button type="button" onClick={onLogin}>Ingresar</button>}
      </div>
    </footer>
  )
}
