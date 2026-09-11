import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  FileText,
  Image as ImageIcon,
  PackageSearch,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Truck,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { apiClient } from "@/lib/api-client";

const viewLabels = {
  purchases: "Compras",
  returns: "Devoluciones",
  deliveries: "Recepción nota de entrega",
  orders: "Ordenes de compra",
  quotes: "Cotizaciones",
  reports: "Reportes",
  various: "Varios",
};

const statusLabels = {
  BORRADOR: "Borrador",
  ORDENADA: "Ordenada",
  RECIBIDA: "Recibida",
  ANULADA: "Anulada",
};

let purchasesDataPromise;
let purchasesDataSnapshot;

function loadPurchasesData() {
  if (purchasesDataSnapshot) return Promise.resolve(purchasesDataSnapshot);
  if (!purchasesDataPromise) {
    purchasesDataPromise = Promise.allSettled([
      apiClient.getAllPages("/proveedores", { estado: "activos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
      apiClient.getAllPages("/productos", { estado: "activos" }),
      apiClient.getAllPages("/compras"),
    ]).then(
      ([providersResult, warehousesResult, productsResult, ordersResult]) => {
        purchasesDataSnapshot = {
          providersResult,
          warehousesResult,
          productsResult,
          ordersResult,
        };
        return purchasesDataSnapshot;
      },
    );
  }
  return purchasesDataPromise;
}

export function PurchasesWindow({
  initialView = "purchases",
  session,
  onClose,
  onOpenView,
  onRequestLogin,
}) {
  const [view, setView] = useState(initialView);
  const [providers, setProviders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [cart, setCart] = useState([]);
  const [lookupType, setLookupType] = useState(null);
  const [operationDialogOpen, setOperationDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => setView(initialView), [initialView]);

  useEffect(() => {
    let cancelled = false;
    loadPurchasesData().then(
      ({ providersResult, warehousesResult, productsResult, ordersResult }) => {
        if (cancelled) return;
        const nextProviders =
          providersResult.status === "fulfilled"
            ? providersResult.value.filter(isActive)
            : [];
        const nextWarehouses =
          warehousesResult.status === "fulfilled"
            ? warehousesResult.value.filter(isActive)
            : [];
        setProviders(nextProviders);
        setWarehouses(nextWarehouses);
        setProducts(
          productsResult.status === "fulfilled"
            ? productsResult.value.filter(isActive)
            : [],
        );
        setOrders(
          ordersResult.status === "fulfilled" ? ordersResult.value : [],
        );
        setSelectedProviderId(String(nextProviders[0]?.id ?? ""));
        setSelectedWarehouseId(String(nextWarehouses[0]?.id ?? ""));

        const requiredFailure = [providersResult, warehousesResult].find(
          (result) => result.status === "rejected",
        );
        if (requiredFailure) {
          setError(
            `No se pudo cargar Compras: ${requiredFailure.reason?.message ?? "verifica la conexión con el API"}`,
          );
          if (isAuthError(requiredFailure.reason)) onRequestLogin?.();
        }
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onRequestLogin]);

  useEffect(() => {
    function handleShortcuts(event) {
      if (event.key === "Escape") {
        if (lookupType) setLookupType(null);
        else if (operationDialogOpen) setOperationDialogOpen(false);
        return;
      }
      if (event.key === "F1" || event.key === "F2") {
        event.preventDefault();
        setLookupType("providers");
      } else if (event.key === "F5") {
        event.preventDefault();
        setLookupType("products");
      } else if (event.key === "F6") {
        event.preventDefault();
        setLookupType("orders");
      }
    }
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [lookupType, operationDialogOpen]);

  const selectedProvider = providers.find(
    (provider) => String(provider.id) === String(selectedProviderId),
  );
  const selectedWarehouse = warehouses.find(
    (warehouse) => String(warehouse.id) === String(selectedWarehouseId),
  );
  const cartTotals = useMemo(() => calculateCartTotals(cart), [cart]);
  const isDocumentView = ["purchases", "returns", "deliveries"].includes(view);

  function navigate(nextView) {
    setError("");
    setNotice("");
    if (nextView !== view) {
      onOpenView?.(nextView);
      return;
    }
    setView(nextView);
  }

  function openLookup(type) {
    setError("");
    setLookupType(type);
  }

  function selectLookupItem(item) {
    if (lookupType === "providers") setSelectedProviderId(String(item.id));
    if (lookupType === "warehouses") setSelectedWarehouseId(String(item.id));
    if (lookupType === "products") addProduct(item);
    if (lookupType === "orders")
      setNotice(`Compra ${orderNumber(item)} cargada para consulta.`);
    setLookupType(null);
  }

  function addProduct(product) {
    const existing = cart.find(
      (item) => String(item.productId) === String(product.id),
    );
    if (existing) {
      updateCartItem(product.id, "quantity", Number(existing.quantity) + 1);
      return;
    }
    setCart((current) => [
      ...current,
      {
        productId: product.id,
        product,
        quantity: 1,
        unit: product.unit ?? product.unitOfMeasure ?? "UND",
        unitCost: defaultCost(product),
        taxRate: Number(product.taxRate ?? 0),
      },
    ]);
    setNotice(`${productName(product)} agregado a la tabla.`);
  }

  function updateCartItem(productId, field, value) {
    setCart((current) =>
      current.map((item) =>
        String(item.productId) === String(productId)
          ? { ...item, [field]: value }
          : item,
      ),
    );
  }

  function removeCartItem(productId) {
    setCart((current) =>
      current.filter((item) => String(item.productId) !== String(productId)),
    );
  }

  async function savePurchase() {
    if (view !== "purchases") {
      setNotice(
        "Esta ventana conserva la misma tabla para consultar o preparar la operación.",
      );
      return;
    }
    if (!selectedProviderId || !selectedWarehouseId || !cart.length) {
      setError(
        "Selecciona proveedor, depósito y al menos un producto en la tabla.",
      );
      return;
    }
    const invalidItem = cart.find(
      (item) => Number(item.quantity) <= 0 || Number(item.unitCost) <= 0,
    );
    if (invalidItem) {
      setError("Cada producto debe tener cantidad y costo mayor que cero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await apiClient.post("/compras", {
        providerId: numberOrValue(selectedProviderId),
        warehouseId: numberOrValue(selectedWarehouseId),
        orderedAt: new Date().toISOString(),
        items: cart.map((item) => ({
          productId: numberOrValue(item.productId),
          quantity: Number(item.quantity),
          unit: item.unit,
          unitCost: Number(item.unitCost),
          taxRate: Number(item.taxRate ?? 0),
        })),
      });
      setOrders((current) => [saved, ...current]);
      setCart([]);
      setNotice(`Compra ${orderNumber(saved)} guardada correctamente.`);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  async function transitionOrder(order, action) {
    if (action === "anular" && !window.confirm("¿Anular esta compra?")) return;
    setSaving(true);
    try {
      const saved =
        action === "anular"
          ? await apiClient.patch(`/compras/${order.id}/anular`, {})
          : await apiClient.post(`/compras/${order.id}/${action}`, {});
      setOrders((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setNotice(
        `La compra ${orderNumber(saved)} ahora está ${statusLabels[saved.status] ?? saved.status}.`,
      );
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  const activeOrder = orders[0] ?? null;

  return (
    <section
      className={`provider-window purchases-window purchases-window-${view} ${isDragging ? "is-dragging" : ""}`}
      aria-label={`Ventana de ${viewLabels[view] ?? "Compras"}`}
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle purchase-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <span>MÓDULO DE COMPRAS</span>
        <strong>{(viewLabels[view] ?? "Compras").toUpperCase()}</strong>
        <span className="purchase-mode-label">MODO: NORMAL</span>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar Compras"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>

      <div className="provider-content purchase-content">
        {loading ? (
          <div className="module-loading">Cargando información de compras…</div>
        ) : isDocumentView ? (
          <PurchaseDocumentPanel
            view={view}
            providers={providers}
            warehouses={warehouses}
            products={products}
            selectedProvider={selectedProvider}
            selectedWarehouse={selectedWarehouse}
            selectedProviderId={selectedProviderId}
            selectedWarehouseId={selectedWarehouseId}
            cart={cart}
            totals={cartTotals}
            saving={saving}
            onProviderChange={setSelectedProviderId}
            onWarehouseChange={setSelectedWarehouseId}
            onOpenLookup={openLookup}
            onOpenOperation={() => setOperationDialogOpen(true)}
            onOpenView={navigate}
            onAddProduct={addProduct}
            onUpdateItem={updateCartItem}
            onRemoveItem={removeCartItem}
            onSave={savePurchase}
            onNotice={setNotice}
          />
        ) : view === "orders" ? (
          <PurchaseOrdersPanel
            orders={orders}
            activeOrder={activeOrder}
            onOpenLookup={openLookup}
            onOpenView={navigate}
            onTransition={transitionOrder}
            onNotice={setNotice}
            saving={saving}
          />
        ) : view === "quotes" ? (
          <PurchaseQuotesPanel onOpenView={navigate} />
        ) : view === "reports" ? (
          <PurchaseReportsPanel orders={orders} />
        ) : (
          <PurchaseVariousPanel onOpenView={navigate} />
        )}
      </div>

      {(error || notice) && (
        <div
          className={`module-message ${error ? "is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      )}

      {lookupType && (
        <PurchaseLookupDialog
          type={lookupType}
          providers={providers}
          warehouses={warehouses}
          products={products}
          orders={orders}
          onSelect={selectLookupItem}
          onClose={() => setLookupType(null)}
        />
      )}
      {operationDialogOpen && (
        <PurchaseOperationDialog
          provider={selectedProvider}
          onClose={() => setOperationDialogOpen(false)}
          onAccept={() => {
            setOperationDialogOpen(false);
            setNotice("Tipo de operación seleccionado.");
          }}
        />
      )}
    </section>
  );
}

function PurchaseDocumentPanel({
  view,
  providers,
  warehouses,
  products,
  selectedProvider,
  selectedWarehouse,
  selectedProviderId,
  selectedWarehouseId,
  cart,
  totals,
  saving,
  onProviderChange,
  onWarehouseChange,
  onOpenLookup,
  onOpenOperation,
  onOpenView,
  onAddProduct,
  onUpdateItem,
  onRemoveItem,
  onSave,
  onNotice,
}) {
  const isOrder = view === "orders";
  const rows = Math.max(15, cart.length + 5);
  return (
    <div className="purchase-document-shell">
      <div className="purchase-document-top">
        <div className="purchase-document-fields">
          <div className="purchase-field-row">
            <label htmlFor="purchase-provider">Proveedor</label>
            <input
              id="purchase-provider"
              value={selectedProviderId}
              onChange={(event) => onProviderChange(event.target.value)}
              onClick={() => onOpenLookup("providers")}
              onFocus={() => !selectedProviderId && onOpenLookup("providers")}
              onKeyDown={(event) => {
                if (event.key === "F1" || event.key === "F2") {
                  event.preventDefault();
                  onOpenLookup("providers");
                }
              }}
            />
            <button
              type="button"
              className="field-shortcut"
              onClick={() => onOpenLookup("providers")}
            >
              F1
            </button>
            <button
              type="button"
              className="field-shortcut"
              onClick={() => onOpenLookup("providers")}
            >
              F2
            </button>
            <output className="purchase-description">
              {selectedProvider?.name ?? ""}
            </output>
          </div>
          <div className="purchase-field-row">
            <label htmlFor="purchase-warehouse">Depósito</label>
            <input
              id="purchase-warehouse"
              value={selectedWarehouseId}
              onChange={(event) => onWarehouseChange(event.target.value)}
              onClick={() => onOpenLookup("warehouses")}
              onFocus={() => !selectedWarehouseId && onOpenLookup("warehouses")}
            />
            <button
              type="button"
              className="field-shortcut"
              onClick={() => onOpenLookup("warehouses")}
            >
              F1
            </button>
            <output className="purchase-description">
              {selectedWarehouse?.name || selectedWarehouse?.description || ""}
            </output>
          </div>
          {!isOrder && (
            <div className="purchase-field-row">
              <label htmlFor="purchase-document">Documento compra</label>
              <input
                id="purchase-document"
                className="purchase-document-input"
                placeholder="Número del documento"
              />
            </div>
          )}
        </div>
        <div className="purchase-brand-mark" aria-label="Mundo Tienda">
          mundo <small>tienda</small>
        </div>
        <PurchaseTotalsPanel title={viewLabels[view]} totals={totals} />
      </div>

      <div className="purchase-shortcuts">
        <button type="button" onClick={() => onOpenOperation()}>
          <ClipboardList size={13} /> Tipo de operación
        </button>
        <button type="button" onClick={() => onOpenView("purchases")}>
          <ClipboardList size={13} /> F4 Compras
        </button>
        <button type="button" onClick={() => onOpenLookup("products")}>
          <PackageSearch size={13} /> F5 Productos
        </button>
        <button
          type="button"
          onClick={() =>
            onNotice("La reimpresión estará disponible al guardar una compra.")
          }
        >
          <Printer size={13} /> F6 Reimprimir
        </button>
        <button type="button" onClick={() => onOpenLookup("orders")}>
          <FileText size={13} /> F7 Cargar
        </button>
      </div>

      <div className="purchase-table-wrap">
        <table className="purchase-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              {isOrder && <th>Existencia</th>}
              <th>Cantidad</th>
              <th>Und</th>
              <th>Costo</th>
              <th>Total</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {cart.map((item) => (
              <tr key={item.productId}>
                <td>{productCode(item.product)}</td>
                <td className="purchase-product-description">
                  {productName(item.product)}
                </td>
                {isOrder && (
                  <td className="number-cell">{productStock(item.product)}</td>
                )}
                <td>
                  <input
                    className="table-number-input"
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) =>
                      onUpdateItem(
                        item.productId,
                        "quantity",
                        event.target.value,
                      )
                    }
                  />
                </td>
                <td>{item.unit}</td>
                <td>
                  <input
                    className="table-number-input table-cost-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitCost}
                    onChange={(event) =>
                      onUpdateItem(
                        item.productId,
                        "unitCost",
                        event.target.value,
                      )
                    }
                  />
                </td>
                <td className="number-cell">
                  {formatCurrency(lineTotal(item))}
                </td>
                <td>
                  <button
                    type="button"
                    className="row-remove"
                    aria-label={`Quitar ${productName(item.product)}`}
                    onClick={() => onRemoveItem(item.productId)}
                  >
                    <X size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, rows - cart.length) }).map(
              (_, index) => (
                <tr
                  className="empty-row"
                  key={`empty-${index}`}
                  onClick={() => onOpenLookup("products")}
                  title="Haga clic para consultar productos"
                >
                  <td colSpan={isOrder ? 8 : 7}>&nbsp;</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <div className="purchase-document-footer">
        <button
          type="button"
          className="purchase-add-product"
          onClick={() => onOpenLookup("products")}
        >
          <Plus size={14} /> Agregar producto
        </button>
        <span className="purchase-footer-hint">
          La tabla permanece visible mientras agregas productos · F5 consulta
          productos
        </span>
        <button
          type="button"
          className="purchase-save-button"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Guardando…" : "Guardar compra"}
        </button>
      </div>
    </div>
  );
}

function PurchaseTotalsPanel({ title, totals }) {
  return (
    <aside className="purchase-totals-panel">
      <h2>{title}</h2>
      <div className="purchase-number-row">
        <span>Nº</span>
        <strong>{totals.number ?? ""}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Total cantidad o piezas</span>
        <strong>{totals.quantity}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Total renglones</span>
        <strong>{formatCurrency(totals.subtotal)}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Impuestos</span>
        <strong>{formatCurrency(totals.tax)}</strong>
      </div>
      <div className="purchase-number-row purchase-grand-total">
        <span>Total</span>
        <strong>{formatCurrency(totals.total)}</strong>
      </div>
    </aside>
  );
}

function PurchaseOrdersPanel({
  orders,
  activeOrder,
  onOpenLookup,
  onOpenView,
  onTransition,
  onNotice,
  saving,
}) {
  const [search, setSearch] = useState("");
  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) =>
      `${orderNumber(order)} ${order.provider?.name ?? ""} ${order.status ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [orders, search]);
  return (
    <div className="purchase-list-shell">
      <div className="purchase-list-heading">
        <div>
          <span className="purchase-section-kicker">MÓDULO DE COMPRAS</span>
          <h2>ORDENES DE COMPRA</h2>
        </div>
        <div className="purchase-list-actions">
          <button type="button" onClick={() => onOpenView("purchases")}>
            <Plus size={14} /> Nueva compra
          </button>
          <button type="button" onClick={() => onOpenLookup("orders")}>
            <Search size={14} /> F6 Cargar
          </button>
        </div>
      </div>
      <div className="purchase-orders-toolbar">
        <label htmlFor="purchase-order-search">Buscar</label>
        <div className="purchase-search">
          <Search size={14} />
          <input
            id="purchase-order-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número, proveedor o estado"
          />
        </div>
        <span>{filteredOrders.length} registros</span>
      </div>
      <div className="purchase-table-wrap purchase-orders-table-wrap">
        <table className="purchase-table purchase-orders-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Proveedor</th>
              <th>Depósito</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr
                key={order.id}
                className={activeOrder?.id === order.id ? "is-selected" : ""}
              >
                <td>{orderNumber(order)}</td>
                <td>{order.provider?.name ?? order.providerName ?? "—"}</td>
                <td>
                  {order.warehouse?.name ?? order.warehouse?.description ?? "—"}
                </td>
                <td>{formatDate(order.orderedAt ?? order.createdAt)}</td>
                <td className="number-cell">{formatCurrency(order.total)}</td>
                <td>
                  <span
                    className={`purchase-status status-${String(order.status ?? "").toLowerCase()}`}
                  >
                    {statusLabels[order.status] ?? order.status ?? "Borrador"}
                  </span>
                </td>
                <td className="purchase-row-actions">
                  {order.status === "BORRADOR" && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onTransition(order, "ordenar")}
                    >
                      Ordenar
                    </button>
                  )}
                  {order.status === "ORDENADA" && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onTransition(order, "recibir")}
                    >
                      Recibir
                    </button>
                  )}
                  {!["RECIBIDA", "ANULADA"].includes(order.status) && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onTransition(order, "anular")}
                    >
                      Anular
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filteredOrders.length && (
              <tr className="empty-list-row">
                <td colSpan="7">No hay compras para mostrar.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="purchase-list-footnote">
        F1/F2 proveedor · F5 productos · F6 cargar · doble clic en la operación
        para consultar su detalle
      </div>
    </div>
  );
}

function PurchaseQuotesPanel({ onOpenView }) {
  return (
    <SimplePurchasePanel
      icon={FileText}
      title="COTIZACIONES"
      description="Consulta las cotizaciones recibidas y conviértelas en una orden de compra cuando el proveedor sea aprobado."
      buttons={[
        { label: "Nueva cotización", action: "purchases" },
        { label: "Productos", action: "products" },
      ]}
      onOpenView={onOpenView}
    />
  );
}

function PurchaseReportsPanel({ orders }) {
  const total = orders.reduce(
    (sum, order) => sum + Number(order.total ?? 0),
    0,
  );
  const pending = orders.filter((order) =>
    ["BORRADOR", "ORDENADA"].includes(order.status),
  ).length;
  return (
    <div className="purchase-report-shell">
      <div className="purchase-list-heading">
        <div>
          <span className="purchase-section-kicker">MÓDULO DE COMPRAS</span>
          <h2>REPORTES</h2>
        </div>
      </div>
      <div className="purchase-report-cards">
        <MetricCard label="Compras registradas" value={orders.length} />
        <MetricCard label="Pendientes de recibir" value={pending} />
        <MetricCard label="Valor acumulado" value={formatCurrency(total)} />
      </div>
      <div className="purchase-report-table-wrap">
        <table className="purchase-table">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Operaciones</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(statusLabels).map((status) => {
              const rows = orders.filter((order) => order.status === status);
              return (
                <tr key={status}>
                  <td>{statusLabels[status]}</td>
                  <td>{rows.length}</td>
                  <td className="number-cell">
                    {formatCurrency(
                      rows.reduce(
                        (sum, order) => sum + Number(order.total ?? 0),
                        0,
                      ),
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurchaseVariousPanel({ onOpenView }) {
  return (
    <SimplePurchasePanel
      icon={RotateCcw}
      title="VARIOS"
      description="Accesos de apoyo para consultar documentos, depósitos, proveedores y productos del módulo de compras."
      buttons={[
        { label: "Ordenes de compra", action: "orders" },
        { label: "Nota de entrega", action: "deliveries" },
        { label: "Cotizaciones", action: "quotes" },
      ]}
      onOpenView={onOpenView}
    />
  );
}

function SimplePurchasePanel({
  icon: Icon,
  title,
  description,
  buttons,
  onOpenView,
}) {
  return (
    <div className="purchase-simple-shell">
      <div className="purchase-list-heading">
        <div>
          <span className="purchase-section-kicker">MÓDULO DE COMPRAS</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="purchase-simple-content">
        <Icon size={38} />
        <p>{description}</p>
        <div>
          {buttons.map((button) => (
            <button
              key={button.label}
              type="button"
              onClick={() => onOpenView(button.action)}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="purchase-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PurchaseLookupDialog({
  type,
  providers,
  warehouses,
  products,
  orders,
  onSelect,
  onClose,
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const items =
    type === "providers"
      ? providers
      : type === "warehouses"
        ? warehouses
        : type === "products"
          ? products
          : orders;
  const filteredItems = items.filter((item) => {
    if (!query) return true;
    return `${item.id} ${item.code ?? ""} ${item.name ?? item.description ?? ""} ${item.taxId ?? ""} ${item.reference ?? ""} ${orderNumber(item)}`
      .toLowerCase()
      .includes(query);
  });
  return (
    <div className="module-dialog-backdrop">
      <section
        className="module-dialog purchase-lookup-dialog"
        role="dialog"
        aria-modal="true"
      >
        <header className="module-dialog-titlebar">
          <strong>
            INFORMACIÓN DE{" "}
            {type === "providers"
              ? "PROVEEDORES"
              : type === "warehouses"
                ? "DEPÓSITOS"
                : type === "products"
                  ? "PRODUCTOS"
                  : "COMPRAS"}
          </strong>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="lookup-tabs">
          <span className="is-active">Código</span>
          <span>Descripción</span>
          <span>{type === "products" ? "Referencia" : "Clase"}</span>
        </div>
        <div className="lookup-table-wrap">
          <table className="purchase-table lookup-table">
            <thead>
              <tr>
                {type === "products" && <th>Imagen</th>}
                <th>Código</th>
                <th>Descripción</th>
                {type === "providers" && (
                  <>
                    <th>Clase</th>
                    <th>Id. Fiscal</th>
                    <th>Saldo pendiente</th>
                  </>
                )}
                {type === "warehouses" && <th>Clase</th>}
                {type === "products" && (
                  <>
                    <th>Referencia</th>
                    <th>Existencia</th>
                    <th>Costo</th>
                  </>
                )}
                {type === "orders" && (
                  <>
                    <th>Proveedor</th>
                    <th>Depósito</th>
                    <th>Fecha</th>
                    <th>Total</th>
                    <th>Estado</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  tabIndex="0"
                  onDoubleClick={() => onSelect(item)}
                  onKeyDown={(event) => event.key === "Enter" && onSelect(item)}
                >
                  {type === "products" && (
                    <td className="image-cell">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" />
                      ) : (
                        <ImageIcon size={18} />
                      )}
                    </td>
                  )}
                  <td>
                    {type === "orders" ? orderNumber(item) : productCode(item)}
                  </td>
                  <td>
                    {type === "orders"
                      ? (item.provider?.name ?? "—")
                      : productName(item)}
                  </td>
                  {type === "providers" && (
                    <>
                      <td>{item.className ?? item.providerType ?? ""}</td>
                      <td>{item.taxId ?? ""}</td>
                      <td className="number-cell">
                        {formatCurrency(item.pendingBalance)}
                      </td>
                    </>
                  )}
                  {type === "warehouses" && <td>{item.className ?? ""}</td>}
                  {type === "products" && (
                    <>
                      <td>{item.reference ?? ""}</td>
                      <td className="number-cell">{productStock(item)}</td>
                      <td className="number-cell">
                        {formatCurrency(defaultCost(item))}
                      </td>
                    </>
                  )}
                  {type === "orders" && (
                    <>
                      <td>{item.warehouse?.name ?? "—"}</td>
                      <td>{formatDate(item.orderedAt ?? item.createdAt)}</td>
                      <td className="number-cell">
                        {formatCurrency(item.total)}
                      </td>
                      <td>
                        {statusLabels[item.status] ?? item.status ?? "Borrador"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!filteredItems.length && (
                <tr className="empty-list-row">
                  <td colSpan="8">No se encontraron registros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="module-dialog-footer">
          <label htmlFor="purchase-lookup-search">Buscar</label>
          <div className="purchase-search">
            <Search size={14} />
            <input
              autoFocus
              id="purchase-lookup-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Código, descripción o referencia"
            />
          </div>
          <button type="button" onClick={onClose}>
            Salir
          </button>
        </div>
      </section>
    </div>
  );
}

function PurchaseOperationDialog({ provider, onClose, onAccept }) {
  return (
    <div className="module-dialog-backdrop">
      <section
        className="module-dialog purchase-operation-dialog"
        role="dialog"
        aria-modal="true"
      >
        <header className="module-dialog-titlebar">
          <strong>TIPO DE OPERACIÓN</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="operation-form">
          <label>
            Tipo de operación
            <select defaultValue="Compra">
              <option>Compra</option>
              <option>Nota de entrega</option>
              <option>Orden de compra</option>
              <option>Documento en espera</option>
              <option>Solicitud de cotización</option>
              <option>Pedido</option>
            </select>
          </label>
          <label>
            Proveedor
            <div className="operation-readonly">{provider?.name ?? ""}</div>
          </label>
          <label>
            Número
            <input />
          </label>
          <label>
            Orden de compra
            <input />
          </label>
          <label>
            Fecha emisión
            <input type="date" defaultValue={todayValue()} />
          </label>
          <label>
            Ordenado
            <select defaultValue="ORIGINAL">
              <option>ORIGINAL</option>
              <option>ALFABÉTICO</option>
            </select>
          </label>
        </div>
        <div className="module-dialog-footer">
          <button type="button" onClick={onAccept}>
            Aceptar
          </button>
          <button type="button" onClick={onClose}>
            Salir
          </button>
        </div>
      </section>
    </div>
  );
}

function calculateCartTotals(cart) {
  const subtotal = cart.reduce((sum, item) => sum + lineTotal(item), 0);
  const tax = cart.reduce(
    (sum, item) => sum + lineTotal(item) * (Number(item.taxRate ?? 0) / 100),
    0,
  );
  return {
    quantity: cart.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    subtotal,
    tax,
    total: subtotal + tax,
  };
}

function lineTotal(item) {
  return Number(item.quantity ?? 0) * Number(item.unitCost ?? 0);
}

function defaultCost(product) {
  const activeCost = product.costs?.find(
    (cost) => cost.isActive !== false,
  )?.cost;
  return Number(activeCost ?? product.cost ?? product.averageCost ?? 0);
}

function productName(item) {
  return item?.name ?? item?.description ?? item?.description1 ?? "";
}

function productCode(item) {
  return item?.code ?? item?.codigo ?? String(item?.id ?? "");
}

function productStock(item) {
  return Number(item?.stock ?? item?.existence ?? item?.inventory ?? 0);
}

function productNameOrProvider(item) {
  return item?.name ?? item?.description ?? "";
}

function orderNumber(order) {
  return order?.consecutive ?? order?.number ?? order?.id ?? "";
}

function isActive(item) {
  return (
    item?.isActive !== false &&
    item?.active !== false &&
    item?.status !== "INACTIVO"
  );
}

function numberOrValue(value) {
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO").format(new Date(value));
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function isAuthError(error) {
  return /sesión|inicia sesión|autentic|401/i.test(error?.message ?? "");
}
