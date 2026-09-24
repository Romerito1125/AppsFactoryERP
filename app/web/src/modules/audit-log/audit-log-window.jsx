import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

const MODULE_OPTIONS = [
  ["", "Todos los módulos"],
  ["FACTURAS", "Facturación"],
  ["COTIZACIONES", "Cotizaciones"],
  ["PRODUCTOS", "Productos"],
  ["PRECIOS_PRODUCTO", "Precios"],
  ["INVENTARIO", "Inventario"],
  ["CLIENTES", "Clientes"],
  ["PROVEEDORES", "Proveedores"],
  ["USUARIOS", "Usuarios"],
  ["COMPRAS", "Compras"],
  ["BANCOS", "Finanzas"],
];

const ACTION_GROUP_OPTIONS = [
  ["", "Todas las acciones"],
  ["CREACIONES", "Creaciones"],
  ["MODIFICACIONES", "Modificaciones"],
  ["APROBACIONES", "Aprobaciones"],
  ["MOVIMIENTOS", "Movimientos"],
  ["ELIMINACIONES", "Eliminaciones"],
];

export function AuditLogWindow({ onClose, onRequestLogin }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [actionGroup, setActionGroup] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { handlePointerDown, isDragging, style: windowStyle } = useDraggableWindow();

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiClient.get("/auditoria", {
        page,
        limit: 30,
        q: query,
        module,
        actionGroup,
      });
      setRows(result?.data ?? []);
      setTotal(Number(result?.total ?? 0));
      setTotalPages(Math.max(1, Number(result?.totalPages ?? 1)));
    } catch (requestError) {
      setError(requestError.message ?? "No se pudieron cargar las acciones del sistema.");
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setLoading(false);
    }
  }, [actionGroup, module, onRequestLogin, page, query]);

  useEffect(() => {
    const timer = window.setTimeout(loadRows, 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const summary = useMemo(() => {
    if (!total) return "Sin acciones registradas";
    const first = (page - 1) * 30 + 1;
    return `Mostrando ${first}–${Math.min(first + rows.length - 1, total)} de ${total} acciones`;
  }, [page, rows.length, total]);

  return (
    <section
      className={`provider-window audit-log-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Acciones generales del sistema"
      style={windowStyle}
    >
      <header className="provider-titlebar drag-handle audit-log-titlebar" onPointerDown={handlePointerDown}>
        <div className="provider-title-mark"><Activity size={14} /></div>
        <strong>ACCIONES DEL SISTEMA</strong>
        <button type="button" className="provider-close" aria-label="Cerrar acciones del sistema" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="audit-log-heading">
        <div>
          <span>ADMINISTRATIVO · TRAZABILIDAD</span>
          <h2>Acciones generales del sistema</h2>
          <p>Consulta las acciones realizadas por usuarios y módulos del software.</p>
        </div>
        <button type="button" className="audit-log-refresh" onClick={loadRows} disabled={loading}><RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Actualizar</button>
      </div>
      <div className="audit-log-filters">
        <div className="audit-log-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuario, módulo o documento…" aria-label="Buscar acciones" /></div>
        <label><Filter size={13} /><select value={module} onChange={(event) => { setPage(1); setModule(event.target.value); }}>{MODULE_OPTIONS.map(([value, label]) => <option value={value} key={value || "all-modules"}>{label}</option>)}</select></label>
        <label><Activity size={13} /><select value={actionGroup} onChange={(event) => { setPage(1); setActionGroup(event.target.value); }}>{ACTION_GROUP_OPTIONS.map(([value, label]) => <option value={value} key={value || "all-actions"}>{label}</option>)}</select></label>
      </div>
      <div className="audit-log-content">
        {error && (
          <TransientMessage
            className="window-error"
            role="alert"
            onDismiss={() => setError("")}
          >
            {error}
          </TransientMessage>
        )}
        {loading ? <div className="audit-log-state"><LoaderCircle size={22} className="is-spinning" /> Cargando acciones…</div> : rows.length ? (
          <div className="audit-log-table" role="table" aria-label="Historial de acciones">
            <div className="audit-log-table-head" role="row"><span>Fecha</span><span>Usuario</span><span>Módulo</span><span>Acción</span><span>Registro</span></div>
            {rows.map((row) => <AuditRow key={row.id} row={row} />)}
          </div>
        ) : <div className="audit-log-state"><Activity size={28} /> No hay acciones para los filtros seleccionados.</div>}
      </div>
      <footer className="provider-window-footer audit-log-footer">
        <span>{summary}</span>
        <div className="provider-navigation-actions"><button type="button" className="muted-action" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={14} /> Anterior</button><span className="audit-log-page">Página {page} de {totalPages}</span><button type="button" className="muted-action" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Siguiente <ChevronRight size={14} /></button><button type="button" className="exit-action" onClick={onClose}><CircleX size={14} /> Salir</button></div>
      </footer>
    </section>
  );
}

function AuditRow({ row }) {
  return (
    <div className="audit-log-table-row" role="row">
      <span><CalendarClock size={13} /> {formatDate(row.createdAt)}</span>
      <span><UserRound size={13} /> {row.username || row.user?.username || "Sistema"}</span>
      <span><b>{moduleLabel(row.module)}</b></span>
      <span><strong>{actionLabel(row.action)}</strong></span>
      <span title={row.description || row.entityLabel || ""}>{row.entityLabel || row.description || "—"}</span>
    </div>
  );
}

function moduleLabel(value) {
  const labels = { FACTURAS: "Facturación", COTIZACIONES: "Cotizaciones", PRODUCTOS: "Productos", PRECIOS_PRODUCTO: "Precios", INVENTARIO: "Inventario", CLIENTES: "Clientes", PROVEEDORES: "Proveedores", USUARIOS: "Usuarios", COMPRAS: "Compras", BANCOS: "Finanzas" };
  return labels[value] ?? String(value || "Sistema").replaceAll("_", " ");
}

function actionLabel(value) {
  const labels = { CREATE: "Creación", UPDATE: "Modificación", DELETE: "Eliminación", ANULATE: "Anulación", ENTRY: "Entrada", EXIT: "Salida", APPROVE_TRANSFER: "Aprobación", CREATE_PRICE: "Crear precio", CHANGE_PRICE: "Cambiar precio", DEACTIVATE_PRICE: "Desactivar precio", SET_DEFAULT_PRICE: "Precio predeterminado" };
  return labels[value] ?? String(value || "Acción").replaceAll("_", " ");
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
