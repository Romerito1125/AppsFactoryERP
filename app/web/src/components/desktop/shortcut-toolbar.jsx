import { FolderOpen } from "lucide-react";

import {
  banksToolbarItems,
  purchasesToolbarItems,
  salesToolbarItems,
  toolbarItems,
} from "@/app/desktop-config";

export function ShortcutToolbar({
  onOpenClients,
  onOpenProducts,
  onOpenProviders,
  onOpenPayables,
  onOpenReceivables,
  onOpenSalesView,
  onOpenPurchasesView,
  onOpenBanksView,
  activeModule = "administrative",
  canAccess,
}) {
  const moduleToolbarItems =
    activeModule === "sales"
      ? salesToolbarItems
      : activeModule === "purchases"
        ? purchasesToolbarItems
        : activeModule === "banks"
          ? banksToolbarItems
          : toolbarItems;
  const visibleItems = moduleToolbarItems.filter(
    (item) => !item.permission || canAccess?.(item.permission),
  );
  const firstGroup = visibleItems.slice(0, 3);
  const secondGroup = visibleItems.slice(3);

  return (
    <section className="shortcut-toolbar" aria-label="Accesos rápidos del ERP">
      <ToolbarGroup
        items={firstGroup}
        onOpenClients={onOpenClients}
        onOpenProducts={onOpenProducts}
        onOpenProviders={onOpenProviders}
        onOpenPayables={onOpenPayables}
        onOpenReceivables={onOpenReceivables}
        onOpenSalesView={onOpenSalesView}
        onOpenPurchasesView={onOpenPurchasesView}
        onOpenBanksView={onOpenBanksView}
        activeModule={activeModule}
      />
      <div className="toolbar-divider" />
      <ToolbarGroup
        items={secondGroup}
        onOpenClients={onOpenClients}
        onOpenProducts={onOpenProducts}
        onOpenProviders={onOpenProviders}
        onOpenPayables={onOpenPayables}
        onOpenReceivables={onOpenReceivables}
        onOpenSalesView={onOpenSalesView}
        onOpenPurchasesView={onOpenPurchasesView}
        onOpenBanksView={onOpenBanksView}
        activeModule={activeModule}
      />
      <div className="toolbar-divider" />
      <div className="toolbar-space" aria-hidden="true" />
    </section>
  );
}

function ToolbarGroup({
  items,
  onOpenClients,
  onOpenProducts,
  onOpenProviders,
  onOpenPayables,
  onOpenReceivables,
  onOpenSalesView,
  onOpenPurchasesView,
  onOpenBanksView,
  activeModule,
}) {
  return (
    <div className="toolbar-items">
      {items.map((item) => {
        const Icon = item.icon;
        const handleClick =
          item.action === "clients"
            ? onOpenClients
            : item.action === "providers"
              ? onOpenProviders
              : item.action === "products"
                ? onOpenProducts
                : item.action === "payables"
                  ? activeModule === "banks"
                    ? () => onOpenBanksView?.("payables")
                    : onOpenPayables
                  : item.action === "receivables"
                    ? activeModule === "banks"
                      ? () => onOpenBanksView?.("receivables")
                      : onOpenReceivables
                    : activeModule === "purchases" &&
                        [
                          "purchases",
                          "returns",
                          "quotes",
                          "orders",
                          "deliveries",
                          "reports",
                        ].includes(item.action)
                      ? () => onOpenPurchasesView?.(item.action)
                      : activeModule === "banks" &&
                          [
                            "accounts",
                            "beneficiaries",
                            "banks",
                            "transactions",
                            "receivables",
                            "payables",
                            "reports",
                          ].includes(item.action)
                        ? () => onOpenBanksView?.(item.action)
                        : item.action === "billing" ||
                            item.action === "returns" ||
                            item.action === "quotes" ||
                            item.action === "orders" ||
                            item.action === "deliveries" ||
                            item.action === "reports"
                          ? () => onOpenSalesView?.(item.action)
                          : undefined;

        return (
          <button
            className="toolbar-button"
            type="button"
            aria-label={item.label}
            key={item.label}
            onClick={handleClick}
          >
            <span className={`folder-glyph glyph-${item.tone}`}>
              <FolderOpen
                className="folder-back"
                size={35}
                strokeWidth={1.35}
              />
              <span className="folder-module-icon">
                <Icon size={15} strokeWidth={1.8} />
              </span>
            </span>
            <span className="toolbar-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
