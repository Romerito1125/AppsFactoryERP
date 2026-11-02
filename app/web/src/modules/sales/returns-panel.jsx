import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import "./returns-panel.css";

const money = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";

const clientLabel = (client) =>
  client
    ? `${client.identification ?? ""} · ${[client.firstName, client.lastName]
        .filter(Boolean)
        .join(" ")}`
    : "—";

/**
 * Devoluciones parciales con historial permanente (#56, #58, #61).
 * Autocontenido: consulta sus propios datos y avisa con onCreated.
 */
export function ReturnsPanel({ invoices, bankAccounts, canCreate, onCreated }) {
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiClient.get("/devoluciones", {
        q: search.trim() || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      });
      setHistory(Array.isArray(rows) ? rows : []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [search, from, to]);

  useEffect(() => {
    const timer = setTimeout(loadHistory, 250);
    return () => clearTimeout(timer);
  }, [loadHistory]);

  const candidates = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    return invoices
      .filter((invoice) => invoice.status === "ACTIVA")
      .filter(
        (invoice) =>
          !query ||
          `${invoice.consecutive} ${clientLabel(invoice.client)}`
            .toLowerCase()
            .includes(query),
      )
      .slice(0, 40);
  }, [invoices, invoiceSearch]);

  async function selectInvoice(id) {
    setInvoiceId(id);
    setDetail(null);
    setQuantities({});
    setError("");
    setNotice("");
    if (!id) return;
    try {
      setDetail(await apiClient.get(`/devoluciones/factura/${id}`));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const estimate = useMemo(() => {
    if (!detail) return { total: 0, creditApplied: 0, remainder: 0 };
    const total = detail.items.reduce(
      (sum, item) => sum + Number(quantities[item.invoiceItemId] || 0) * item.unitTotal,
      0,
    );
    const creditBalance = detail.invoice.creditBalance;
    const creditApplied =
      creditBalance === null ? 0 : Math.min(total, Math.max(creditBalance, 0));
    return {
      total: Math.round(total * 100) / 100,
      creditApplied: Math.round(creditApplied * 100) / 100,
      remainder: Math.round((total - creditApplied) * 100) / 100,
    };
  }, [detail, quantities]);

  function setQuantity(item, raw) {
    if (!/^\d*([.,]\d{0,3})?$/.test(raw)) return;
    const value = Number(raw.replace(",", "."));
    const next =
      Number.isFinite(value) && value > item.available ? String(item.available) : raw;
    setQuantities((current) => ({ ...current, [item.invoiceItemId]: next }));
  }

  async function submit() {
    setError("");
    setNotice("");
    const items = detail.items
      .map((item) => ({
        invoiceItemId: item.invoiceItemId,
        quantity: Number(String(quantities[item.invoiceItemId] ?? "").replace(",", ".")),
      }))
      .filter((item) => item.quantity > 0);
    if (!items.length) return setError("Indica la cantidad a devolver de al menos una línea.");
    if (reason.trim().length < 3) return setError("Escribe el motivo de la devolución.");
    if (estimate.remainder > 0.009 && !refundMethod) {
      return setError(
        `Elige cómo se devuelven ${money(estimate.remainder)} ya pagados: de una cuenta o como saldo a favor.`,
      );
    }
    if (refundMethod === "CUENTA" && estimate.remainder > 0.009 && !bankAccountId) {
      return setError("Selecciona la cuenta de la que sale el dinero.");
    }
    setSaving(true);
    try {
      const created = await apiClient.post("/devoluciones", {
        invoiceId: Number(invoiceId),
        reason: reason.trim(),
        items,
        ...(estimate.remainder > 0.009
          ? {
              refundMethod,
              ...(refundMethod === "CUENTA"
                ? { bankAccountId: Number(bankAccountId) }
                : {}),
            }
          : {}),
      });
      setNotice(`Devolución ${created.consecutive} registrada por ${money(created.total)}.`);
      setReason("");
      setQuantities({});
      setRefundMethod("");
      await selectInvoice(invoiceId);
      await loadHistory();
      onCreated?.(created);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="returns-panel">
      {canCreate && (
        <section className="returns-form" aria-label="Nueva devolución">
          <h3>
            <RotateCcw size={14} /> Nueva devolución
          </h3>
          <div className="returns-invoice-pick">
            <input
              value={invoiceSearch}
              onChange={(event) => setInvoiceSearch(event.target.value)}
              placeholder="Buscar factura activa por número o cliente"
              aria-label="Buscar factura"
            />
            <select
              value={invoiceId}
              onChange={(event) => selectInvoice(event.target.value)}
              aria-label="Factura a devolver"
            >
              <option value="">Selecciona una factura</option>
              {candidates.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.consecutive} · {clientLabel(invoice.client)} · {money(invoice.total)}
                </option>
              ))}
            </select>
          </div>
          {detail && (
            <>
              <div className="returns-context">
                <span>Cliente: <b>{clientLabel(detail.invoice.client)}</b></span>
                <span>Modalidad: <b>{detail.invoice.saleMode}</b></span>
                {detail.invoice.creditBalance !== null && (
                  <span>Deuda pendiente: <b>{money(detail.invoice.creditBalance)}</b></span>
                )}
              </div>
              <table className="returns-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Vendido</th>
                    <th>Devuelto</th>
                    <th>Disponible</th>
                    <th>Valor unitario (IVA incl.)</th>
                    <th>Devolver</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.invoiceItemId}>
                      <td>{item.productName}</td>
                      <td>{item.sold}</td>
                      <td>{item.returned}</td>
                      <td>{item.available}</td>
                      <td>{money(item.unitTotal)}</td>
                      <td>
                        <input
                          inputMode="decimal"
                          disabled={item.available <= 0}
                          value={quantities[item.invoiceItemId] ?? ""}
                          onChange={(event) => setQuantity(item, event.target.value)}
                          aria-label={`Cantidad a devolver de ${item.productName}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="returns-fields">
                <label>
                  <span>Motivo</span>
                  <input value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
                {estimate.remainder > 0.009 && (
                  <>
                    <label>
                      <span>Valor ya pagado a devolver: {money(estimate.remainder)}</span>
                      <select
                        value={refundMethod}
                        onChange={(event) => setRefundMethod(event.target.value)}
                      >
                        <option value="">¿Cómo se devuelve?</option>
                        <option value="CUENTA">Devolver dinero desde una cuenta</option>
                        <option value="SALDO_FAVOR">Dejar como saldo a favor del cliente</option>
                      </select>
                    </label>
                    {refundMethod === "CUENTA" && (
                      <label>
                        <span>Cuenta de salida</span>
                        <select
                          value={bankAccountId}
                          onChange={(event) => setBankAccountId(event.target.value)}
                        >
                          <option value="">Selecciona una cuenta</option>
                          {bankAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                )}
              </div>
              <div className="returns-summary">
                <span>Total a devolver <b>{money(estimate.total)}</b></span>
                <span>Reduce deuda <b>{money(estimate.creditApplied)}</b></span>
                <span>Dinero / saldo a favor <b>{money(estimate.remainder)}</b></span>
                <button
                  type="button"
                  className="primary-action"
                  disabled={saving || estimate.total <= 0}
                  onClick={submit}
                >
                  {saving ? "Registrando…" : "Registrar devolución"}
                </button>
              </div>
            </>
          )}
          {error && <p className="returns-error" role="alert">{error}</p>}
          {notice && <p className="returns-notice" role="status">{notice}</p>}
        </section>
      )}

      <section className="returns-history" aria-label="Historial de devoluciones">
        <div className="returns-filters">
          <h3>Historial de devoluciones</h3>
          <div className="returns-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Factura, cliente, producto, motivo…"
              aria-label="Buscar devoluciones"
            />
          </div>
          <label>Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <span>{loading ? "Consultando…" : `${history.length} registro(s)`}</span>
        </div>
        <table className="returns-table">
          <thead>
            <tr>
              <th>Devolución</th>
              <th>Fecha</th>
              <th>Factura</th>
              <th>Cliente</th>
              <th>Productos</th>
              <th>Motivo</th>
              <th>Total</th>
              <th>Reduce deuda</th>
              <th>Dinero</th>
              <th>Saldo a favor</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id}>
                <td>{row.consecutive}</td>
                <td>{dateTime(row.createdAt)}</td>
                <td>{row.invoice?.consecutive}</td>
                <td>{clientLabel(row.client)}</td>
                <td>
                  {row.items
                    .map((item) => `${item.quantity} × ${item.invoiceItem?.product?.name ?? item.productId}`)
                    .join(", ")}
                </td>
                <td>{row.reason}</td>
                <td>{money(row.total)}</td>
                <td>{money(row.creditApplied)}</td>
                <td>{money(row.refundedAmount)}</td>
                <td>{money(row.advanceAmount)}</td>
                <td>{row.createdByUsername ?? "—"}</td>
              </tr>
            ))}
            {!history.length && (
              <tr>
                <td colSpan="11" className="returns-empty">
                  No hay devoluciones para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
