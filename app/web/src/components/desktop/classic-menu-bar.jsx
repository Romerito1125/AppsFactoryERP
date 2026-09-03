import { ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  filesMenuItems,
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
}) {
  const [openMenu, setOpenMenu] = useState(null);

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
      payables: onOpenPayables,
    };
    handlers[item.action]?.();
    setOpenMenu(null);
  }

  return (
    <nav
      className="classic-menubar"
      aria-label="Menú del módulo administrativo"
    >
      {topMenuItems.map((item) => (
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
              {(item === "Archivos"
                ? filesMenuItems
                : transactionsMenuItems
              ).map((fileItem, index) =>
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
    </nav>
  );
}
