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
  const [tickets, setTickets] = useState([]);
  const [operationType, setOperationType] = useState("transfer");
  const [operationItems, setOperationItems] = useState([]);
  const [productId, setProductId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("UND");
  const [supportNote, setSupportNote] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
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
        apiClient.getAllPages("/inventario/traslados/tickets"),
      ]);
      const nextWarehouses = warehouseRows.filter(isActive);
      const nextProducts = productRows.filter(isActive);
      setWarehouses(nextWarehouses);
      setProducts(nextProducts);
      setTickets(ticketRows);
      setFromWarehouseId((current) => current || String(nextWarehouses[0]?.id ?? ""));
      setToWarehouseId((current) => current || String(nextWarehouses[1]?.id ?? nextWarehouses[0]?.id ?? ""));
      setProductId((current) => current || String(nextProducts[0]?.id ?? ""));
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

  const selectedProduct = products.find((product) => String(product.id) === String(productId));
  const selectedSource = warehouses.find((warehouse) => String(warehouse.id) === String(fromWarehouseId));
  const selectedDestination = warehouses.find((warehouse) => String(warehouse.id) === String(toWarehouseId));
  const unitOptions = useMemo(
    () => getTransferUnitOptions(selectedProduct),
    [selectedProduct],
  );
  const activeUnit = unitOptions.includes(unit) ? unit : unitOptions[0] ?? "UND";
  const availableBase = getWarehouseStock(selectedProduct, fromWarehouseId);
  const transferBase = convertToBase(quantity, activeUnit, selectedProduct);

  function addOperationItem() {
    setError("");
    if (!selectedProduct) {
      setError("Selecciona un producto.");
      return;
    }
    const parsedQuantity = parseDecimal(quantity);
    if (operationType === "adjustment" ? parsedQuantity === null || parsedQuantity < 0 : parsedQuantity === null || parsedQuantity <= 0) {
      setError(operationType === "adjustment" ? "La cantidad objetivo no puede ser negativa." : "La cantidad debe ser mayor que cero.");
      return;
    }
    if (["transfer", "exit"].includes(operationType) && transferBase > availableBase) {
      setError(`Existencia insuficiente. Disponible: ${formatQuantity(availableBase)} UND.`);
      return;
    }
    setOperationItems((current) => {
      const index = current.findIndex((item) => String(item.productId) === String(productId));
      if (index < 0) return [...current, { productId: Number(productId), quantity: parsedQuantity, unit: activeUnit }];
      return current.map((item, itemIndex) => itemIndex === index
        ? { ...item, quantity: operationType === "adjustment" ? parsedQuantity : Number(item.quantity) + parsedQuantity, unit: activeUnit }
        : item);
    });
    setQuantity(operationType === "adjustment" ? "0" : "1");
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

    setSaving(true);
    try {
      let result;
      if (operationType === "transfer") {
        result = await apiClient.post("/inventario/traslado-multiple", {
          fromWarehouseId: Number(fromWarehouseId),
          toWarehouseId: Number(toWarehouseId),
          items: operationItems,
          supportNote: supportNote.trim() || undefined,
        });
        setNotice(`Traslado completo registrado · ${result?.batchNumber ?? "grupo generado"}`);
      } else {
        const endpoint = { entry: "entrada", exit: "salida", adjustment: "ajuste" }[operationType];
        for (const item of operationItems) {
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

  async function openTicket(ticket) {
    setError("");
    try {
      const detail = await apiClient.get(`/inventario/traslados/tickets/${ticket.id}`);
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
        <button type="button" className="provider-close" aria-label="Cerrar traslados" onClick={onClose}><X size={17} /></button>
      </header>

      <div className="inventory-transfer-content">
        <div className="inventory-transfer-heading">
          <div>
            <span>OPERACIÓN DE INVENTARIO</span>
            <h2>{operationLabel(operationType)}</h2>
            <p>Agrega todos los productos de la operación y registra la trazabilidad en un solo paso.</p>
          </div>
          <button type="button" className="inventory-transfer-refresh" onClick={loadData} disabled={loading || saving}>
            <RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Actualizar
          </button>
        </div>

        <div className="inventory-operation-tabs" role="tablist" aria-label="Tipo de operación">
          {[
            ["transfer", "Traslados", ArrowLeftRight],
            ["entry", "Cargos / entradas", ArrowDownToLine],
            ["exit", "Descargos / salidas", ArrowUpFromLine],
            ["adjustment", "Ajustes", SlidersHorizontal],
          ].map(([type, label, Icon]) => (
            <button key={type} type="button" role="tab" aria-selected={operationType === type} className={operationType === type ? "is-active" : ""} onClick={() => { setOperationType(type); setOperationItems([]); setError(""); }} disabled={saving}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {error && <TransientMessage className="window-error" role="alert" onDismiss={() => setError("")}>{error}</TransientMessage>}
        {notice && <TransientMessage className="window-notice" role="status" onDismiss={() => setNotice("")}>{notice}</TransientMessage>}

        <div className="inventory-transfer-grid">
          <form className="inventory-transfer-form" onSubmit={submitOperation}>
            <div className="inventory-transfer-section-title"><Package size={15} /> Agregar producto</div>
            <label>Producto
              <select value={productId} onChange={(event) => setProductId(event.target.value)} disabled={loading || saving}>
                {products.map((product) => <option value={product.id} key={product.id}>{productCode(product)} · {productName(product)}</option>)}
              </select>
            </label>
            {operationType === "transfer" ? <div className="inventory-transfer-fields-two">
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
            </div> : <label>Bodega
              <select value={fromWarehouseId} onChange={(event) => setFromWarehouseId(event.target.value)} disabled={loading || saving}>
                {warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouseName(warehouse)}</option>)}
              </select>
            </label>}
            <div className="inventory-transfer-fields-two">
              <label>{operationType === "adjustment" ? "Cantidad objetivo" : "Cantidad"}
                <input type="text" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={loading || saving} placeholder="Ej. 1,5" />
              </label>
              <label>Unidad
                <select value={activeUnit} onChange={(event) => setUnit(event.target.value)} disabled={loading || saving}>
                  {unitOptions.map((option) => <option value={option} key={option}>{transferUnitLabel(option)}</option>)}
                </select>
              </label>
            </div>
            {operationType === "transfer" && <div className="inventory-transfer-stock-card">
              <span>Disponible en {warehouseName(selectedSource)}</span>
              <strong>{formatQuantity(availableBase)} UND</strong>
              <small>El traslado descontará {formatQuantity(transferBase)} UND y recibirá esa cantidad en {warehouseName(selectedDestination)}.</small>
            </div>}
            {operationType === "exit" && <div className="inventory-transfer-stock-card is-warning">
              <span>Disponible en {warehouseName(selectedSource)}</span>
              <strong>{formatQuantity(availableBase)} UND</strong>
            </div>}
            <button type="button" className="inventory-transfer-add" onClick={addOperationItem} disabled={loading || saving || !selectedProduct}>
              <Plus size={14} /> Agregar a la operación
            </button>
            {operationItems.length > 0 && <div className="inventory-operation-items" aria-label="Productos agregados">
              <strong>{operationItems.length} producto(s) agregado(s)</strong>
              {operationItems.map((item) => {
                const product = products.find((row) => Number(row.id) === Number(item.productId));
                return <div className="inventory-operation-item" key={item.productId}>
                  <span><b>{productCode(product)}</b> {productName(product)}</span>
                  <strong>{formatQuantity(item.quantity)} {item.unit}</strong>
                  <button type="button" onClick={() => setOperationItems((current) => current.filter((row) => row.productId !== item.productId))} aria-label={`Quitar ${productName(product)}`}><Trash2 size={13} /></button>
                </div>;
              })}
            </div>}
            <label>Motivo / referencia
              <input value={supportNote} onChange={(event) => setSupportNote(event.target.value)} placeholder="Ej. Reposición de Bodega B" disabled={loading || saving} />
            </label>
            <button type="submit" className="inventory-transfer-submit" disabled={loading || saving || !products.length || !warehouses.length || !operationItems.length}>
              {saving ? <LoaderCircle size={14} className="is-spinning" /> : <ClipboardCheck size={14} />} {saving ? "Registrando…" : `Registrar ${operationLabel(operationType).toLowerCase()}`}
            </button>
          </form>

          <section className="inventory-transfer-history" aria-label="Historial de tickets de traslado">
            <div className="inventory-transfer-section-title"><ClipboardCheck size={15} /> Historial de traslados</div>
            {loading ? <div className="inventory-transfer-empty"><LoaderCircle size={20} className="is-spinning" /> Cargando…</div> : tickets.length ? (
              <div className="inventory-transfer-table-wrap">
                <table className="inventory-transfer-table">
                  <thead><tr><th>Ticket</th><th>Producto</th><th>Ruta</th><th>Cantidad</th><th>Fecha</th><th /></tr></thead>
                  <tbody>{tickets.map((ticket) => <TransferTicketRow key={ticket.id} ticket={ticket} onOpen={openTicket} />)}</tbody>
                </table>
              </div>
            ) : <div className="inventory-transfer-empty"><ClipboardCheck size={24} /> Aún no hay traslados registrados.</div>}
          </section>
        </div>
      </div>

      {selectedTicket && <TransferTicketDetail ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}
      <footer className="provider-window-footer inventory-transfer-footer">
        <span>{tickets.length} ticket(s) cargado(s)</span>
        <div className="provider-navigation-actions"><button type="button" className="exit-action" onClick={onClose}><X size={14} /> Salir</button></div>
      </footer>
    </section>
  );
}

function TransferTicketRow({ ticket, onOpen }) {
  const movement = ticket.movement ?? {};
  return <tr>
    <td><strong>{ticket.batchNumber ?? ticket.ticketNumber}</strong><small className="inventory-ticket-line">{ticket.batchNumber ? ticket.ticketNumber : ""}</small></td>
    <td>{productName(movement.product)}</td>
    <td>{warehouseName(movement.fromWarehouse)} → {warehouseName(movement.toWarehouse)}</td>
    <td>{formatQuantity(movement.quantity)} UND</td>
    <td>{formatDate(ticket.createdAt)}</td>
    <td><button type="button" className="inventory-transfer-view" onClick={() => onOpen(ticket)}><Eye size={13} /> Ver detalle</button></td>
  </tr>;
}

function TransferTicketDetail({ ticket, onClose }) {
  const movement = ticket.movement ?? {};
  return <div className="inventory-transfer-detail-layer" role="presentation">
    <div className="inventory-transfer-detail" role="dialog" aria-modal="true" aria-label="Detalle del ticket de traslado">
      <header><strong>Detalle del traslado</strong><button type="button" onClick={onClose} aria-label="Cerrar detalle"><X size={16} /></button></header>
      <dl>
        <dt>Grupo / ticket</dt><dd>{ticket.batchNumber ?? ticket.ticketNumber}{ticket.batchNumber && ` · ${ticket.ticketNumber}`}</dd>
        <dt>Producto</dt><dd>{productName(movement.product)}</dd>
        <dt>Origen</dt><dd>{warehouseName(movement.fromWarehouse)}</dd>
        <dt>Destino</dt><dd>{warehouseName(movement.toWarehouse)}</dd>
        <dt>Cantidad</dt><dd>{formatQuantity(movement.quantity)} UND</dd>
        <dt>Estado</dt><dd>{ticket.status ?? movement.transferTicket?.status ?? "APROBADO"}</dd>
        <dt>Referencia</dt><dd>{ticket.supportNote || "—"}</dd>
        <dt>Registrado</dt><dd>{formatDate(ticket.createdAt)}</dd>
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
  return product?.code ?? product?.codigo ?? String(product?.id ?? "");
}

function warehouseName(warehouse) {
  return warehouse?.name ?? warehouse?.location ?? warehouse?.description ?? `Bodega #${warehouse?.id ?? ""}`;
}

function transferUnitLabel(unit) {
  return { UND: "Unidad", PAQUETE: "Paquete", CAJA: "Caja" }[unit] ?? unit;
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
