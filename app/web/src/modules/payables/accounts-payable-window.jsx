import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FileText,
  PackagePlus,
  Plus,
  Search,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { apiClient } from "@/lib/api-client";

const tabs = [
  ["operations", "Operaciones"],
  ["statement", "Estado de cuenta"],
  ["pending", "Pendiente"],
  ["due", "Vencimientos"],
];

const statusLabels = {
  BORRADOR: "Borrador",
  ORDENADA: "Ordenada",
  RECIBIDA: "Recibida",
  ANULADA: "Anulada",
};

function emptyPurchaseItem(productId = "") {
  return {
    productId: String(productId),
    quantity: "1",
    unitCost: "",
    taxRate: "0",
  };
}

function emptyOrder(providerId = "", warehouseId = "", productId = "") {
  return {
    providerId: String(providerId),
    warehouseId: String(warehouseId),
    items: [emptyPurchaseItem(productId)],
    orderedAt: todayValue(),
    expectedAt: "",
    externalReference: "",
    notes: "",
  };
}

export function AccountsPayableWindow({ onClose, onRequestLogin, canAccess }) {
  const [providers, setProviders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("operations");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderEditor, setOrderEditor] = useState(null);
  const [loadingOrderId, setLoadingOrderId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paymentEditor, setPaymentEditor] = useState(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      apiClient.getAllPages("/proveedores", { estado: "todos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
      apiClient.getAllPages("/productos", { estado: "activos" }),
      apiClient.getAllPages("/compras"),
      apiClient.getAllPages("/cuentas-bancarias", { estado: "activos" }),
    ])
      .then(
        ( [
          providersResult,
          warehousesResult,
          productsResult,
          ordersResult,
          bankAccountsResult,
        ]) => {
          if (cancelled) return;
          if (providersResult.status === "rejected")
            throw providersResult.reason;

          const providerItems = providersResult.value;
          const warehouseItems =
            warehousesResult.status === "fulfilled"
              ? warehousesResult.value
              : [];
          const productItems =
            productsResult.status === "fulfilled" ? productsResult.value : [];
          const orderItems =
            ordersResult.status === "fulfilled" ? ordersResult.value : [];
          const bankItems =
            bankAccountsResult.status === "fulfilled"
              ? bankAccountsResult.value
              : [];
          const nextProviders = providerItems.map(mapProvider);
          setProviders(nextProviders);
          setWarehouses(warehouseItems);
          setProducts(productItems);
          setBankAccounts(bankItems);
          setOrders(orderItems);
          setSelectedProviderId(nextProviders[0]?.id ?? null);
          const unavailable = [
            warehousesResult.status === "rejected" ? "bodegas" : null,
            productsResult.status === "rejected" ? "productos" : null,
            ordersResult.status === "rejected" ? "compras" : null,
            bankAccountsResult.status === "rejected"
              ? "cuentas bancarias"
              : null,
          ].filter(Boolean);
          if (unavailable.length) {
            setError(
              `Proveedores cargados, pero no se pudieron consultar: ${unavailable.join(", ")}.`,
            );
            const failedResult = [
              warehousesResult,
              productsResult,
              ordersResult,
            ].find((result) => result.status === "rejected");
            if (isAuthError(failedResult?.reason)) onRequestLogin?.();
          }
        },
      )
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError.message);
        if (isAuthError(requestError)) onRequestLogin?.();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onRequestLogin]);

  const filteredProviders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return providers;
    return providers.filter((provider) =>
      `${provider.name} ${provider.taxId}`.toLowerCase().includes(query),
    );
  }, [providers, searchTerm]);

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const selectedProviderIndex = filteredProviders.findIndex(
    (provider) => provider.id === selectedProviderId,
  );
  const canMovePrevious = selectedProviderIndex > 0;
  const canMoveNext =
    selectedProviderIndex >= 0 &&
    selectedProviderIndex < filteredProviders.length - 1;
  const canEdit =
    (canAccess?.("PAYABLES_EDIT") ?? true) &&
    (canAccess?.("PURCHASES_EDIT") ?? true);
  const allProviderOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          !selectedProviderId ||
          Number(order.providerId) === selectedProviderId,
      ),
    [orders, selectedProviderId],
  );
  const providerTotal = allProviderOrders
    .filter((order) => order.status === "RECIBIDA")
    .reduce((sum, order) => sum + orderBalance(order), 0);

  function selectProvider(id) {
    setSelectedProviderId(id);
    setOrderEditor(null);
    setError("");
  }

  function selectPayableView(tab, nextFilter = "TODOS") {
    setActiveTab(tab);
    setStatusFilter(nextFilter);
    setError("");
  }

  function startNewOrder() {
    if (!canEdit) return;
    const firstProduct = products.find((product) =>
      productBelongsToProvider(product, selectedProviderId),
    );
    setOrderEditor(
      emptyOrder(
        selectedProviderId ?? "",
        warehouses[0]?.id ?? "",
        firstProduct?.id ?? "",
      ),
    );
    setError("");
  }

  function startPayment(order = null) {
    if (!canEdit) return;
    const target =
      order ??
      allProviderOrders.find(
        (item) => item.status === "RECIBIDA" && orderBalance(item) > 0,
      );
    if (!target) {
      setError("Selecciona una compra recibida con saldo pendiente para pagarla.");
      return;
    }
    if (!bankAccounts.length) {
      setError("Crea una cuenta bancaria activa antes de registrar un pago.");
      return;
    }
    setPaymentEditor({
      purchaseOrderId: String(target.id),
      amount: String(orderBalance(target)),
      bankAccountId: String(bankAccounts[0]?.id ?? ""),
      notes: "",
    });
    setError("");
  }

  async function savePayment() {
    if (!canEdit || !paymentEditor) return;
    const target = orders.find(
      (order) => String(order.id) === String(paymentEditor.purchaseOrderId),
    );
    const amount = Number(paymentEditor.amount);
    if (!target || !Number.isFinite(amount) || amount <= 0 || amount > orderBalance(target)) {
      setError("Ingresa un pago válido que no supere el saldo pendiente.");
      return;
    }
    if (!paymentEditor.bankAccountId) {
      setError("Selecciona la cuenta bancaria desde la que se realizará el pago.");
      return;
    }
    setPaymentSaving(true);
    setError("");
    try {
      const saved = await apiClient.post(
        `/compras/${paymentEditor.purchaseOrderId}/pagos`,
        {
          amount,
          bankAccountId: paymentEditor.bankAccountId
            ? Number(paymentEditor.bankAccountId)
            : undefined,
          notes: paymentEditor.notes?.trim() || undefined,
        },
      );
      setOrders((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setPaymentEditor(null);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setPaymentSaving(false);
    }
  }

  async function startEditOrder(order) {
    if (!canEdit) return;
    if (order.status !== "BORRADOR") return;
    setLoadingOrderId(order.id);
    setError("");
    try {
      const detail = await apiClient.get(`/compras/${order.id}`);
      setOrderEditor(toPurchaseEditor(detail));
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setLoadingOrderId(null);
    }
  }

  function updateEditor(field, value) {
    setOrderEditor((current) => ({ ...current, [field]: value }));
  }

  function updatePaymentEditor(field, value) {
    setPaymentEditor((current) => ({ ...current, [field]: value }));
  }

  function updateOrderProvider(value) {
    setOrderEditor((current) => ({
      ...current,
      providerId: value,
      items: current.items.map((item) => {
        const product = products.find(
          (candidate) => Number(candidate.id) === Number(item.productId),
        );
        return productBelongsToProvider(product, Number(value))
          ? item
          : { ...item, productId: "" };
      }),
    }));
  }

  function updateOrderItem(index, field, value) {
    setOrderEditor((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function addOrderItem() {
    setOrderEditor((current) => ({
      ...current,
      items: [...current.items, emptyPurchaseItem()],
    }));
  }

  function removeOrderItem(index) {
    setOrderEditor((current) => ({
      ...current,
      items:
        current.items.length > 1
          ? current.items.filter((_, itemIndex) => itemIndex !== index)
          : current.items,
    }));
  }

  async function saveOrder() {
    if (!canEdit) return;
    if (!orderEditor) return;
    const body = buildOrderBody(orderEditor);
    if (
      !body.providerId ||
      !body.warehouseId ||
      !body.items.length ||
      body.items.some(
        (item) =>
          !item.productId ||
          !Number.isFinite(item.quantity) ||
          !Number.isFinite(item.unitCost) ||
          item.quantity <= 0 ||
          item.unitCost <= 0,
      )
    ) {
      setError(
        "Completa proveedor, bodega, productos, cantidades y costos válidos.",
      );
      return;
    }
    if (
      new Set(body.items.map((item) => item.productId)).size !==
      body.items.length
    ) {
      setError("Cada producto debe aparecer una sola vez en la compra.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = orderEditor.id
        ? await apiClient.patch(`/compras/${orderEditor.id}`, body)
        : await apiClient.post("/compras", body);
      setOrders((current) => {
        const normalized = saved;
        return orderEditor.id
          ? current.map((order) => (order.id === saved.id ? normalized : order))
          : [normalized, ...current];
      });
      setSelectedProviderId(Number(saved.providerId));
      setOrderEditor(null);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  async function transitionOrder(order, action, confirmation) {
    if (!canEdit) return;
    if (!window.confirm(confirmation)) return;
    try {
      const saved =
        action === "cancel"
          ? await apiClient.patch(`/compras/${order.id}/anular`, {})
          : await apiClient.post(`/compras/${order.id}/${action}`, {});
      setOrders((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    }
  }

  function moveProvider(offset) {
    const index = filteredProviders.findIndex(
      (provider) => provider.id === selectedProviderId,
    );
    const next = filteredProviders[index + offset];
    if (next) selectProvider(next.id);
  }

  return (
    <section
      className={`provider-window payable-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Ventana de cuentas por pagar"
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle payable-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <FileText size={14} />
        </div>
        <strong>CUENTAS POR PAGAR</strong>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar cuentas por pagar"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content payable-content">
        <aside className="provider-list-panel">
          <div className="provider-list-toolbar">
            <label htmlFor="payable-provider-search">Buscar</label>
            <div className="provider-search-field">
              <Search size={15} />
              <input
                id="payable-provider-search"
                aria-label="Buscar proveedor"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="search-options"
              aria-label="Opciones de búsqueda"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <div
            className="provider-table payable-provider-table"
            role="table"
            aria-label="Proveedores con cuentas por pagar"
          >
            <div className="provider-table-head" role="row">
              <span>Código</span>
              <span>Proveedor</span>
            </div>
            {filteredProviders.map((provider) => (
              <button
                className={
                  provider.id === selectedProviderId
                    ? "provider-table-row is-selected"
                    : "provider-table-row"
                }
                type="button"
                role="row"
                key={provider.id}
                onClick={() => selectProvider(provider.id)}
              >
                <span>{provider.code}</span>
                <span>{provider.name}</span>
              </button>
            ))}
            {loading && <div className="window-state">Cargando cuentas…</div>}
            {!loading && !filteredProviders.length && (
              <div className="window-state">
                No hay proveedores para mostrar.
              </div>
            )}
            <div className="provider-empty-rows" aria-hidden="true">
              {Array.from({
                length: Math.max(0, 9 - filteredProviders.length),
              }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
        </aside>
        <div className="provider-detail-panel payable-detail-panel">
          <div className="payable-heading">
            <div>
              <strong>
                {selectedProvider?.taxId ?? "Sin proveedor seleccionado"}{" "}
                {selectedProvider?.name ?? ""}
              </strong>
              <span>
                {selectedProvider?.phone ??
                  "Consulta y administra las obligaciones de compra de este proveedor."}
              </span>
            </div>
            <div className="payable-balance-grid">
              <BalanceField label="Saldo anticipos" value={0} muted />
              <BalanceField label="Saldo" value={providerTotal} accent />
            </div>
          </div>
          <div className="provider-tabs payable-tabs">
            {tabs.map(([id, label]) => (
              <button
                className={
                  activeTab === id ? "provider-tab is-active" : "provider-tab"
                }
                type="button"
                key={id}
                onClick={() => {
                  setActiveTab(id);
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {activeTab === "operations" ? (
            <OperationsPanel
              onNewOrder={startNewOrder}
              onPayment={startPayment}
              onSelectView={selectPayableView}
              canEdit={canEdit}
              hasPayable={allProviderOrders.some(
                (order) => order.status === "RECIBIDA" && orderBalance(order) > 0,
              )}
            />
          ) : (
            <AccountStatementPanel
              activeTab={activeTab}
              orders={allProviderOrders}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              onEdit={startEditOrder}
              onPayment={startPayment}
              onTransition={transitionOrder}
              loadingOrderId={loadingOrderId}
              canEdit={canEdit}
            />
          )}
          {orderEditor && (
            <PurchaseEditor
              editor={orderEditor}
              providers={providers}
              warehouses={warehouses}
              products={products}
              saving={saving}
              onChange={updateEditor}
              onProviderChange={updateOrderProvider}
              onItemChange={updateOrderItem}
              onAddItem={addOrderItem}
              onRemoveItem={removeOrderItem}
              onSave={saveOrder}
              onCancel={() => {
                setOrderEditor(null);
                setError("");
              }}
            />
          )}
          {paymentEditor && (
            <PurchasePaymentEditor
              editor={paymentEditor}
              orders={allProviderOrders}
              bankAccounts={bankAccounts}
              saving={paymentSaving}
              onChange={updatePaymentEditor}
              onSave={savePayment}
              onCancel={() => {
                setPaymentEditor(null);
                setError("");
              }}
            />
          )}
        </div>
      </div>
      {error && (
        <div className="window-error" role="alert">
          {error}
        </div>
      )}
      <footer className="provider-window-footer">
        <div className="provider-crud-actions">
          <button
            type="button"
            onClick={startNewOrder}
            disabled={!canEdit}
          >
            <Plus size={14} /> Nueva compra
          </button>
          <button
            type="button"
            onClick={() => startPayment()}
            disabled={
              !canEdit ||
              !allProviderOrders.some(
                (order) => order.status === "RECIBIDA" && orderBalance(order) > 0,
              )
            }
          >
            <Check size={14} /> Registrar pago
          </button>
        </div>
        <div className="provider-navigation-actions">
          <button
            type="button"
            className="muted-action"
            onClick={() => moveProvider(-1)}
            disabled={!canMovePrevious}
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <button
            type="button"
            className="muted-action"
            onClick={() => moveProvider(1)}
            disabled={!canMoveNext}
          >
            Próximo <ChevronRight size={14} />
          </button>
          <button type="button" className="exit-action" onClick={onClose}>
            <CircleX size={14} /> Salir
          </button>
        </div>
      </footer>
    </section>
  );
}

function OperationsPanel({
  onNewOrder,
  onPayment,
  onSelectView,
  canEdit,
  hasPayable,
}) {
  const operations = [
    [
      "Facturas",
      FileText,
      () => onSelectView("statement", "RECIBIDA"),
      "Ver compras recibidas",
    ],
    [
      "Giros o cuotas",
      CalendarDays,
      () => onSelectView("pending", "ORDENADA"),
      "Revisar órdenes por gestionar",
    ],
    [
      "Notas de débito",
      FileText,
      () => onSelectView("statement", "TODOS"),
      "Consultar movimientos de compra",
    ],
    [
      "Pagos y abonos",
      Check,
      onPayment,
      "Registrar un pago de esta compra",
      true,
      true,
    ],
    [
      "Notas débito / Anticipos",
      PackagePlus,
      () => onSelectView("due", "TODOS"),
      "Revisar obligaciones abiertas",
    ],
    [
      "Notas de crédito",
      FileText,
      () => onSelectView("statement", "ANULADA"),
      "Consultar documentos anulados",
    ],
    ["Nueva compra", Plus, onNewOrder, "Registrar una nueva compra", true],
    [
      "Anular compra",
      CircleX,
      () => onSelectView("pending", "TODOS"),
      "Selecciona una orden para anularla",
    ],
  ];
  return (
    <div className="provider-tab-panel payable-operations-panel">
      <div className="payable-section-heading">
        <strong>Operaciones a realizar</strong>
        <span>
          Accesos rápidos conectados a las órdenes de compra disponibles.
        </span>
      </div>
      <div className="payable-operation-grid">
        {operations.map(
          ([
            label,
            Icon,
            onClick,
            description,
            requiresEdit = false,
            requiresPayable = false,
          ]) => (
            <button
              type="button"
              className="payable-operation-card"
              key={label}
              onClick={onClick}
              disabled={
                (requiresEdit && !canEdit) ||
                (requiresPayable && !hasPayable)
              }
            >
              <span className="payable-operation-icon">
                <Icon size={15} />
              </span>
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function AccountStatementPanel({
  activeTab,
  orders,
  statusFilter,
  onStatusFilter,
  onEdit,
  onPayment,
  onTransition,
  loadingOrderId,
  canEdit,
}) {
  if (activeTab === "due") {
    const openOrders = orders.filter(
      (order) => order.status === "RECIBIDA" && orderBalance(order) > 0,
    );
    const overdueOrders = openOrders.filter(
      (order) => getDueBucket(order) === "overdue",
    );
    const upcomingOrders = openOrders.filter(
      (order) => getDueBucket(order) === "upcoming",
    );
    const noDateOrders = openOrders.filter(
      (order) => getDueBucket(order) === "no-date",
    );
    const overdueTotal = sumOrderTotals(overdueOrders);
    const upcomingTotal = sumOrderTotals(upcomingOrders);
    const noDateTotal = sumOrderTotals(noDateOrders);
    const maxAmount = Math.max(
      ...openOrders.map((order) => orderBalance(order)),
      0,
    );
    return (
      <div className="provider-tab-panel payable-aging-panel">
        <div className="payable-section-heading">
          <strong>Análisis de vencimientos</strong>
          <span>Obligaciones abiertas agrupadas por fecha de vencimiento.</span>
        </div>
        <div className="payable-aging-grid">
          <AgingSummaryCard
            className="is-overdue"
            label="Vencido"
            value={overdueTotal}
            count={overdueOrders.length}
          />
          <AgingSummaryCard
            className="is-upcoming"
            label="Por vencer"
            value={upcomingTotal}
            count={upcomingOrders.length}
          />
          <AgingSummaryCard
            className="is-no-date"
            label="Sin fecha"
            value={noDateTotal}
            count={noDateOrders.length}
          />
        </div>
        <div className="payable-chart">
          <div className="payable-chart-heading">
            <strong>Obligaciones abiertas por documento</strong>
            <span>{formatCurrency(sumOrderTotals(openOrders))} en total</span>
          </div>
          {openOrders.length ? (
            [...openOrders]
              .sort(
                (left, right) =>
                  Number(right.total ?? 0) - Number(left.total ?? 0),
              )
              .map((order) => {
                const bucket = getDueBucket(order);
                const amount = orderBalance(order);
                return (
                  <div className="payable-chart-row" key={order.id}>
                    <div className="payable-chart-label">
                      <strong>{order.consecutive ?? `OC-${order.id}`}</strong>
                      <span>
                        {getDueLabel(order)} · {statusLabels[order.status]}
                      </span>
                    </div>
                    <div className="payable-chart-track">
                      <span
                        className={`is-${bucket}`}
                        style={{
                          width: `${maxAmount ? Math.max(8, (amount / maxAmount) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <strong className="payable-chart-amount">
                      {formatCurrency(amount)}
                    </strong>
                  </div>
                );
              })
          ) : (
            <div className="table-empty">No hay obligaciones abiertas.</div>
          )}
        </div>
      </div>
    );
  }

  const tabOrders =
    activeTab === "pending"
      ? orders.filter((order) =>
          ["BORRADOR", "ORDENADA"].includes(order.status),
        )
      : orders;
  const visibleOrders = tabOrders.filter(
    (order) => statusFilter === "TODOS" || order.status === statusFilter,
  );

  return (
    <div className="provider-tab-panel data-panel payable-statement-panel">
      <div className="payable-filter-row">
        <label>Movimientos</label>
        <select
          value={statusFilter}
          onChange={(event) => onStatusFilter(event.target.value)}
        >
          <option value="TODOS">Todos</option>
          {Object.keys(statusLabels).map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
        <span>
          {activeTab === "pending"
            ? "Pendientes de gestionar"
            : "Órdenes y documentos de compra"}
        </span>
      </div>
      <div className="provider-data-table-wrap">
        <div className="provider-table-caption">
          {activeTab === "pending" ? "Pendientes" : "Estado de cuenta"} · doble
          clic para editar borradores{canEdit ? "" : " (solo lectura)"}
        </div>
        {visibleOrders.length ? (
          <table className="provider-data-table payable-data-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Estado</th>
                <th>Emisión</th>
                <th>Débitos</th>
                <th>Créditos</th>
                <th>Saldo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr
                  key={order.id}
                  onDoubleClick={
                    canEdit && loadingOrderId !== order.id
                      ? () => onEdit(order)
                      : undefined
                  }
                  title={
                    loadingOrderId === order.id
                      ? "Cargando detalle de la compra…"
                      : order.status === "BORRADOR"
                        ? "Doble clic para editar"
                        : undefined
                  }
                >
                  <td>{order.consecutive ?? `OC-${order.id}`}</td>
                  <td>
                    <span
                      className={`status-pill status-${String(order.status).toLowerCase()}`}
                    >
                      {statusLabels[order.status] ?? order.status}
                    </span>
                  </td>
                  <td>{formatDate(order.orderedAt)}</td>
                  <td>
                    {order.status === "ANULADA"
                      ? "—"
                      : formatCurrency(order.total)}
                  </td>
                  <td>
                    {order.status !== "ANULADA" && orderPaidAmount(order) > 0
                      ? formatCurrency(orderPaidAmount(order))
                      : "—"}
                  </td>
                  <td>
                    {formatCurrency(orderBalance(order))}
                  </td>
                  <td>
                    <div className="table-action-group">
                      {order.status === "BORRADOR" && (
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            onTransition(
                              order,
                              "ordenar",
                              "¿Deseas ordenar esta compra?",
                            )
                          }
                        >
                          Ordenar
                        </button>
                      )}
                      {order.status === "ORDENADA" && (
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            onTransition(
                              order,
                              "recibir",
                              "¿Deseas recibir esta compra y actualizar inventario?",
                            )
                          }
                        >
                          Recibir
                        </button>
                      )}
                      {order.status === "RECIBIDA" && orderBalance(order) > 0 && (
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => onPayment(order)}
                        >
                          Pagar
                        </button>
                      )}
                      {order.status !== "ANULADA" &&
                        order.status !== "RECIBIDA" && (
                          <button
                            type="button"
                            className="danger-text-button"
                            disabled={!canEdit}
                            onClick={() =>
                              onTransition(
                                order,
                                "cancel",
                                "¿Deseas anular esta compra?",
                              )
                            }
                          >
                            Anular
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="table-empty">
            No hay movimientos para este filtro.
          </div>
        )}
      </div>
    </div>
  );
}

function PurchaseEditor({
  editor,
  providers,
  warehouses,
  products,
  saving,
  onChange,
  onProviderChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
  onSave,
  onCancel,
}) {
  const availableProducts = products.filter((product) =>
    productBelongsToProvider(product, Number(editor.providerId)),
  );
  const subtotal = editor.items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
    0,
  );
  const total = editor.items.reduce((sum, item) => {
    const itemSubtotal =
      Number(item.quantity || 0) * Number(item.unitCost || 0);
    return sum + itemSubtotal * (1 + Number(item.taxRate || 0) / 100);
  }, 0);
  return (
    <div className="payable-editor-backdrop">
      <div
        className="payable-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Editor de compra"
      >
        <header className="inline-editor-title">
          <strong>{editor.id ? "Modificar compra" : "Nueva compra"}</strong>
          <button type="button" onClick={onCancel} aria-label="Cerrar editor">
            <X size={14} />
          </button>
        </header>
        <div className="payable-editor-grid">
          <EditorSelect
            label="Proveedor"
            value={editor.providerId}
            options={providers.map((item) => ({
              value: String(item.id),
              label: item.name,
            }))}
            onChange={onProviderChange}
          />
          <EditorSelect
            label="Bodega"
            value={editor.warehouseId}
            options={warehouses.map((item) => ({
              value: String(item.id),
              label: item.location,
            }))}
            onChange={(value) => onChange("warehouseId", value)}
          />
          <div className="purchase-items-editor editor-field-wide">
            <div className="purchase-items-heading">
              <span>Productos de la compra</span>
              <button type="button" onClick={onAddItem}>
                <Plus size={13} /> Agregar producto
              </button>
            </div>
            <div className="purchase-items-list">
              {editor.items.map((item, index) => (
                <div className="purchase-item-row" key={`purchase-item-${index}`}>
                  <EditorSelect
                    label={`Producto ${index + 1}`}
                    value={item.productId}
                    options={availableProducts
                      .filter(
                        (product) =>
                          Number(product.id) === Number(item.productId) ||
                          !editor.items.some(
                            (otherItem, otherIndex) =>
                              otherIndex !== index &&
                              Number(otherItem.productId) === Number(product.id),
                          ),
                      )
                      .map((product) => ({
                        value: String(product.id),
                        label: `${product.code ?? product.id} · ${product.name}`,
                      }))}
                    onChange={(value) =>
                      onItemChange(index, "productId", value)
                    }
                  />
                  <EditorField
                    label="Cantidad"
                    value={item.quantity}
                    type="number"
                    onChange={(value) =>
                      onItemChange(index, "quantity", value)
                    }
                  />
                  <EditorField
                    label="Costo unitario"
                    value={item.unitCost}
                    type="number"
                    onChange={(value) =>
                      onItemChange(index, "unitCost", value)
                    }
                  />
                  <EditorField
                    label="Impuesto %"
                    value={item.taxRate}
                    type="number"
                    onChange={(value) =>
                      onItemChange(index, "taxRate", value)
                    }
                  />
                  <button
                    type="button"
                    className="purchase-item-remove"
                    onClick={() => onRemoveItem(index)}
                    disabled={editor.items.length === 1}
                    aria-label={`Quitar producto ${index + 1}`}
                    title="Quitar producto"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <EditorField
            label="Fecha emisión"
            value={editor.orderedAt}
            type="date"
            onChange={(value) => onChange("orderedAt", value)}
          />
          <EditorField
            label="Vencimiento"
            value={editor.expectedAt}
            type="date"
            onChange={(value) => onChange("expectedAt", value)}
          />
          <EditorField
            label="Referencia externa"
            value={editor.externalReference}
            onChange={(value) => onChange("externalReference", value)}
            wide
          />
          <label className="payable-notes-field">
            <span>Comentarios</span>
            <textarea
              value={editor.notes}
              onChange={(event) => onChange("notes", event.target.value)}
            />
          </label>
        </div>
        <div className="payable-editor-total">
          <span>Subtotal · Total estimado</span>
          <strong>
            {formatCurrency(subtotal)} · {formatCurrency(total)}
          </strong>
        </div>
        <div className="inline-editor-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? (
              "Guardando…"
            ) : (
              <>
                <Check size={13} /> Guardar borrador
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurchasePaymentEditor({
  editor,
  orders,
  bankAccounts,
  saving,
  onChange,
  onSave,
  onCancel,
}) {
  const payableOrders = orders.filter(
    (order) => order.status === "RECIBIDA" && orderBalance(order) > 0,
  );
  const selectedOrder = payableOrders.find(
    (order) => String(order.id) === String(editor.purchaseOrderId),
  );
  return (
    <div className="payable-editor-backdrop">
      <div
        className="payable-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Registrar pago a proveedor"
      >
        <header className="inline-editor-title">
          <strong>Registrar pago a proveedor</strong>
          <button type="button" onClick={onCancel} aria-label="Cerrar editor">
            <X size={14} />
          </button>
        </header>
        <div className="payable-editor-grid">
          <EditorSelect
            label="Compra recibida"
            value={editor.purchaseOrderId}
            options={payableOrders.map((order) => ({
              value: String(order.id),
              label:
                String(order.consecutive ?? "OC-" + order.id) +
                " · saldo " +
                formatCurrency(orderBalance(order)),
            }))}
            onChange={(value) => onChange("purchaseOrderId", value)}
            wide
          />
          <EditorField
            label="Monto del pago"
            value={editor.amount}
            type="number"
            onChange={(value) => onChange("amount", value)}
          />
          <EditorSelect
            label="Cuenta bancaria"
            value={editor.bankAccountId}
            options={bankAccounts.map((account) => ({
              value: String(account.id),
              label:
                account.name ??
                account.accountNumber ??
                "Cuenta #" + account.id,
            }))}
            emptyLabel="Selecciona una cuenta"
            onChange={(value) => onChange("bankAccountId", value)}
          />
          <label className="payable-notes-field">
            <span>Comentarios</span>
            <textarea
              value={editor.notes}
              onChange={(event) => onChange("notes", event.target.value)}
            />
          </label>
          {selectedOrder && (
            <div className="receivable-payment-hint">
              Saldo pendiente:{" "}
              <strong>{formatCurrency(orderBalance(selectedOrder))}</strong>
            </div>
          )}
        </div>
        <div className="inline-editor-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? (
              "Guardando…"
            ) : (
              <>
                <Check size={13} /> Registrar pago
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorField({ label, value, onChange, type = "text", wide = false }) {
  return (
    <label className={`editor-field ${wide ? "editor-field-wide" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EditorSelect({
  label,
  value,
  options,
  onChange,
  emptyLabel = "Selecciona…",
  wide = false,
}) {
  return (
    <label className={`editor-field ${wide ? "editor-field-wide" : ""}`}>
      <span>{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BalanceField({ label, value, accent = false, muted = false }) {
  return (
    <div
      className={`payable-balance ${accent ? "is-accent" : ""} ${muted ? "is-muted" : ""}`}
    >
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}

function AgingSummaryCard({ className, label, value, count }) {
  return (
    <article className={`payable-aging-card ${className}`}>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
      <small>
        {count} {count === 1 ? "obligación" : "obligaciones"}
      </small>
    </article>
  );
}

function mapProvider(provider) {
  return {
    ...provider,
    id: Number(provider.id),
    code: String(provider.taxId ?? provider.id).padStart(
      provider.taxId ? 0 : 6,
      "0",
    ),
    name: provider.name ?? "Proveedor sin nombre",
    taxId: provider.taxId ?? "",
    phone: provider.phonePrimary ?? "",
  };
}

function productBelongsToProvider(product, providerId) {
  if (!providerId) return true;
  const providers = product.providers?.length
    ? product.providers
    : product.provider
      ? [product.provider]
      : [];
  return providers.some(
    (provider) =>
      Number(provider.id ?? provider.providerId) === Number(providerId),
  );
}

function toPurchaseEditor(order) {
  return {
    id: order.id,
    providerId: String(order.providerId ?? ""),
    warehouseId: String(order.warehouseId ?? ""),
    items: order.items?.length
      ? order.items.map((item) => ({
          productId: String(item.productId ?? ""),
          quantity: String(item.quantity ?? 1),
          unitCost: String(item.unitCost ?? ""),
          taxRate: String(item.taxRate ?? 0),
        }))
      : [emptyPurchaseItem()],
    orderedAt: toDateInput(order.orderedAt),
    expectedAt: toDateInput(order.expectedAt),
    externalReference: order.externalReference ?? "",
    notes: order.notes ?? "",
  };
}

function buildOrderBody(editor) {
  return {
    providerId: Number(editor.providerId),
    warehouseId: Number(editor.warehouseId),
    orderedAt: editor.orderedAt
      ? new Date(`${editor.orderedAt}T00:00:00`).toISOString()
      : undefined,
    expectedAt: editor.expectedAt
      ? new Date(`${editor.expectedAt}T00:00:00`).toISOString()
      : undefined,
    externalReference: editor.externalReference?.trim() || undefined,
    notes: editor.notes?.trim() || undefined,
    items: editor.items.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      unitCost: Number(item.unitCost),
      taxRate: Number(item.taxRate) || 0,
    })),
  };
}

function todayValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : "";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO").format(new Date(value));
}

function sumOrderTotals(orders) {
  return orders.reduce((sum, order) => sum + orderBalance(order), 0);
}

function orderPaidAmount(order) {
  if (order.paidAmount !== undefined) return Number(order.paidAmount) || 0;
  return order.status === "RECIBIDA" ? Number(order.total ?? 0) : 0;
}

function orderBalance(order) {
  if (order.status === "ANULADA") return 0;
  if (order.balance !== undefined) return Math.max(0, Number(order.balance));
  return order.status === "RECIBIDA" ? 0 : Number(order.total ?? 0);
}

function getDueBucket(order) {
  if (!order.expectedAt) return "no-date";
  const expectedAt = new Date(
    `${String(order.expectedAt).slice(0, 10)}T00:00:00`,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expectedAt < today ? "overdue" : "upcoming";
}

function getDueLabel(order) {
  if (!order.expectedAt) return "Sin fecha de vencimiento";
  const expectedAt = new Date(
    `${String(order.expectedAt).slice(0, 10)}T00:00:00`,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((expectedAt - today) / 86400000);
  if (days < 0) return `Vencido · ${Math.abs(days)} días`;
  if (days === 0) return "Vence hoy";
  return `Por vencer · ${days} días`;
}

function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
