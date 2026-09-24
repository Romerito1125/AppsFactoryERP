import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  ClipboardList,
  FileText,
  LoaderCircle,
  Package,
  Printer,
  RefreshCw,
  Warehouse,
  X,
} from "lucide-react";

import {
  NotificationBell,
  NotificationsWindow,
} from "@/components/desktop/notification-center";
import { LoginDialog } from "@/components/desktop/login-dialog";
import { SystemStatusbar } from "@/components/desktop/system-statusbar";
import { TransientMessage } from "@/components/desktop/transient-message";
import { WindowTitlebar } from "@/components/desktop/window-titlebar";
import { apiClient } from "@/lib/api-client";

export function WarehouseAdminPage({ session, onLogout, onRequestLogin }) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [focus, setFocus] = useState("orders");
  const [activeTab, setActiveTab] = useState("resumen");
  const [pendingQuoteId, setPendingQuoteId] = useState(null);
  const [pendingPurchaseOrderId, setPendingPurchaseOrderId] = useState(null);
  const clearPendingQuote = useCallback(() => setPendingQuoteId(null), []);
  const clearPendingPurchaseOrder = useCallback(() => setPendingPurchaseOrderId(null), []);
  const requestLogin = useCallback(() => {
    setLoginOpen(true);
    onRequestLogin?.();
  }, [onRequestLogin]);

  const handleNotificationAction = useCallback((item) => {
    const isPurchaseTask = item?.action?.view === "purchase-order";
    const isWarehouseTask =
      item?.type === "PEDIDO_APP" ||
      item?.source === "APP_MOVIL" ||
      item?.action?.view === "orders" ||
      item?.action?.module === "purchases";
    const isQuoteTask =
      !isPurchaseTask &&
      (item?.type === "BODEGA_TAREA" || item?.action?.module === "warehouse");
    setFocus(isPurchaseTask || isQuoteTask ? "orders" : isWarehouseTask ? "app-orders" : "notifications");
    setActiveTab(isPurchaseTask || isQuoteTask ? "cotizaciones" : isWarehouseTask ? "pedidos" : "resumen");
    setPendingQuoteId(isQuoteTask ? item?.action?.entityId ?? null : null);
    setPendingPurchaseOrderId(isPurchaseTask ? item?.action?.entityId ?? null : null);
    setNotificationOpen(false);
  }, []);

  return (
    <div className="warehouse-admin-app">
      <WindowTitlebar
        activeModule="administrative"
        notificationControl={
          <NotificationBell
            session={session}
            onOpenCenter={() => setNotificationOpen(true)}
            onOpenNotification={handleNotificationAction}
            onRequestLogin={requestLogin}
          />
        }
      />
      <main className="warehouse-admin-main">
        <WarehouseDashboard
          session={session}
          focus={focus}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingQuoteId={pendingQuoteId}
          onPendingQuoteHandled={clearPendingQuote}
          pendingPurchaseOrderId={pendingPurchaseOrderId}
          onPendingPurchaseOrderHandled={clearPendingPurchaseOrder}
          onNotificationOpen={handleNotificationAction}
          onRequestLogin={requestLogin}
        />
      </main>
      <SystemStatusbar
        session={session}
        onLogin={onRequestLogin}
        onLogout={onLogout}
        canOpenPos={false}
      />
      {notificationOpen && (
        <div className="warehouse-admin-notification-layer">
          <NotificationsWindow
            session={session}
            onClose={() => setNotificationOpen(false)}
            onOpenNotification={handleNotificationAction}
            onRequestLogin={requestLogin}
          />
        </div>
      )}
      {loginOpen && (
        <LoginDialog
          required
          onClose={() => setLoginOpen(false)}
          onLoggedIn={() => setLoginOpen(false)}
        />
      )}
    </div>
  );
}

function WarehouseDashboard({ session, focus, activeTab, onTabChange, pendingQuoteId, onPendingQuoteHandled, pendingPurchaseOrderId, onPendingPurchaseOrderHandled, onNotificationOpen, onRequestLogin }) {
  const warehouseId = session?.user?.warehouseId ?? session?.warehouseId ?? null;
  const [state, setState] = useState({
    loading: true,
    error: "",
    orders: [],
    purchaseOrders: [],
    appOrders: [],
    inventory: [],
    notifications: [],
    warehouse: null,
    quotes: [],
  });
  const [actionLoading, setActionLoading] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewOrder, setReviewOrder] = useState(null);
  const [reviewQuote, setReviewQuote] = useState(null);
  const [selectedAppOrder, setSelectedAppOrder] = useState(null);
  const [purchaseHistoryFilter, setPurchaseHistoryFilter] = useState("TODAS");

  const loadDashboard = useCallback(async () => {
    if (!warehouseId) {
      setState((current) => ({
        ...current,
        loading: false,
        error: "El usuario Bodega no tiene una bodega asignada.",
      }));
      return;
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    const [ordersResult, purchaseOrdersResult, appOrdersResult, inventoryResult, notificationsResult, warehousesResult, quotesResult] =
      await Promise.allSettled([
        apiClient.getAllPages("/compras", { status: "ORDENADA" }),
        apiClient.getAllPages("/compras"),
        apiClient.get("/tienda/pedidos", { limit: 100 }),
        apiClient.get(`/inventario/bodegas/${warehouseId}`),
        apiClient.get("/notificaciones", { limit: 50 }),
        apiClient.getAllPages("/bodegas", { estado: "activos" }),
        apiClient.getAllPages("/cotizaciones"),
      ]);
    const failed = [ordersResult, appOrdersResult, inventoryResult, notificationsResult].find(
      (result) => result.status === "rejected",
    );
    if (failed) {
      if (failed.reason?.message?.toLowerCase().includes("inicia sesión"))
        onRequestLogin?.();
      setState((current) => ({
        ...current,
        loading: false,
        error: failed.reason?.message ?? "No se pudo cargar la operación de bodega.",
      }));
      return;
    }
    const warehouse =
      warehousesResult.status === "fulfilled"
        ? warehousesResult.value.find((item) => Number(item.id) === Number(warehouseId))
        : null;
    setState({
      loading: false,
      error: "",
      orders: unwrapData(ordersResult.value),
      purchaseOrders: purchaseOrdersResult.status === "fulfilled" ? purchaseOrdersResult.value : [],
      appOrders: unwrapData(appOrdersResult.value),
      inventory: unwrapData(inventoryResult.value),
      notifications: notificationsResult.value?.notifications ?? [],
      warehouse,
      quotes: quotesResult.status === "fulfilled" ? quotesResult.value : [],
    });
  }, [onRequestLogin, warehouseId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const handleIncomingNotification = () => {
      void loadDashboard();
    };
    window.addEventListener("notifications:incoming", handleIncomingNotification);
    return () => window.removeEventListener("notifications:incoming", handleIncomingNotification);
  }, [loadDashboard]);

  useEffect(() => {
    if (!pendingQuoteId || !state.quotes.length) return;
    const quote = state.quotes.find((candidate) => Number(candidate.id) === Number(pendingQuoteId));
    if (quote) {
      setReviewQuote(quote);
      onPendingQuoteHandled?.();
    }
  }, [onPendingQuoteHandled, pendingQuoteId, state.quotes]);

  useEffect(() => {
    if (!pendingPurchaseOrderId) return undefined;
    let cancelled = false;
    const order = state.purchaseOrders.find(
      (candidate) => Number(candidate.id) === Number(pendingPurchaseOrderId),
    );

    async function openPendingOrder() {
      try {
        const detail = await apiClient.get(`/compras/${pendingPurchaseOrderId}`);
        if (!cancelled) setReviewOrder(detail);
      } catch (requestError) {
        if (!cancelled && order) setReviewOrder(order);
        if (!cancelled && !order) setState((current) => ({ ...current, error: requestError.message }));
      } finally {
        if (!cancelled) onPendingPurchaseOrderHandled?.();
      }
    }

    void openPendingOrder();
    return () => {
      cancelled = true;
    };
  }, [onPendingPurchaseOrderHandled, pendingPurchaseOrderId, state.purchaseOrders]);

  async function receiveOrder(order) {
    if (actionLoading) return;
    setActionLoading(`receive-${order.id}`);
    setNotice("");
    try {
      await apiClient.post(`/compras/${order.id}/recibir`, {});
      setNotice(`Entrada ${order.consecutive} recibida. Inventario actualizado.`);
      await loadDashboard();
    } catch (requestError) {
      setState((current) => ({ ...current, error: requestError.message }));
    } finally {
      setActionLoading("");
    }
  }

  async function openPurchaseOrder(order) {
    if (order.items?.length) {
      setReviewOrder(order);
      return;
    }
    setActionLoading(`detail-${order.id}`);
    try {
      const detail = await apiClient.get(`/compras/${order.id}`);
      setReviewOrder(detail);
    } catch (requestError) {
      setState((current) => ({ ...current, error: requestError.message }));
    } finally {
      setActionLoading("");
    }
  }

  async function updateAppOrderStatus(order, status) {
    if (!order.delivery?.id || actionLoading) return;
    setActionLoading(`delivery-${order.delivery.id}`);
    setNotice("");
    try {
      await apiClient.patch(`/domicilios/${order.delivery.id}/estado`, { status });
      setNotice(`Pedido ${order.consecutive} actualizado: ${deliveryStatusLabel(status)}.`);
      setSelectedAppOrder(null);
      await loadDashboard();
    } catch (requestError) {
      setState((current) => ({ ...current, error: requestError.message }));
    } finally {
      setActionLoading("");
    }
  }

  const warehouseNotifications = useMemo(
    () =>
      state.notifications.filter(
        (item) =>
          item.type === "PEDIDO_APP" ||
          item.source === "APP_MOVIL" ||
          item.action?.view === "orders" ||
          item.type === "BODEGA_TAREA",
      ),
    [state.notifications],
  );
  const lowStock = useMemo(
    () =>
      state.inventory.filter((row) => {
        const minimum = Number(row.product?.minimumStock ?? 0);
        return Number(row.quantity ?? 0) <= minimum;
      }),
    [state.inventory],
  );
  const visiblePurchaseHistory = useMemo(
    () => state.purchaseOrders.filter((order) =>
      purchaseHistoryFilter === "TODAS" || order.status === purchaseHistoryFilter,
    ),
    [purchaseHistoryFilter, state.purchaseOrders],
  );

  return (
    <section className="warehouse-admin-shell" aria-label="Administración de bodega">
      <header className="warehouse-admin-header">
        <div>
          <span className="warehouse-admin-eyebrow">OPERACIÓN DE BODEGA</span>
          <h2>Administración de bodega</h2>
          <p>Cotizaciones de proveedores, recepciones y existencias de la bodega asignada.</p>
        </div>
        <div className="warehouse-admin-user">
          <Warehouse size={15} />
          <div>
            <strong>{state.warehouse?.location ?? `Bodega #${warehouseId ?? "—"}`}</strong>
            <span>{session?.user?.username ?? "Usuario Bodega"}</span>
          </div>
          <button type="button" onClick={loadDashboard} disabled={state.loading} aria-label="Actualizar bodega">
            <RefreshCw size={14} className={state.loading ? "is-spinning" : ""} />
          </button>
        </div>
      </header>
      {state.error && (
        <TransientMessage
          className="warehouse-admin-error"
          role="alert"
          onDismiss={() => setState((current) => ({ ...current, error: "" }))}
        >
          {state.error}
        </TransientMessage>
      )}
      {notice && (
        <TransientMessage
          className="warehouse-admin-notice"
          icon={<Check size={14} />}
          onDismiss={() => setNotice("")}
        >
          {notice}
        </TransientMessage>
      )}
      <nav className="warehouse-admin-tabs" aria-label="Operación de bodega">
        {[
          ["resumen", "Resumen", ClipboardList],
          ["cotizaciones", "Cotizaciones", FileText],
          ["pedidos", "Pedidos de la app", Bell],
          ["existencias", "Existencias", Package],
        ].map(([tab, label, Icon]) => (
          <button type="button" key={tab} className={activeTab === tab ? "is-active" : ""} onClick={() => onTabChange(tab)}>
            <Icon size={14} /> <span>{label}</span>
            {tab === "cotizaciones" && state.orders.length > 0 && <b>{state.orders.length}</b>}
            {tab === "pedidos" && state.appOrders.filter((order) => ["PENDIENTE", "EN_PREPARACION", "EN_CAMINO"].includes(order.delivery?.status)).length > 0 && <b>{state.appOrders.filter((order) => ["PENDIENTE", "EN_PREPARACION", "EN_CAMINO"].includes(order.delivery?.status)).length}</b>}
          </button>
        ))}
      </nav>
      <div className="warehouse-admin-kpis">
        <Kpi icon={ClipboardList} label="Cotizaciones pendientes" value={state.orders.length} tone="warning" />
        <Kpi icon={Bell} label="Alertas de pedidos" value={warehouseNotifications.length} tone="info" />
        <Kpi icon={Package} label="Productos bajo mínimo" value={lowStock.length} tone="danger" />
        <Kpi icon={Warehouse} label="Bodega asignada" value={state.warehouse?.location ?? `#${warehouseId ?? "—"}`} tone="success" />
      </div>
      {activeTab === "resumen" && <div className="warehouse-admin-content-grid">
        <section className={`warehouse-admin-panel ${focus === "orders" ? "is-focused" : ""}`}>
          <PanelHeading icon={ClipboardList} title="Cotizaciones de proveedor pendientes" description="Documentos programados para recepción en esta bodega." />
          {state.loading ? <LoadingState /> : state.orders.length ? (
            <div className="warehouse-admin-task-list">
              {state.orders.map((order) => (
                <div className="warehouse-admin-task-row" key={order.id}>
                  <div>
                    <strong>{order.consecutive}</strong>
                    <span>{order.provider?.name ?? "Proveedor"} · {formatDate(order.expectedAt)}</span>
                  </div>
                  <button type="button" className="primary-action" onClick={() => setReviewOrder(order)} disabled={Boolean(actionLoading)}>
                    <FileText size={13} /> Ver cotización y PDF
                  </button>
                </div>
              ))}
            </div>
          ) : <EmptyState text="No hay cotizaciones pendientes para hoy." />}
        </section>
        <section className={`warehouse-admin-panel ${["notifications", "app-orders", "quote"].includes(focus) ? "is-focused" : ""}`}>
          <PanelHeading icon={Bell} title="Notificaciones y tareas de bodega" description="Las compras ordenadas y los pedidos de la app aparecen aquí automáticamente." />
          {warehouseNotifications.length ? (
            <div className="warehouse-admin-notification-list">
              {warehouseNotifications.slice(0, 8).map((item) => (
                <button type="button" className="warehouse-admin-notification-row" key={item.id} onClick={() => onNotificationOpen?.(item)}>
                  <Bell size={14} />
                  <span><strong>{item.title}</strong><small>{item.message}</small></span>
                </button>
              ))}
            </div>
          ) : <EmptyState text="No hay notificaciones operativas pendientes." />}
          {state.appOrders.length > 0 && (
            <div className="warehouse-admin-mobile-orders">
              <strong>Pedidos de la app · operación e historial</strong>
              {state.appOrders.slice(0, 8).map((order) => (
                <div className="warehouse-admin-mobile-order" key={order.id}>
                  <span><b>{order.consecutive}</b><small>{clientLabel(order.client)} · {order.items?.length ?? 0} productos</small></span>
                  <em className={`delivery-status-${String(order.delivery?.status ?? "PENDIENTE").toLowerCase()}`}>{deliveryStatusLabel(order.delivery?.status)}</em>
                  <button type="button" onClick={() => setSelectedAppOrder(order)}>Ver pedido</button>
                </div>
              ))}
            </div>
          )}
          {state.notifications.filter((item) => item.type === "BODEGA_TAREA" && item.action?.view === "quote").length > 0 && (
            <div className="warehouse-admin-mobile-orders">
              <strong>Cotizaciones enviadas a esta operación</strong>
              {state.notifications.filter((item) => item.type === "BODEGA_TAREA" && item.action?.view === "quote").map((item) => {
                const quote = state.quotes.find((candidate) => Number(candidate.id) === Number(item.action?.entityId));
                return <button type="button" className="warehouse-admin-quote-task" key={item.id} onClick={() => quote && setReviewQuote(quote)}><FileText size={14} /><span><b>{quote?.consecutive ?? item.message.split(" · ")[0]}</b><small>{quote ? `${quote.items?.length ?? 0} productos · ${formatCurrency(quote.total)}` : item.message}</small></span><em>Ver PDF</em></button>;
              })}
            </div>
          )}
        </section>
      </div>}
      {activeTab === "cotizaciones" && <section className="warehouse-admin-panel warehouse-admin-history-panel">
        <PanelHeading icon={FileText} title="Historial de cotizaciones de proveedor" description="Consulta aprobadas, recibidas, anuladas y pendientes." />
        <div className="warehouse-admin-history-filters">
          {["TODAS", "BORRADOR", "ORDENADA", "RECIBIDA", "ANULADA"].map((status) => (
            <button type="button" key={status} className={purchaseHistoryFilter === status ? "is-active" : ""} onClick={() => setPurchaseHistoryFilter(status)}>
              {status === "TODAS" ? "Todas" : purchaseStatusLabel(status)}
            </button>
          ))}
        </div>
        {visiblePurchaseHistory.length ? (
          <div className="warehouse-admin-history-list">
            {visiblePurchaseHistory.map((order) => (
              <div className="warehouse-admin-history-row" key={order.id}>
                <div><strong>{order.consecutive}</strong><span>{order.provider?.name ?? "Proveedor"} · {order.warehouse?.location ?? "Bodega"}</span></div>
                <span>{formatCurrency(order.total)}</span>
                <b className={`purchase-status-${String(order.status ?? "").toLowerCase()}`}>{purchaseStatusLabel(order.status)}</b>
                <button type="button" onClick={() => openPurchaseOrder(order)} disabled={actionLoading === `detail-${order.id}`}><FileText size={13} /> Ver detalle</button>
              </div>
            ))}
          </div>
        ) : <EmptyState text="No hay cotizaciones para este filtro." />}
      </section>}
      {activeTab === "pedidos" && <section className="warehouse-admin-panel warehouse-admin-app-orders-panel">
        <PanelHeading icon={Bell} title="Pedidos de la app" description="Consulta el pedido completo y actualiza su estado operativo." />
        {state.appOrders.length ? <div className="warehouse-admin-app-orders-grid">{state.appOrders.map((order) => <div className="warehouse-admin-app-order-card" key={order.id}>
          <div><strong>{order.consecutive}</strong><span>{clientLabel(order.client)} · {order.items?.length ?? 0} productos</span></div>
          <b className={`delivery-status-badge delivery-status-${String(order.delivery?.status ?? "PENDIENTE").toLowerCase()}`}>{deliveryStatusLabel(order.delivery?.status)}</b>
          <small>{order.delivery?.address ?? "Sin dirección de entrega"}</small>
          <button type="button" onClick={() => setSelectedAppOrder(order)}>Ver información y editar estado</button>
        </div>)}</div> : <EmptyState text="No hay pedidos registrados de la app." />}
      </section>}
      {activeTab === "existencias" && <section className="warehouse-admin-panel warehouse-admin-inventory-panel">
        <PanelHeading icon={Package} title="Existencias de mi bodega" description="Consulta rápida para preparar pedidos y detectar faltantes." />
        {state.loading ? <LoadingState /> : state.inventory.length ? (
          <div className="warehouse-admin-inventory-table">
            <div className="warehouse-admin-inventory-head"><span>Producto</span><span>Existencia</span><span>Mínimo</span><span>Estado</span></div>
            {state.inventory.map((row) => {
              const minimum = Number(row.product?.minimumStock ?? 0);
              const quantity = Number(row.quantity ?? 0);
              const isLow = quantity <= minimum;
              return <div className="warehouse-admin-inventory-row" key={`${row.productId}-${row.warehouseId}`}><strong>{row.product?.name ?? `Producto #${row.productId}`}</strong><span>{quantity}</span><span>{minimum}</span><b className={isLow ? "is-low" : "is-ok"}>{isLow ? "Revisar" : "Disponible"}</b></div>;
            })}
          </div>
        ) : <EmptyState text="No hay existencias registradas en esta bodega." />}
      </section>}
      {reviewOrder && (
        <WarehousePurchaseReviewDialog
          order={reviewOrder}
          canReceive={reviewOrder.status === "ORDENADA"}
          busy={actionLoading === `receive-${reviewOrder.id}`}
          onPrint={() => window.print()}
          onClose={() => setReviewOrder(null)}
          onReceive={async () => {
            setReviewOrder(null);
            await receiveOrder(reviewOrder);
          }}
        />
      )}
      {reviewQuote && (
        <WarehouseQuoteReviewDialog
          quote={reviewQuote}
          onPrint={() => window.print()}
          onClose={() => setReviewQuote(null)}
        />
      )}
      {selectedAppOrder && (
        <WarehouseAppOrderDialog
          order={selectedAppOrder}
          busy={actionLoading.startsWith("delivery-")}
          onClose={() => setSelectedAppOrder(null)}
          onUpdateStatus={(status) => updateAppOrderStatus(selectedAppOrder, status)}
        />
      )}
    </section>
  );
}

function Kpi({ icon: Icon, label, value, tone }) {
  return <article className={`warehouse-admin-kpi ${tone}`}><span><Icon size={15} /> {label}</span><strong>{value}</strong></article>;
}

function PanelHeading({ icon: Icon, title, description }) {
  return <div className="warehouse-admin-panel-heading"><div><Icon size={16} /><div><strong>{title}</strong><span>{description}</span></div></div></div>;
}

function LoadingState() {
  return <div className="warehouse-admin-state"><LoaderCircle size={20} className="is-spinning" /> Cargando operación…</div>;
}

function EmptyState({ text }) {
  return <div className="warehouse-admin-state">{text}</div>;
}

function WarehousePurchaseReviewDialog({ order, canReceive, busy, onPrint, onClose, onReceive }) {
  return (
    <div className="warehouse-review-backdrop" role="presentation">
      <div className="warehouse-review-dialog" role="dialog" aria-modal="true" aria-label="Revisar orden de compra">
        <header><div><strong>{order.consecutive}</strong><span>Cotización de proveedor · {order.provider?.name ?? "Proveedor"}</span></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></header>
        <div className="warehouse-review-heading"><FileText size={18} /><div><strong>Cotización / orden de compra al proveedor</strong><span>Esta es la misma información creada en Compras. {canReceive ? "Revisa el documento antes de recibirlo en la bodega." : "Consulta histórica: la recepción ya fue procesada o la orden no está disponible para recibir."}</span></div></div>
        <div className="warehouse-review-meta">
          <div><span>Proveedor</span><strong>{order.provider?.name ?? "Sin proveedor"}</strong></div>
          <div><span>Referencia del proveedor</span><strong>{order.externalReference ?? "Sin referencia"}</strong></div>
          <div><span>Bodega destino</span><strong>{order.warehouse?.location ?? "Bodega asignada"}</strong></div>
          <div><span>Entrega prevista</span><strong>{formatDate(order.expectedAt)}</strong></div>
        </div>
        <div className="warehouse-review-items"><div className="warehouse-review-item-head"><span>Producto</span><span>Cantidad</span><span>Costo unitario</span><span>Total</span></div>{(order.items ?? []).map((item) => <div className="warehouse-review-item" key={item.id}><strong>{item.product?.name ?? `Producto #${item.productId}`}</strong><span>{item.quantity} {item.unit ?? "UND"}<small> · recibido {item.receivedQuantity ?? 0}</small></span><span>{formatCurrency(item.unitCost)}</span><b>{formatCurrency(item.total)}</b></div>)}</div>
        <div className="warehouse-review-totals"><span>Subtotal <b>{formatCurrency(order.subtotal)}</b></span><span>Impuestos <b>{formatCurrency(order.taxes)}</b></span><strong>Total <b>{formatCurrency(order.total)}</b></strong></div>
        {order.notes && <div className="warehouse-review-note">{order.notes}</div>}
        <footer><button type="button" onClick={onPrint}><Printer size={13} /> Ver / imprimir PDF de cotización</button><button type="button" onClick={onClose}>Cerrar</button>{canReceive && <button type="button" className="primary-action" disabled={busy} onClick={onReceive}><Check size={13} /> {busy ? "Recibiendo…" : "Confirmar recepción"}</button>}</footer>
      </div>
    </div>
  );
}

function WarehouseAppOrderDialog({ order, busy, onClose, onUpdateStatus }) {
  const delivery = order.delivery;
  const currentStatus = delivery?.status ?? "PENDIENTE";
  return (
    <div className="warehouse-review-backdrop" role="presentation">
      <div className="warehouse-review-dialog warehouse-app-order-dialog" role="dialog" aria-modal="true" aria-label="Detalle del pedido de la app">
        <header><div><strong>{order.consecutive}</strong><span>Pedido de la app · {clientLabel(order.client)}</span></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></header>
        <div className="warehouse-review-heading"><Package size={18} /><div><strong>Información del pedido</strong><span>Consulta lo solicitado y actualiza el estado operativo desde esta misma pantalla.</span></div></div>
        <div className="warehouse-review-meta">
          <div><span>Cliente</span><strong>{clientLabel(order.client)}</strong></div>
          <div><span>Teléfono</span><strong>{delivery?.recipientPhone ?? order.client?.phone ?? "Sin teléfono"}</strong></div>
          <div><span>Dirección</span><strong>{delivery?.address ?? order.client?.address ?? "Sin dirección"}</strong></div>
          <div><span>Estado actual</span><strong>{deliveryStatusLabel(currentStatus)}</strong></div>
        </div>
        <div className="warehouse-app-order-notes">{delivery?.notes ? `Nota de entrega: ${delivery.notes}` : "Sin notas adicionales del cliente."}</div>
        <div className="warehouse-review-items"><div className="warehouse-review-item-head"><span>Producto</span><span>Cantidad</span><span>Precio</span><span>Total</span></div>{(order.items ?? []).map((item) => <div className="warehouse-review-item" key={item.id}><strong>{item.product?.name ?? `Producto #${item.productId}`}</strong><span>{item.quantity}</span><span>{formatCurrency(item.unitPrice)}</span><b>{formatCurrency(item.total)}</b></div>)}</div>
        <div className="warehouse-review-totals"><span>Subtotal <b>{formatCurrency(order.subtotal)}</b></span><span>Impuestos <b>{formatCurrency(order.taxes)}</b></span><strong>Total <b>{formatCurrency(order.total)}</b></strong></div>
        <footer className="warehouse-app-order-actions"><span>Actualizar estado</span>{deliveryStatusOptions.map((status) => <button type="button" key={status} className={status === currentStatus ? "is-selected" : ""} disabled={busy || status === currentStatus} onClick={() => onUpdateStatus(status)}>{deliveryStatusLabel(status)}</button>)}<button type="button" onClick={onClose}>Cerrar</button></footer>
      </div>
    </div>
  );
}

function WarehouseQuoteReviewDialog({ quote, onPrint, onClose }) {
  return (
    <div className="sales-dialog-backdrop" role="presentation">
      <div className="sales-document-dialog" role="dialog" aria-modal="true" aria-label="Cotización recibida">
        <header>
          <strong>{quote.consecutive ?? "Presupuesto"}</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle">
            <X size={15} />
          </button>
        </header>
        <div className="sales-document-summary">
          <div>
            <span>Cliente</span>
            <strong>{clientLabel(quote.client)}</strong>
          </div>
          <div>
            <span>Fecha</span>
            <strong>{formatDate(quote.createdAt)}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatCurrency(quote.total)}</strong>
          </div>
        </div>
        <div className="sales-detail-items">
          {(quote.items ?? []).length ? (
            quote.items.map((item) => (
              <div key={item.id ?? `${item.productId}-${item.quantity}`}>
                <span>{item.product?.name ?? `Producto #${item.productId}`}</span>
                <span>{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                <strong>{formatCurrency(item.total)}</strong>
              </div>
            ))
          ) : (
            <div className="table-empty">Este documento no tiene líneas para mostrar.</div>
          )}
        </div>
        <footer>
          <button type="button" className="primary-action" onClick={onPrint}>
            <Printer size={13} /> Exportar PDF
          </button>
          <button type="button" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </div>
  );
}

function unwrapData(payload) {
  return Array.isArray(payload) ? payload : payload?.data ?? [];
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function clientLabel(client) {
  if (!client) return "Cliente sin nombre";
  return client.name ?? ([client.firstName, client.lastName].filter(Boolean).join(" ") || `Cliente #${client.id}`);
}

const deliveryStatusOptions = ["PENDIENTE", "EN_PREPARACION", "EN_CAMINO", "ENTREGADO", "CANCELADO"];

function deliveryStatusLabel(status) {
  return {
    PENDIENTE: "Pendiente",
    EN_PREPARACION: "En preparación",
    EN_CAMINO: "En camino",
    ENTREGADO: "Entregado",
    CANCELADO: "Cancelado",
  }[status] ?? status ?? "Pendiente";
}

function purchaseStatusLabel(status) {
  return {
    BORRADOR: "Borrador",
    ORDENADA: "Aprobada / enviada",
    RECIBIDA: "Recibida",
    ANULADA: "Anulada",
  }[status] ?? status ?? "Sin estado";
}
