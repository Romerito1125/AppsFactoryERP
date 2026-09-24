import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { useDraggableWindow } from "./use-draggable-window";
import { useNotificationCenter } from "./notification-center-state";
import { TransientMessage } from "./transient-message";

export function NotificationBell({
  session,
  onOpenCenter,
  onOpenNotification,
  onRequestLogin,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const center = useNotificationCenter({ enabled: Boolean(session), onRequestLogin });

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  async function selectNotification(item) {
    await center.markRead(item.id);
    setOpen(false);
    onOpenNotification?.(item);
  }

  return (
    <div className={`notification-center-anchor ${compact ? "is-compact" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="notification-bell-button"
        aria-label={`Notificaciones${center.unreadCount ? `, ${center.unreadCount} sin leer` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        disabled={!session}
      >
        <Bell size={compact ? 15 : 14} />
        {center.unreadCount > 0 && <span className="notification-bell-badge">{center.unreadCount > 99 ? "99+" : center.unreadCount}</span>}
        {!compact && <span>Notificaciones</span>}
      </button>
      {open && (
        <div className="notification-popover" role="dialog" aria-label="Notificaciones recientes">
          <header className="notification-popover-header">
            <div>
              <strong>Notificaciones</strong>
              <span>{center.unreadCount ? `${center.unreadCount} sin leer` : "Todo al día"}</span>
            </div>
            <button type="button" className="notification-icon-button" onClick={() => center.reload()} aria-label="Actualizar notificaciones">
              <RefreshCw size={14} />
            </button>
          </header>
          {center.loading ? (
            <div className="notification-state"><LoaderCircle size={18} className="is-spinning" /> Cargando…</div>
          ) : center.notifications.length ? (
            <div className="notification-popover-list">
              {center.notifications.slice(0, 5).map((item) => (
                <NotificationRow key={item.id} item={item} compact onOpen={() => selectNotification(item)} />
              ))}
            </div>
          ) : (
            <div className="notification-state"><Inbox size={22} /> No hay novedades todavía.</div>
          )}
          <footer className="notification-popover-footer">
            <button type="button" onClick={() => { setOpen(false); onOpenCenter?.(); }}>
              Ver centro de notificaciones <ChevronRight size={14} />
            </button>
            {center.unreadCount > 0 && <button type="button" className="notification-mark-all" onClick={() => center.markAllRead()}><CheckCheck size={13} /> Marcar leídas</button>}
          </footer>
        </div>
      )}
    </div>
  );
}

export function NotificationsWindow({ session, onClose, onOpenNotification, onRequestLogin }) {
  const [tab, setTab] = useState("notifications");
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const center = useNotificationCenter({ enabled: Boolean(session), onRequestLogin });
  const { handlePointerDown, isDragging, style: windowStyle } = useDraggableWindow();

  const visibleNotifications = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return center.notifications.filter((item) => {
      if (filter === "unread" && item.isRead) return false;
      if (!query) return true;
      return `${item.title} ${item.message}`.toLowerCase().includes(query);
    });
  }, [center.notifications, filter, searchTerm]);

  const visibleActivity = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return center.activity;
    return center.activity.filter((item) => `${item.module} ${item.action} ${item.entityLabel ?? ""} ${item.description ?? ""}`.toLowerCase().includes(query));
  }, [center.activity, searchTerm]);

  async function handleNotificationOpen(item) {
    await center.markRead(item.id);
    onOpenNotification?.(item);
  }

  return (
    <section
      className={`provider-window notification-center-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Centro de notificaciones y actividad"
      style={windowStyle}
    >
      <header className="provider-titlebar drag-handle notification-center-titlebar" onPointerDown={handlePointerDown}>
        <div className="provider-title-mark"><Bell size={14} /></div>
        <strong>CENTRO DE NOTIFICACIONES</strong>
        <button type="button" className="provider-close" aria-label="Cerrar notificaciones" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="notification-center-toolbar">
        <div>
          <span className="notification-eyebrow">SEGUIMIENTO GLOBAL</span>
          <h2>Notificaciones y actividad</h2>
          <p>Revisa lo que ocurrió y abre directamente la pantalla donde puedes resolverlo.</p>
        </div>
        <button type="button" className="notification-refresh-button" onClick={() => center.reload()} disabled={center.loading}><RefreshCw size={14} className={center.loading ? "is-spinning" : ""} /> Actualizar</button>
      </div>
      <div className="notification-center-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "notifications"} className={tab === "notifications" ? "is-active" : ""} onClick={() => setTab("notifications")}><Bell size={14} /> Notificaciones <b>{center.unreadCount}</b></button>
        <button type="button" role="tab" aria-selected={tab === "activity"} className={tab === "activity" ? "is-active" : ""} onClick={() => setTab("activity")}><Clock3 size={14} /> Actividad del sistema</button>
      </div>
      <div className="notification-center-filters">
        <div className="notification-search"><Search size={14} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar en notificaciones…" aria-label="Buscar en notificaciones" /></div>
        {tab === "notifications" && <div className="notification-filter-buttons"><button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Todas</button><button type="button" className={filter === "unread" ? "is-active" : ""} onClick={() => setFilter("unread")}>Sin leer</button>{center.unreadCount > 0 && <button type="button" onClick={() => center.markAllRead()}><CheckCheck size={13} /> Marcar todo leído</button>}</div>}
      </div>
      <div className="notification-center-body">
        {center.error && (
          <TransientMessage
            className="notification-error"
            role="alert"
            icon={<CircleAlert size={15} />}
            onDismiss={center.clearError}
          >
            {center.error}
          </TransientMessage>
        )}
        {center.loading ? <div className="notification-state large"><LoaderCircle size={22} className="is-spinning" /> Cargando centro…</div> : tab === "notifications" ? (
          visibleNotifications.length ? <div className="notification-list">{visibleNotifications.map((item) => <NotificationRow key={item.id} item={item} onOpen={() => handleNotificationOpen(item)} />)}</div> : <div className="notification-state large"><Inbox size={28} /> No hay notificaciones para este filtro.</div>
        ) : (
          visibleActivity.length ? <div className="notification-activity-list">{visibleActivity.map((item) => <ActivityRow key={item.id} item={item} onOpen={() => onOpenNotification?.(item)} />)}</div> : <div className="notification-state large"><FileText size={28} /> No hay actividad registrada para mostrar.</div>
        )}
      </div>
      <footer className="provider-window-footer notification-center-footer"><span>{tab === "notifications" ? `${center.notifications.length} notificaciones cargadas` : `${center.activity.length} acciones registradas`}</span><button type="button" className="exit-action" onClick={onClose}><X size={14} /> Cerrar</button></footer>
    </section>
  );
}

function NotificationRow({ item, onOpen, compact = false }) {
  return (
    <button type="button" className={`notification-row ${item.isRead ? "is-read" : "is-unread"} ${compact ? "is-compact" : ""}`} onClick={onOpen}>
      <span className={`notification-row-icon ${String(item.priority ?? "NORMAL").toLowerCase()}`}><Bell size={compact ? 13 : 15} /></span>
      <span className="notification-row-copy"><span className="notification-row-heading"><strong>{item.title}</strong>{!item.isRead && <i aria-label="Sin leer" />}</span><span>{item.message}</span><small>{formatNotificationDate(item.createdAt)} · {item.action?.label ?? "Abrir detalle"}</small></span>
      <ChevronRight size={15} className="notification-row-arrow" />
    </button>
  );
}

function ActivityRow({ item, onOpen }) {
  return (
    <button type="button" className="notification-activity-row" onClick={onOpen}>
      <span className="notification-activity-icon"><FileText size={15} /></span>
      <span className="notification-row-copy"><span className="notification-row-heading"><strong>{activityTitle(item)}</strong></span><span>{item.description || `${item.action} · ${item.entityLabel || "Registro del sistema"}`}</span><small>{formatNotificationDate(item.createdAt)} · {item.user?.username || item.username || "Sistema"}</small></span>
      {item.action && <ChevronRight size={15} className="notification-row-arrow" />}
    </button>
  );
}

function activityTitle(item) {
  const labels = { CREATE: "Registro creado", UPDATE: "Registro actualizado", DELETE: "Registro eliminado", ANULATE: "Documento anulado", ENTRY: "Entrada de inventario", EXIT: "Salida de inventario", APPROVE_TRANSFER: "Traslado aprobado" };
  return labels[item.action] ?? item.action?.replaceAll("_", " ") ?? "Acción registrada";
}

function formatNotificationDate(value) {
  if (!value) return "Ahora";
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return isToday ? `Hoy, ${new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(date)}` : new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
