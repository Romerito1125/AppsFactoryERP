import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  Eye,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

export function InventoryTransfersWindow({ onClose, onRequestLogin }) {
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [operationType, setOperationType] = useState("transfer");
  const [operationItems, setOperationItems] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState(() => new Set());
  const [productSearch, setProductSearch] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [supportNote, setSupportNote] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { handlePointerDown, isDragging, style: windowStyle } = useDraggableWindow();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [warehouseRows, productRows, ticketRows] = await Promise.all([
        apiClient.getAllPages("/bodegas", { estado: "activos" }),
        apiClient.getAllPages("/productos", { estado: "activos" }),
        apiClient.getAllPages("/inventario/movimientos"),
      ]);
      const nextWarehouses = warehouseRows.filter(isActive);
      const nextProducts = productRows.filter(isActive);
      setWarehouses(nextWarehouses);
      setProducts(nextProducts);
      setMovements(ticketRows);
      setFromWarehouseId((current) => current || String(nextWarehouses[0]?.id ?? ""));
      setToWarehouseId((current) => current || String(nextWarehouses[1]?.id ?? nextWarehouses[0]?.id ?? ""));
    } catch (requestError) {
      setError(requestError.message ?? "No se pudo cargar Traslados de inventario.");
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setLoading(false);
    }
  }, [onRequestLogin]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const productById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products],
  );
  const operationProductIds = useMemo(
    () => new Set(operationItems.map((item) => String(item.productId))),
    [operationItems],
  );
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      `${productCode(product)} ${productName(product)} ${product.brand ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [productSearch, products]);
  const selectedProductCount = [...selectedProductIds].filter(
    (id) => !operationProductIds.has(String(id)),
  ).length;

  function toggleProductSelection(productId) {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      const key = String(productId);
      if (next.has(key)) next.delete(key);
      else if (!operationProductIds.has(key)) next.add(key);
      return next;
    });
  }

  function addSelectedProducts() {
    setError("");
    const productsToAdd = products.filter((product) => {
      const key = String(product.id);
      return selectedProductIds.has(key) && !operationProductIds.has(key);
    });
    if (!productsToAdd.length) {
      setError("Selecciona uno o varios productos nuevos para agregarlos a la operación.");
      return;
    }
    setOperationItems((current) => {
      const currentIds = new Set(current.map((item) => String(item.productId)));
      return [
        ...current,
        ...productsToAdd
          .filter((product) => !currentIds.has(String(product.id)))
          .map((product) => ({
            productId: Number(product.id),
            quantity: operationType === "adjustment" ? "0" : "1",
            unit: getTransferUnitOptions(product)[0] ?? "UND",
          })),
      ];
    });
    setSelectedProductIds(new Set());
  }

  function updateOperationItem(itemProductId, field, value) {
    setOperationItems((current) =>
      current.map((item) =>
        String(item.productId) === String(itemProductId)
          ? { ...item, [field]: value }
          : item,
      ),
    );
  }

  async function submitOperation(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!operationItems.length) {
      setError("Agrega al menos un producto a la operación.");
      return;
    }
    if (operationType === "transfer" && (!fromWarehouseId || !toWarehouseId)) {
      setError("Selecciona bodega origen y bodega destino.");
      return;
    }
    if (operationType === "transfer" && String(fromWarehouseId) === String(toWarehouseId)) {
      setError("La bodega origen y destino deben ser diferentes.");
      return;
    }
    if (["entry", "exit", "adjustment"].includes(operationType) && !fromWarehouseId) {
      setError("Selecciona la bodega de la operación.");
      return;
    }
    const normalizedItems = operationItems.map((item) => ({
      ...item,
      productId: Number(item.productId),
      quantity: parseDecimal(item.quantity),
    }));
    const invalidItem = normalizedItems.find((item) => {
      const product = productById.get(String(item.productId));
      if (
        item.quantity === null ||
        (operationType === "adjustment" ? item.quantity < 0 : item.quantity <= 0)
      ) {
        return true;
      }
      return (
        ["transfer", "exit"].includes(operationType) &&
        convertToBase(item.quantity, item.unit, product) >
          getWarehouseStock(product, fromWarehouseId)
      );
    });
    if (invalidItem) {
      setError("Revisa las cantidades de los productos agregados y su existencia disponible.");
      return;
    }

    setSaving(true);
    try {
      let result;
      if (operationType === "transfer") {
        result = await apiClient.post("/inventario/traslado-multiple", {
          fromWarehouseId: Number(fromWarehouseId),
          toWarehouseId: Number(toWarehouseId),
          items: normalizedItems,
          supportNote: supportNote.trim() || undefined,
        });
        setNotice(`Traslado completo registrado · ${result?.batchNumber ?? "grupo generado"}`);
      } else {
        const endpoint = { entry: "entrada", exit: "salida", adjustment: "ajuste" }[operationType];
        for (const item of normalizedItems) {
          await apiClient.post(`/inventario/${endpoint}`, operationType === "entry"
            ? { ...item, productId: Number(item.productId), toWarehouseId: Number(fromWarehouseId), reason: supportNote.trim() || "Entrada de inventario" }
            : operationType === "exit"
              ? { ...item, productId: Number(item.productId), fromWarehouseId: Number(fromWarehouseId), reason: supportNote.trim() || "Salida de inventario" }
              : { ...item, productId: Number(item.productId), warehouseId: Number(fromWarehouseId), reason: supportNote.trim() || "Ajuste de inventario" });
        }
        setNotice(`${operationLabel(operationType)} registrada para ${operationItems.length} producto(s).`);
      }
      setSupportNote("");
      setOperationItems([]);
      await loadData();
    } catch (requestError) {
      setError(requestError.message ?? "No se pudo registrar la operación.");
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  async function openMovement(movement) {
    setError("");
    try {
      const detail = await apiClient.get(`/inventario/movimientos/${movement.id}`);
      setSelectedTicket(detail);
    } catch (requestError) {
      setError(requestError.message ?? "No se pudo abrir el ticket.");
      if (isAuthError(requestError)) onRequestLogin?.();
    }
  }

  return (
    <section
      className={`provider-window inventory-transfer-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Ventana de operaciones de inventario"
      style={windowStyle}
    >
      <header className="provider-titlebar drag-handle inventory-transfer-titlebar" onPointerDown={handlePointerDown}>
        <div className="provider-title-mark"><ArrowLeftRight size={14} /></div>
        <strong>OPERACIONES DE INVENTARIO</strong>
        <span className="inventory-transfer-mode">ADMINISTRATIVO · INVENTARIO</span>
        <button type="button" className="provider-close" aria-label="Cerrar operaciones de inventario" onClick={onClose}><X size={17} /></button>
      </header>

      <div className="inventory-transfer-content">
        <div className="inventory-transfer-heading">
          <div>
            <span>GESTIÓN DE INVENTARIO</span>
            <h2>Operaciones de inventario</h2>
            <p>Traslados, cargos, descargos y ajustes.</p>
          </div>
          <div className="inventory-transfer-heading-actions">
            <button type="button" className="inventory-transfer-history-trigger" onClick={() => setHistoryOpen(true)} disabled={saving}>
              <ClipboardCheck size={14} /> Historial
            </button>
            <button type="button" className="inventory-transfer-refresh" onClick={loadData} disabled={loading || saving}>
              <RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Actualizar
            </button>
          </div>
        </div>

        <div className="inventory-operation-tabs" role="tablist" aria-label="Tipo de operación">
          {[
            ["transfer", "Traslados", ArrowLeftRight],
            ["entry", "Cargos / entradas", ArrowDownToLine],
            ["exit", "Descargos / salidas", ArrowUpFromLine],
            ["adjustment", "Ajustes", SlidersHorizontal],
          ].map(([type, label, Icon]) => (
            <button key={type} type="button" role="tab" aria-selected={operationType === type} className={operationType === type ? "is-active" : ""} onClick={() => { setOperationType(type); setOperationItems([]); setSelectedProductIds(new Set()); setError(""); }} disabled={saving}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {error && <TransientMessage className="window-error" role="alert" onDismiss={() => setError("")}>{error}</TransientMessage>}
        {notice && <TransientMessage className="window-notice" role="status" onDismiss={() => setNotice("")}>{notice}</TransientMessage>}

        <div className="inventory-transfer-grid">
          <form className="inventory-transfer-form" onSubmit={submitOperation}>
            <div className="inventory-transfer-section-title"><Package size={15} /> Productos de la operación</div>
            <div className="inventory-product-picker">
              <div className="inventory-product-picker-heading">
                <span>Productos</span>
                <small>{filteredProducts.length} disponibles · {selectedProductCount} seleccionados</small>
              </div>
              <div className="inventory-product-search">
                <Search size={14} aria-hidden="true" />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Código, nombre o marca"
                  aria-label="Buscar producto para la operación"
                  disabled={loading || saving}
                />
              </div>
              <div className="inventory-product-results-head" aria-hidden="true">
                <span />
                <span>Código</span>
                <span>Producto</span>
                <span>Stock</span>
                <span>Estado</span>
              </div>
              <div className="inventory-product-results" role="listbox" aria-label="Productos disponibles">
                {filteredProducts.length ? filteredProducts.map((product) => {
                  const productKey = String(product.id);
                  const isAdded = operationProductIds.has(productKey);
                  const isSelected = selectedProductIds.has(productKey);
                  return (
                    <label
                      className={`inventory-product-option ${isSelected ? "is-selected" : ""} ${isAdded ? "is-added" : ""}`}
                      key={product.id}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected || isAdded}
                        onChange={() => toggleProductSelection(productKey)}
                        disabled={loading || saving || isAdded}
                        aria-label={`${isAdded ? "Producto ya agregado" : "Seleccionar"} ${productName(product)}`}
                      />
                      <span className="inventory-product-option-code">{productCode(product)}</span>
                      <span className="inventory-product-option-copy">
                        <strong>{productName(product)}</strong>
                        <small>{product.brand || "Sin marca"}</small>
                      </span>
                      <span className="inventory-product-option-stock">{formatQuantity(getProductTotalStock(product))} UND</span>
                      <span className="inventory-product-option-state">{isAdded ? "Agregado" : isSelected ? "Listo" : "Añadir"}</span>
                    </label>
                  );
                }) : <div className="inventory-product-results-empty">No hay productos que coincidan con la búsqueda.</div>}
              </div>
              <button
                type="button"
                className="inventory-transfer-add"
                onClick={addSelectedProducts}
                disabled={loading || saving || !selectedProductCount}
              >
                <Plus size={14} /> Agregar seleccionados
              </button>
            </div>
            <div className="inventory-operation-builder">
            {operationType === "transfer" ? <div className="inventory-transfer-fields-two inventory-warehouse-fields">
              <label>Bodega origen
                <select value={fromWarehouseId} onChange={(event) => setFromWarehouseId(event.target.value)} disabled={loading || saving}>
                  {warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouseName(warehouse)}</option>)}
                </select>
              </label>
              <label>Bodega destino
                <select value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)} disabled={loading || saving}>
                  {warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouseName(warehouse)}</option>)}
                </select>
              </label>
            </div> : <label className="inventory-warehouse-field">Bodega
              <select value={fromWarehouseId} onChange={(event) => setFromWarehouseId(event.target.value)} disabled={loading || saving}>
                {warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouseName(warehouse)}</option>)}
              </select>
            </label>}
            {operationItems.length > 0 && <div className="inventory-operation-items" aria-label="Productos agregados">
              <div className="inventory-operation-items-summary">
                <strong>{operationItems.length} productos</strong>
                <span>Edita cantidades antes de registrar</span>
              </div>
              <div className="inventory-operation-items-head" aria-hidden="true">
                <span>Producto</span>
                <span>{operationType === "adjustment" ? "Objetivo" : "Cantidad"}</span>
                <span>Unidad</span>
                <span />
              </div>
              {operationItems.map((item) => {
                const product = productById.get(String(item.productId));
                return <div className="inventory-operation-item" key={item.productId}>
                  <span className="inventory-operation-item-copy">
                    <b>{productCode(product)}</b>
                    <strong>{productName(product)}</strong>
                    <small>Disponible: {formatQuantity(getWarehouseStock(product, fromWarehouseId))} UND</small>
                  </span>
                  <label className="inventory-operation-item-quantity">
                    <span>{operationType === "adjustment" ? "Objetivo" : "Cantidad"}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.quantity ?? ""}
                      onChange={(event) => updateOperationItem(item.productId, "quantity", event.target.value)}
                      disabled={loading || saving}
                      aria-label={`Cantidad de ${productName(product)}`}
                    />
                  </label>
                  <select
                    value={item.unit}
                    onChange={(event) => updateOperationItem(item.productId, "unit", event.target.value)}
                    disabled={loading || saving}
                    aria-label={`Unidad de ${productName(product)}`}
                  >
                    {getTransferUnitOptions(product).map((option) => <option value={option} key={option}>{transferUnitLabel(option)}</option>)}
                  </select>
                  <button type="button" onClick={() => setOperationItems((current) => current.filter((row) => row.productId !== item.productId))} aria-label={`Quitar ${productName(product)}`}><Trash2 size={13} /></button>
                </div>;
              })}
            </div>}
            <label className="inventory-support-note">Motivo / referencia
              <input value={supportNote} onChange={(event) => setSupportNote(event.target.value)} placeholder="Ej. Reposición de Bodega B" disabled={loading || saving} />
            </label>
            <button type="submit" className="inventory-transfer-submit" disabled={loading || saving || !products.length || !warehouses.length || !operationItems.length}>
              {saving ? <LoaderCircle size={14} className="is-spinning" /> : <ClipboardCheck size={14} />} {saving ? "Registrando…" : `Registrar ${operationLabel(operationType).toLowerCase()}`}
            </button>
            </div>
          </form>

        </div>
      </div>

      {historyOpen && <InventoryHistoryWindow
        loading={loading}
        movements={movements}
        selectedTicket={selectedTicket}
        onClose={() => { setHistoryOpen(false); setSelectedTicket(null); }}
        onOpen={openMovement}
        onCloseTicket={() => setSelectedTicket(null)}
      />}
      <footer className="provider-window-footer inventory-transfer-footer">
        <span>{movements.length} movimiento(s) cargado(s)</span>
        <div className="provider-navigation-actions"><button type="button" className="exit-action" onClick={onClose}><X size={14} /> Salir</button></div>
      </footer>
    </section>
  );
}

function InventoryHistoryWindow({ loading, movements, selectedTicket, onClose, onOpen, onCloseTicket }) {
  return <div className="inventory-history-layer" role="presentation">
    <section className="provider-window inventory-history-window" role="dialog" aria-modal="true" aria-label="Historial de operaciones">
      <header className="provider-titlebar inventory-transfer-titlebar">
        <div className="provider-title-mark"><ClipboardCheck size={14} /></div>
        <strong>HISTORIAL DE OPERACIONES</strong>
        <span className="inventory-transfer-mode">ADMINISTRATIVO · INVENTARIO</span>
        <button type="button" className="provider-close" aria-label="Cerrar historial" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="inventory-history-content">
        <div className="inventory-history-heading">
          <div>
            <span>CONSULTA</span>
            <h2>Historial de operaciones</h2>
            <p>Revisa los movimientos registrados y abre el detalle de cada ticket.</p>
          </div>
          <span className="inventory-history-count">{movements.length} movimientos</span>
        </div>
        {loading ? <div className="inventory-transfer-empty"><LoaderCircle size={20} className="is-spinning" /> Cargando…</div> : movements.length ? (
          <div className="inventory-transfer-table-wrap">
            <table className="inventory-transfer-table">
              <thead><tr><th>Movimiento</th><th>Producto</th><th>Tipo</th><th>Ruta</th><th>Cantidad</th><th>Fecha</th><th /></tr></thead>
              <tbody>{movements.map((movement) => <InventoryMovementRow key={movement.id} movement={movement} onOpen={onOpen} />)}</tbody>
            </table>
          </div>
        ) : <div className="inventory-transfer-empty"><ClipboardCheck size={24} /> Aún no hay operaciones registradas.</div>}
      </div>
      <footer className="provider-window-footer inventory-transfer-footer">
        <span>{movements.length} movimiento(s)</span>
        <button type="button" className="exit-action" onClick={onClose}><X size={14} /> Cerrar</button>
      </footer>
      {selectedTicket && <InventoryMovementDetail movement={selectedTicket} onClose={onCloseTicket} />}
    </section>
  </div>;
}

function InventoryMovementRow({ movement, onOpen }) {
  const transferTicket = movement.transferTicket ?? {};
  const movementLabel = transferTicket.batchNumber ?? transferTicket.ticketNumber ?? `MOV-${movement.id}`;
  const route = `${movement.fromWarehouse ? warehouseName(movement.fromWarehouse) : "—"} → ${movement.toWarehouse ? warehouseName(movement.toWarehouse) : "—"}`;
  return <tr>
    <td><strong>{movementLabel}</strong><small className="inventory-ticket-line">{transferTicket.ticketNumber && transferTicket.ticketNumber !== movementLabel ? transferTicket.ticketNumber : ""}</small></td>
    <td>{productName(movement.product)}</td>
    <td>{movementTypeLabel(movement.movementType)}</td>
    <td>{route}</td>
    <td>{formatQuantity(movement.quantity)} UND</td>
    <td>{formatDate(movement.createdAt)}</td>
    <td><button type="button" className="inventory-transfer-view" onClick={() => onOpen(movement)}><Eye size={13} /> Ver detalle</button></td>
  </tr>;
}

function InventoryMovementDetail({ movement, onClose }) {
  const transferTicket = movement.transferTicket ?? {};
  return <div className="inventory-transfer-detail-layer" role="presentation">
    <div className="inventory-transfer-detail" role="dialog" aria-modal="true" aria-label="Detalle del movimiento de inventario">
      <header><strong>Detalle del movimiento</strong><button type="button" onClick={onClose} aria-label="Cerrar detalle"><X size={16} /></button></header>
      <dl>
        <dt>Movimiento</dt><dd>{transferTicket.batchNumber ?? transferTicket.ticketNumber ?? `MOV-${movement.id}`}{transferTicket.batchNumber && ` · ${transferTicket.ticketNumber}`}</dd>
        <dt>Producto</dt><dd>{productName(movement.product)}</dd>
        <dt>Tipo</dt><dd>{movementTypeLabel(movement.movementType)}</dd>
        <dt>Origen</dt><dd>{movement.fromWarehouse ? warehouseName(movement.fromWarehouse) : "—"}</dd>
        <dt>Destino</dt><dd>{movement.toWarehouse ? warehouseName(movement.toWarehouse) : "—"}</dd>
        <dt>Cantidad</dt><dd>{formatQuantity(movement.quantity)} UND</dd>
        <dt>Estado</dt><dd>{transferTicket.status ?? "APROBADO"}</dd>
        <dt>Referencia</dt><dd>{movement.reason || transferTicket.supportNote || "—"}</dd>
        <dt>Registrado</dt><dd>{formatDate(movement.createdAt)}</dd>
      </dl>
      <footer><button type="button" className="inventory-transfer-view" onClick={onClose}>Cerrar</button></footer>
    </div>
  </div>;
}

function getTransferUnitOptions(product) {
  const base = String(product?.unit ?? "UND").toUpperCase();
  const profile = product?.packagingProfile;
  const unitsPerPackage = Number(profile?.unitsPerPackage ?? 0);
  const packagesPerBox = Number(profile?.packagesPerBox ?? 0);
  const options = [base];
  if (base === "UND" && unitsPerPackage > 0) options.push("PAQUETE");
  if (base === "UND" && unitsPerPackage > 0 && packagesPerBox > 0) options.push("CAJA");
  return [...new Set(options)];
}

function convertToBase(quantity, unit, product) {
  const amount = Number(quantity ?? 0);
  if (!Number.isFinite(amount)) return 0;
  const base = String(product?.unit ?? "UND").toUpperCase();
  const profile = product?.packagingProfile;
  if (String(unit).toUpperCase() === base || base !== "UND") return amount;
  if (String(unit).toUpperCase() === "PAQUETE") return amount * Number(profile?.unitsPerPackage ?? 1);
  if (String(unit).toUpperCase() === "CAJA") return amount * Number(profile?.unitsPerPackage ?? 1) * Number(profile?.packagesPerBox ?? 1);
  return amount;
}

function getWarehouseStock(product, warehouseId) {
  const row = product?.warehouses?.find((item) => String(item.warehouseId ?? item.warehouse?.id) === String(warehouseId));
  return Number(row?.quantity ?? 0);
}

function productName(product) {
  return product?.name ?? product?.description ?? product?.description1 ?? "Producto";
}

function productCode(product) {
  return (
    product?.code ??
    product?.codigo ??
    product?.barcodes?.find((barcode) => barcode.isPrimary)?.code ??
    String(product?.id ?? "")
  );
}

function getProductTotalStock(product) {
  return (product?.warehouses ?? []).reduce(
    (total, row) => total + Number(row.quantity ?? 0),
    0,
  );
}

function warehouseName(warehouse) {
  return warehouse?.name ?? warehouse?.location ?? warehouse?.description ?? `Bodega #${warehouse?.id ?? ""}`;
}

function transferUnitLabel(unit) {
  return { UND: "Unidad", PAQUETE: "Paquete", CAJA: "Caja" }[unit] ?? unit;
}

function movementTypeLabel(type) {
  return {
    ENTRADA: "Cargo",
    SALIDA: "Descargo",
    TRASLADO: "Traslado",
    AJUSTE: "Ajuste",
    DEVOLUCION: "Devolución",
  }[type] ?? type ?? "Movimiento";
}

function formatQuantity(value) {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(3);
}

function parseDecimal(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized || !/^\d+(\.\d{1,3})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function operationLabel(type) {
  return {
    transfer: "Traslado completo",
    entry: "Cargo / entrada",
    exit: "Descargo / salida",
    adjustment: "Ajuste de inventario",
  }[type] ?? "Operación de inventario";
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function isActive(item) {
  return item?.isActive !== false && item?.active !== false && item?.status !== "INACTIVO";
}

function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
