import { FolderOpen } from 'lucide-react'

import { toolbarItems } from '@/app/desktop-config'

export function ShortcutToolbar({ onOpenClients, onOpenProducts, onOpenProviders }) {
  const firstGroup = toolbarItems.slice(0, 3)
  const secondGroup = toolbarItems.slice(3)

  return (
    <section className="shortcut-toolbar" aria-label="Accesos administrativos">
      <ToolbarGroup items={firstGroup} onOpenClients={onOpenClients} onOpenProducts={onOpenProducts} onOpenProviders={onOpenProviders} />
      <div className="toolbar-divider" />
      <ToolbarGroup items={secondGroup} onOpenClients={onOpenClients} onOpenProducts={onOpenProducts} onOpenProviders={onOpenProviders} />
      <div className="toolbar-divider" />
      <div className="toolbar-space" aria-hidden="true" />
    </section>
  )
}

function ToolbarGroup({ items, onOpenClients, onOpenProducts, onOpenProviders }) {
  return (
    <div className="toolbar-items">
      {items.map((item) => {
        const Icon = item.icon
        const handleClick = item.action === 'clients'
          ? onOpenClients
          : item.action === 'providers'
          ? onOpenProviders
          : item.action === 'products' ? onOpenProducts : undefined

        return (
          <button className="toolbar-button" type="button" aria-label={item.label} key={item.label} onClick={handleClick}>
            <span className={`folder-glyph glyph-${item.tone}`}>
              <FolderOpen className="folder-back" size={35} strokeWidth={1.35} />
              <span className="folder-module-icon"><Icon size={15} strokeWidth={1.8} /></span>
            </span>
            <span className="toolbar-label">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
