export function WindowTitlebar() {
  return (
    <header className="window-titlebar">
      <img className="window-logo" src="/logo.jpeg" alt="Mundo Tienda" />
      <h1>Mundo Tienda ERP módulo Administrativo.</h1>
      <div className="window-actions" aria-hidden="true">
        <span className="window-minimize">−</span>
        <span className="window-close">×</span>
      </div>
    </header>
  )
}
