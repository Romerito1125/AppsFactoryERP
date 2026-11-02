export function WindowTitlebar({ activeModule = "administrative", notificationControl }) {
  const moduleLabel =
    {
      administrative: "Administrativo",
      sales: "Ventas",
      purchases: "Compras",
      banks: "Finanzas",
    }[activeModule] ?? "Administrativo";
  return (
    <header className="window-titlebar">
      <img className="window-logo" src="/logo.jpeg" alt="Mundo Tienda" />
      <h1>Mundo Tienda ERP módulo {moduleLabel}.</h1>
      <div className="window-actions">
        {notificationControl}
      </div>
    </header>
  );
}
