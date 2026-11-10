import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, FileText, Printer, RotateCcw, Search, Trash2, X } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { formatCop } from "@/lib/cop";
import { printReturnNote } from "@/lib/return-print";
import "./returns-window.css";

// Devolución de venta (y de nota de entrega): devuelve una o varias líneas de una factura,
// emite la nota crédito y deja cada devolución en el historial, que siempre queda visible.
// Si la factura fue a crédito, la nota reduce su deuda primero; el resto se devuelve en dinero
// desde una cuenta o queda como saldo a favor del cliente (lo decide el backend).

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const parseQty = (raw) => Number(String(raw ?? "").replace(",", "."));
const isDraft = (value) => /^\d*([.,]\d{0,3})?$/.test(value);

const dateTime = (value) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const dateOnly = (value) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(new Date(value)) : "—";

const personName = (person) =>
  person ? [person.firstName, person.lastName].filter(Boolean).join(" ") || person.identification || "—" : "Consumidor final";

const clientLabel = (client) =>
  client ? `${client.identification ?? ""} · ${personName(client)}` : "Consumidor final";

const sellerName = (invoice) => invoice?.createdByUser?.username ?? "—";

function InvoiceLookupDialog({ invoices, isDelivery, deliveryByInvoice, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices
      .filter((invoice) => !query || `${invoice.consecutive} ${clientLabel(invoice.client)}`.toLowerCase().includes(query))
      .slice(0, 200);
  }, [invoices, search]);

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div className="module-dialog-backdrop rw-backdrop">
      <section className="module-dialog rw-lookup" role="dialog" aria-modal="true" aria-label="Buscar factura" onKeyDown={handleKeyDown}>
        <header className="module-dialog-titlebar">
          <strong>{isDelivery ? "BUSCAR NOTA DE ENTREGA" : "BUSCAR FACTURA"}</strong>
          <button type="button" aria-label="Cerrar" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="rw-lookup-search">
          <Search size={14} />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número de factura o cliente"
            aria-label="Buscar factura"
          />
        </div>
        <div className="rw-table-scroll rw-lookup-body">
          <table className="rw-table">
            <thead>
              <tr>
                <th>Factura</th>
                {isDelivery && <th>Nota de entrega</th>}
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Modalidad</th>
                <th className="rw-num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id} onDoubleClick={() => onSelect(invoice)}>
                  <td><b>{invoice.consecutive}</b></td>
                  {isDelivery && <td>N.E. {deliveryByInvoice.get(Number(invoice.id))?.id}</td>}
                  <td>{dateOnly(invoice.createdAt)}</td>
                  <td>{clientLabel(invoice.client)}</td>
                  <td>{invoice.saleMode ?? "—"}</td>
                  <td className="rw-num">{formatCop(invoice.total)}</td>
                  <td>
                    <button type="button" onClick={() => onSelect(invoice)}>Seleccionar</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={isDelivery ? 7 : 6} className="rw-empty">No hay facturas activas para devolver.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ReturnsWindow({
  mode = "invoice",
  focusHistory = false,
  invoices = [],
  deliveries = [],
  bankAccounts = [],
  canView = true,
  canCreate = false,
  onCreated,
}) {
  const isDelivery = mode === "delivery";
  const deliveryByInvoice = useMemo(() => {
    const map = new Map();
    for (const delivery of deliveries) {
      const invoiceId = Number(delivery.invoiceId ?? delivery.invoice?.id);
      if (invoiceId) map.set(invoiceId, delivery);
    }
    return map;
  }, [deliveries]);
  const sourceInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.status === "ACTIVA" && (!isDelivery || deliveryByInvoice.has(Number(invoice.id))),
      ),
    [invoices, isDelivery, deliveryByInvoice],
  );

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [detail, setDetail] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [lookupOpen, setLookupOpen] = useState(false);
  const [totalizeOpen, setTotalizeOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastNote, setLastNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState(focusHistory ? "history" : "new");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await apiClient.get("/devoluciones", {
        q: historySearch.trim() || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      });
      setHistory(Array.isArray(rows) ? rows : []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [historySearch, from, to]);

  useEffect(() => {
    if (!canView) return undefined;
    const timer = setTimeout(loadHistory, 250);
    return () => clearTimeout(timer);
  }, [loadHistory, canView]);

  useEffect(() => {
    if (focusHistory) setTab("history");
  }, [focusHistory]);

  const visibleHistory = useMemo(
    () => (isDelivery ? history.filter((row) => deliveryByInvoice.has(Number(row.invoice?.id))) : history),
    [history, isDelivery, deliveryByInvoice],
  );

  const lines = useMemo(
    () =>
      (detail?.items ?? []).map((item) => {
        const quantity = Math.min(item.available, Math.max(0, parseQty(quantities[item.invoiceItemId]) || 0));
        const total = round(quantity * item.unitTotal);
        const taxes = round(total - total / (1 + item.taxRate / 100));
        return { item, quantity, total, taxes };
      }),
    [detail, quantities],
  );

  const totals = useMemo(() => {
    const total = round(lines.reduce((sum, line) => sum + line.total, 0));
    const taxes = round(lines.reduce((sum, line) => sum + line.taxes, 0));
    const units = round(lines.reduce((sum, line) => sum + line.quantity, 0));
    const creditBalance = detail?.invoice.creditBalance ?? null;
    const creditApplied = creditBalance === null ? 0 : round(Math.min(total, Math.max(creditBalance, 0)));
    return {
      total,
      taxes,
      subtotal: round(total - taxes),
      units,
      creditBalance,
      creditApplied,
      remainder: round(total - creditApplied),
    };
  }, [lines, detail]);

  function clearAll() {
    setSelectedInvoice(null);
    setDetail(null);
    setQuantities({});
    setReason("");
    setNotes("");
    setRefundMethod("");
    setBankAccountId("");
    setError("");
    setNotice("");
    setLastNote(null);
  }

  async function chooseInvoice(invoice) {
    setLookupOpen(false);
    setError("");
    setNotice("");
    setLastNote(null);
    setQuantities({});
    setSelectedInvoice(invoice);
    try {
      setDetail(await apiClient.get(`/devoluciones/factura/${invoice.id}`));
    } catch (requestError) {
      setDetail(null);
      setError(requestError.message);
    }
  }

  function setQuantity(item, raw) {
    if (!isDraft(raw)) return;
    const value = parseQty(raw);
    const next = Number.isFinite(value) && value > item.available ? String(item.available) : raw;
    setQuantities((current) => ({ ...current, [item.invoiceItemId]: next }));
  }

  function validateNote() {
    if (!detail) return "Selecciona la factura de origen (F1).";
    if (!lines.some((line) => line.quantity > 0)) return "Indica la cantidad a devolver de al menos un producto.";
    if (reason.trim().length < 3) return "Escribe el detalle de la nota crédito (mínimo 3 caracteres).";
    if (totals.remainder > 0.009 && !refundMethod) {
      return `Elige cómo se devuelven ${formatCop(totals.remainder)} ya pagados: de una cuenta o como saldo a favor.`;
    }
    if (refundMethod === "CUENTA" && totals.remainder > 0.009 && !bankAccountId) {
      return "Selecciona la cuenta de la que sale el dinero.";
    }
    return "";
  }

  function openTotalize() {
    if (!detail) {
      setError("Selecciona la factura de origen (F1).");
      return;
    }
    if (!lines.some((line) => line.quantity > 0)) {
      setError("Indica la cantidad a devolver de al menos un producto.");
      return;
    }
    setError("");
    setTotalizeOpen(true);
  }

  async function submitNote() {
    if (saving) return;
    const problem = validateNote();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const created = await apiClient.post("/devoluciones", {
        invoiceId: detail.invoice.id,
        reason: reason.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        items: lines
          .filter((line) => line.quantity > 0)
          .map((line) => ({ invoiceItemId: line.item.invoiceItemId, quantity: line.quantity })),
        ...(totals.remainder > 0.009
          ? {
              refundMethod,
              ...(refundMethod === "CUENTA" ? { bankAccountId: Number(bankAccountId) } : {}),
            }
          : {}),
      });
      setLastNote(created);
      setNotice(`Nota crédito ${created.consecutive} registrada por ${formatCop(created.total)}.`);
      setTotalizeOpen(false);
      setReason("");
      setNotes("");
      setRefundMethod("");
      setBankAccountId("");
      setQuantities({});
      setDetail(await apiClient.get(`/devoluciones/factura/${detail.invoice.id}`));
      await loadHistory();
      onCreated?.(created);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event) {
    if (totalizeOpen || lookupOpen) return;
    if (event.key === "F1" && canCreate) {
      event.preventDefault();
      setLookupOpen(true);
    } else if (event.key === "F8" && canCreate) {
      event.preventDefault();
      openTotalize();
    } else if (event.key === "F5") {
      event.preventDefault();
      setTab("history");
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearAll();
    }
  }

  function handleDialogKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      setTotalizeOpen(false);
    } else if (event.key === "F3") {
      event.preventDefault();
      submitNote();
    }
  }

  if (!canView) {
    return <div className="module-loading">No tienes permiso para ver devoluciones.</div>;
  }

  const title = isDelivery ? "DEVOLUCIÓN DE NOTA DE ENTREGA (Dev.N.E.)" : "DEVOLUCIÓN DE VENTA";
  const deliveryOfSelected = selectedInvoice ? deliveryByInvoice.get(Number(selectedInvoice.id)) : null;
  const pickedSummary = lines
    .filter((line) => line.quantity > 0)
    .map((line) => `${line.quantity} × ${line.item.productName}`)
    .join(", ");
  const isCredit = Boolean(detail) && detail.invoice.creditBalance !== null;
  const blankRows = Math.max(12, 20 - (detail?.items.length ?? 0));
  const openLookup = () => canCreate && setLookupOpen(true);
  const shortcuts = [
    ["F1", "Factura", openLookup, FileText],
    ["F5", "Historial", () => setTab("history"), RotateCcw],
    ["F8", "Totalizar", openTotalize, Check],
    ["Esc", "Limpiar", clearAll, Trash2],
  ];

  return (
    <div className="sales-billing-panel sales-billing-single returns-billing" tabIndex={0} onKeyDown={handleKeyDown} aria-label={title}>
      <div className="sales-billing-tabs" role="tablist" aria-label="Devoluciones">
        <button type="button" role="tab" className={tab === "new" ? "is-active" : ""} aria-selected={tab === "new"} onClick={() => setTab("new")}>
          {isDelivery ? "Emitir Dev.N.E." : "Emitir devolución"}
        </button>
        <button type="button" role="tab" className={tab === "history" ? "is-active" : ""} aria-selected={tab === "history"} onClick={() => setTab("history")}>
          Devoluciones registradas <span>{visibleHistory.length}</span>
        </button>
      </div>

      {tab === "new" ? (
        <aside className="sales-ticket-panel">
          <div className="sales-billing-top">
            <div className="sales-billing-context">
              <div className="sales-legacy-context">
                <div className="sales-context-field">
                  <div className="sales-context-field-top">
                    <span>{isDelivery ? "N. Entrega" : "Factura"}</span>
                    <input value={selectedInvoice?.consecutive ?? ""} placeholder="Buscar" readOnly aria-label="Factura de origen" onClick={openLookup} />
                    <button type="button" onClick={openLookup} aria-label="F1 Factura">F1</button>
                  </div>
                  <strong>
                    {selectedInvoice
                      ? `Factura ${selectedInvoice.consecutive}${deliveryOfSelected ? ` · N.E. ${deliveryOfSelected.id}` : ""}`
                      : "Selecciona la factura a devolver"}
                  </strong>
                </div>
                <div className="sales-context-field">
                  <div className="sales-context-field-top">
                    <span>Cliente</span>
                    <input value={detail?.invoice.client?.identification ?? ""} readOnly aria-label="Cliente" />
                  </div>
                  <strong>{detail ? personName(detail.invoice.client) : "—"}</strong>
                </div>
                <div className="sales-context-field">
                  <div className="sales-context-field-top">
                    <span>Vendedor</span>
                    <input value={selectedInvoice?.createdByUser?.id ? `U${selectedInvoice.createdByUser.id}` : ""} readOnly aria-label="Vendedor" />
                  </div>
                  <strong>{sellerName(selectedInvoice)}</strong>
                </div>
                <div className="sales-context-field">
                  <div className="sales-context-field-top">
                    <span>Depósito</span>
                    <input value={selectedInvoice?.warehouse ? String(selectedInvoice.warehouse.id).padStart(3, "0") : ""} readOnly aria-label="Depósito" />
                  </div>
                  <strong>{selectedInvoice?.warehouse?.location ?? "—"}</strong>
                </div>
              </div>
              <div className="sales-shortcut-bar" aria-label="Atajos de devolución">
                {shortcuts.map(([key, label, action, Icon]) => (
                  <button type="button" key={key} onClick={action} disabled={!canCreate && key !== "F5"}>
                    <kbd>{key}</kbd>
                    <Icon size={13} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div className="sales-payment-box">
                <div className="sales-payment-heading">
                  <span>Total a devolver</span>
                  <strong>{formatCop(totals.total)}</strong>
                </div>
                <small className="sales-credit-hint">
                  {!detail
                    ? "Puedes devolver un solo producto, algunas unidades o toda la factura."
                    : isCredit
                      ? `Factura a crédito · deuda ${formatCop(detail.invoice.creditBalance)}: la nota reduce primero esa deuda.`
                      : "Factura de contado: lo devuelto sale de una cuenta o queda como saldo a favor."}
                </small>
                <small className="sales-credit-hint">«Totalizar» abre Total operación · Emisión de notas de crédito.</small>
              </div>
            </div>
            <aside className="sales-billing-totals" aria-label="Totales de la nota crédito">
              <strong>Nota crédito N° {lastNote?.consecutive ?? "por asignar"}</strong>
              <div><span>Total renglones</span><b>{formatCop(totals.subtotal)}</b></div>
              <div><span>Impuestos</span><b>{formatCop(totals.taxes)}</b></div>
              <div><span>Total</span><b>{formatCop(totals.total)}</b></div>
              <div><span>Reduce deuda</span><b>{formatCop(totals.creditApplied)}</b></div>
              <div><span>Vuelto</span><b>{formatCop(totals.remainder)}</b></div>
              <footer><span>Total cantidad o piezas</span><b>{totals.units}</b></footer>
            </aside>
          </div>

          <div className="sales-cart">
            <div className="sales-cart-table-wrap">
              <table className="sales-cart-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Vendido</th>
                    <th>Devuelto</th>
                    <th>Cantidad</th>
                    <th>Und</th>
                    <th>Precio</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.items ?? []).map((item, index) => {
                    const line = lines[index];
                    return (
                      <tr key={item.invoiceItemId}>
                        <td><strong>{item.productId}</strong></td>
                        <td className="sales-cart-description-cell"><strong>{item.productName}</strong></td>
                        <td>{item.sold}</td>
                        <td>{item.returned}</td>
                        <td>
                          <input
                            className="rw-qty-input"
                            inputMode="decimal"
                            placeholder={item.available > 0 ? `máx ${item.available}` : "—"}
                            disabled={!canCreate || item.available <= 0}
                            value={quantities[item.invoiceItemId] ?? ""}
                            onChange={(event) => setQuantity(item, event.target.value)}
                            aria-label={`Cantidad a devolver de ${item.productName}`}
                          />
                        </td>
                        <td>UND</td>
                        <td>{formatCop(item.unitTotal)}</td>
                        <td className="sales-cart-total">{formatCop(line.total)}</td>
                      </tr>
                    );
                  })}
                  {Array.from({ length: blankRows }, (_, index) => (
                    <tr
                      className="sales-cart-empty-row"
                      key={`empty-${index}`}
                      onClick={!detail && index === 0 ? openLookup : undefined}
                    >
                      <td colSpan={8}>{!detail && index === 0 ? "F1 · Selecciona la factura para cargar sus productos" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sales-cart-summary">
              <span>Subtotal <strong>{formatCop(totals.subtotal)}</strong></span>
              <span>IVA <strong>{formatCop(totals.taxes)}</strong></span>
              <span className="is-total">Total <strong>{formatCop(totals.total)}</strong></span>
            </div>
          </div>

          {(error || notice) && (
            <div className="rw-messages">
              {error && <p className="rw-error" role="alert">{error}</p>}
              {notice && (
                <p className="rw-notice" role="status">
                  {notice}
                  {lastNote && (
                    <button type="button" onClick={() => printReturnNote(lastNote)}>
                      <Printer size={13} /> Imprimir nota crédito
                    </button>
                  )}
                </p>
              )}
            </div>
          )}

          <div className="sales-document-footer">
            <button
              type="button"
              className="sales-submit-button sales-submit-footer-button"
              onClick={openTotalize}
              disabled={!canCreate || saving}
            >
              <Check size={13} /> Totalizar devolución
            </button>
          </div>
        </aside>
      ) : (
        <section className="rw-history returns-history-tab" aria-label="Devoluciones registradas">
          <div className="rw-history-bar">
            <h3>
              <RotateCcw size={14} />
              {isDelivery ? "Devoluciones de notas de entrega" : "Devoluciones registradas"}
            </h3>
            <div className="rw-search">
              <Search size={14} />
              <input
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Factura, cliente, producto, motivo…"
                aria-label="Buscar devoluciones"
              />
            </div>
            <label>Desde <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>Hasta <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <span className="rw-count">{historyLoading ? "Consultando…" : `${visibleHistory.length} registro(s)`}</span>
          </div>
          <div className="rw-table-scroll rw-history-body">
            <table className="rw-table">
              <thead>
                <tr>
                  <th>Nota crédito</th>
                  <th>Fecha</th>
                  <th>Origen</th>
                  <th>Factura</th>
                  <th>Cliente</th>
                  <th>Productos</th>
                  <th>Motivo</th>
                  <th className="rw-num">Total</th>
                  <th className="rw-num">Reduce deuda</th>
                  <th className="rw-num">Dinero</th>
                  <th className="rw-num">Saldo a favor</th>
                  <th>Usuario</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((row) => {
                  const fromDelivery = deliveryByInvoice.has(Number(row.invoice?.id));
                  return (
                    <tr key={row.id}>
                      <td><b>{row.consecutive}</b></td>
                      <td>{dateTime(row.createdAt)}</td>
                      <td><span className={`rw-origin${fromDelivery ? " is-delivery" : ""}`}>{fromDelivery ? "Nota entrega" : "Factura"}</span></td>
                      <td>{row.invoice?.consecutive ?? "—"}</td>
                      <td>{personName(row.client)}</td>
                      <td className="rw-wrap">{row.items.map((item) => `${item.quantity} × ${item.invoiceItem?.product?.name ?? item.productId}`).join(", ")}</td>
                      <td className="rw-wrap">{row.reason}</td>
                      <td className="rw-num">{formatCop(row.total)}</td>
                      <td className="rw-num">{formatCop(row.creditApplied)}</td>
                      <td className="rw-num">{formatCop(row.refundedAmount)}</td>
                      <td className="rw-num">{formatCop(row.advanceAmount)}</td>
                      <td>{row.createdByUsername ?? "—"}</td>
                      <td>
                        <button type="button" className="rw-print" onClick={() => printReturnNote(row)}>
                          <Printer size={12} /> Imprimir
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!visibleHistory.length && (
                  <tr>
                    <td colSpan="13" className="rw-empty">No hay devoluciones para mostrar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {lookupOpen && (
        <InvoiceLookupDialog
          invoices={sourceInvoices}
          isDelivery={isDelivery}
          deliveryByInvoice={deliveryByInvoice}
          onSelect={chooseInvoice}
          onClose={() => setLookupOpen(false)}
        />
      )}

      {totalizeOpen && detail && (
        <div className="module-dialog-backdrop rw-backdrop">
          <section
            className="module-dialog rw-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Total operación de la devolución"
            onKeyDown={handleDialogKeyDown}
          >
            <header className="module-dialog-titlebar">
              <strong>TOTAL OPERACIÓN · {title}</strong>
              <button type="button" aria-label="Cerrar" onClick={() => setTotalizeOpen(false)}>
                <X size={17} />
              </button>
            </header>
            <div className="rw-dialog-tab">Emisión de notas de crédito</div>
            <div className="rw-table-scroll">
              <table className="rw-table rw-credit-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Número</th>
                    <th>Detalle</th>
                    <th>Vende</th>
                    <th>Emisión</th>
                    <th>Vence</th>
                    <th className="rw-num">Saldo</th>
                    <th className="rw-num">Cancelado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>FAC</td>
                    <td>{detail.invoice.consecutive}</td>
                    <td>{pickedSummary || "—"}</td>
                    <td>{sellerName(selectedInvoice)}</td>
                    <td>{dateOnly(selectedInvoice?.createdAt)}</td>
                    <td>{selectedInvoice?.credit?.dueDate ? dateOnly(selectedInvoice.credit.dueDate) : "—"}</td>
                    <td className="rw-num">{totals.creditBalance === null ? "Contado" : formatCop(totals.creditBalance)}</td>
                    <td className="rw-num">{formatCop(totals.creditApplied)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="rw-dialog-hint">
              La nota reduce la deuda de la factura de origen. Las demás facturas del cliente no cambian.
            </p>
            <div className="rw-dialog-grid">
              <label>
                <span>Monto nota crédito</span>
                <output>{formatCop(totals.total)}</output>
              </label>
              <label>
                <span>Nota crédito N°</span>
                <output>Se asigna al guardar</output>
              </label>
              <label className="rw-wide">
                <span>Detalle nota crédito *</span>
                <input value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
              </label>
              <label className="rw-wide">
                <span>Comentarios</span>
                <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
              <label>
                <span>Vendedor</span>
                <output>{sellerName(selectedInvoice)}</output>
              </label>
              {totals.remainder > 0.009 && (
                <>
                  <label>
                    <span>Cómo se devuelve {formatCop(totals.remainder)} *</span>
                    <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}>
                      <option value="">Elige…</option>
                      <option value="CUENTA">Devolver dinero desde una cuenta</option>
                      <option value="SALDO_FAVOR">Dejar como saldo a favor del cliente</option>
                    </select>
                  </label>
                  {refundMethod === "CUENTA" && (
                    <label>
                      <span>Cuenta de salida *</span>
                      <select value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
                        <option value="">Selecciona una cuenta</option>
                        {bankAccounts.map((account) => (
                          <option key={account.id} value={account.id}>{account.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
            {error && <p className="totalize-error" role="alert">{error}</p>}
            <footer className="module-dialog-footer">
              <span className="rw-dialog-summary">
                Total {formatCop(totals.total)} · Reduce deuda {formatCop(totals.creditApplied)} · Dinero {formatCop(totals.remainder)}
              </span>
              <button type="button" className="primary-action" disabled={saving} onClick={submitNote}>
                {saving ? "Registrando…" : "F3 Aceptar"}
              </button>
              <button type="button" onClick={() => setTotalizeOpen(false)}>Esc Cancelar</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
