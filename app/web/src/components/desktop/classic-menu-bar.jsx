import { ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  filesMenuItems,
  banksMenuItemsByMenu,
  banksTopMenuItems,
  moduleMenuItems,
  purchasesMenuItems,
  purchasesTopMenuItems,
  salesMenuItems,
  salesTopMenuItems,
  topMenuItems,
  transactionsMenuItems,
} from "@/app/desktop-config";

export function ClassicMenuBar({
  onOpenClients,
  onOpenProducts,
  onOpenProviders,
  onOpenRetentions,
  onOpenUsers,
  onOpenPayables,
  onOpenReceivables,
  onOpenSalesView,
  onOpenPurchasesView,
  onOpenBanksView,
  onSwitchModule,
  activeModule = "administrative",
  canAccess,
}) {
  const [openMenu, setOpenMenu] = useState(null);

  const moduleTopMenus =
    activeModule === "sales"
      ? salesTopMenuItems
      : activeModule === "purchases"
        ? purchasesTopMenuItems
        : activeModule === "banks"
          ? banksTopMenuItems
          : topMenuItems;
  const menuNames = moduleTopMenus;

  function toggleMenu(menu) {
    setOpenMenu((currentMenu) => (currentMenu === menu ? null : menu));
  }

  function selectMenuItem(item) {
    const handlers = {
      clients: onOpenClients,
      providers: onOpenProviders,
      products: onOpenProducts,
      retentions: onOpenRetentions,
      users: onOpenUsers,
      payables: () =>
        activeModule === "banks"
          ? onOpenBanksView?.("payables")
          : onOpenPayables?.(),
      receivables: () =>
        activeModule === "banks"
          ? onOpenBanksView?.("receivables")
          : onOpenReceivables?.(),
      billing: () => onOpenSalesView?.("billing"),
      returns: () =>
        activeModule === "purchases"
          ? onOpenPurchasesView?.("returns")
          : onOpenSalesView?.("returns"),
      quotes: () =>
        activeModule === "purchases"
          ? onOpenPurchasesView?.("quotes")
          : onOpenSalesView?.("quotes"),
      deliveries: () =>
        activeModule === "purchases"
          ? onOpenPurchasesView?.("deliveries")
          : onOpenSalesView?.("deliveries"),
      orders: () =>
        activeModule === "purchases"
          ? onOpenPurchasesView?.("orders")
          : onOpenSalesView?.("orders"),
      reports: () =>
        activeModule === "purchases"
          ? onOpenPurchasesView?.("reports")
          : activeModule === "banks"
            ? onOpenBanksView?.("reports")
            : onOpenSalesView?.("reports"),
      various: () =>
        activeModule === "purchases"
          ? onOpenPurchasesView?.("various")
          : activeModule === "banks"
            ? onOpenBanksView?.("various")
            : onOpenSalesView?.("various"),
      purchases: () => onOpenPurchasesView?.("purchases"),
      accounts: () => onOpenBanksView?.("accounts"),
      beneficiaries: () => onOpenBanksView?.("beneficiaries"),
      banks: () => onOpenBanksView?.("banks"),
      transactions: () => onOpenBanksView?.("transactions"),
      "switch-purchases": () => onSwitchModule?.("purchases"),
      "switch-banks": () => onSwitchModule?.("banks"),
      "switch-administrative": () => onSwitchModule?.("administrative"),
      "switch-sales": () => onSwitchModule?.("sales"),
    };
    handlers[item.action]?.();
    setOpenMenu(null);
  }

  return (
    <nav className="classic-menubar" aria-label="Menú principal del ERP">
      {menuNames.map((item) => (
        <div className="classic-menu-wrap" key={item}>
          <button
            className={
              openMenu === item
                ? "classic-menuitem is-open"
                : "classic-menuitem"
            }
            type="button"
            aria-expanded={openMenu === item}
            onClick={() => toggleMenu(item)}
          >
            <span>{item}</span>
            <ChevronDown size={12} />
          </button>

          {openMenu === item && (
            <div
              className="files-menu"
              role="menu"
              aria-label={`Opciones de ${item}`}
            >
              {(item === "Módulos"
                ? moduleMenuItems
                : activeModule === "sales"
                  ? salesMenuItems
                  : activeModule === "purchases"
                    ? purchasesMenuItems
                    : activeModule === "banks"
                      ? (banksMenuItemsByMenu[item] ?? [])
                      : item === "Archivos"
                        ? filesMenuItems
                        : item === "Transacciones"
                          ? transactionsMenuItems
                          : moduleMenuItems
              )
                .filter(
                  (fileItem) =>
                    !fileItem.permission || canAccess?.(fileItem.permission),
                )
                .map((fileItem, index) =>
                  fileItem.divider ? (
                    <div
                      className="files-menu-divider"
                      key={`divider-${index}`}
                    />
                  ) : (
                    <button
                      className="files-menu-row"
                      type="button"
                      role="menuitem"
                      key={fileItem.label}
                      onClick={() => selectMenuItem(fileItem)}
                    >
                      <span>{fileItem.label}</span>
                      {fileItem.submenu && <ChevronRight size={13} />}
                    </button>
                  ),
                )}
            </div>
          )}
        </div>
      ))}
      <div className="classic-module-switcher" aria-label="Módulos">
        <span className="classic-module-caption">Módulos</span>
        {moduleMenuItems.map((moduleItem) => {
          const allowed =
            !moduleItem.permission || canAccess?.(moduleItem.permission);
          const moduleName = moduleItem.action.replace("switch-", "");
          return (
            <button
              type="button"
              key={moduleItem.action}
              className={
                activeModule === moduleName
                  ? "classic-module-button is-active"
                  : "classic-module-button"
              }
              aria-current={activeModule === moduleName ? "page" : undefined}
              disabled={!allowed}
              onClick={() => onSwitchModule?.(moduleName)}
            >
              {moduleItem.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
