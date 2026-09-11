export function WindowTitlebar({ activeModule = "administrative" }) {
  const moduleLabel =
    {
      administrative: "Administrativo",
      sales: "Ventas",
      purchases: "Compras",
      banks: "Bancos",
    }[activeModule] ?? "Administrativo";
  return (
    <header className="window-titlebar">
      <img className="window-logo" src="/logo.jpeg" alt="Mundo Tienda" />
      <h1>Mundo Tienda ERP módulo {moduleLabel}.</h1>
      <div className="window-actions" aria-hidden="true">
        <span className="window-minimize">−</span>
        <span className="window-close">×</span>
      </div>
    </header>
  );
}
