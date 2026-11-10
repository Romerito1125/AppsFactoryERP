import { useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { formatCop } from "@/lib/cop";
import { printInvoiceTickets } from "@/lib/invoice-ticket";
import "./returns-window.css";

// Imprimir facturas: busca facturas registradas por número, cliente o fecha y las imprime
// una por una o varias a la vez, con las copias pedidas (mismo ticket que Facturación).

const dateOnly = (value) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(new Date(value)) : "—";

const clientLabel = (client) =>
  client
    ? [client.firstName, client.lastName].filter(Boolean).join(" ") || client.identification || "—"
    : "Consumidor final";

const statusLabel = (status) => (status === "ANULADA" ? "Anulada" : status === "ACTIVA" ? "Activa" : status ?? "—");

export function InvoicePrintPanel({ invoices = [] }) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59`) : null;
    return invoices
      .filter((invoice) => {
        const created = new Date(invoice.createdAt);
        if (start && created < start) return false;
        if (end && created > end) return false;
        return (
          !query ||
          `${invoice.consecutive} ${clientLabel(invoice.client)} ${invoice.status ?? ""}`.toLowerCase().includes(query)
        );
      })
      .sort((left, right) => Number(right.id) - Number(left.id))
      .slice(0, 300);
  }, [invoices, search, from, to]);

  const selectedInvoices = useMemo(
    () => invoices.filter((invoice) => selectedIds.has(invoice.id)),
    [invoices, selectedIds],
  );

  function toggle(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    const visibleIds = rows.map((invoice) => invoice.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of visibleIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function printInvoices(list) {
    if (!list.length) {
      setError("Selecciona al menos una factura para imprimir.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Se consulta cada factura completa: trae líneas, medios de pago, vendedor y cajero.
      const full = [];
      for (const invoice of list) {
        full.push(await apiClient.get(`/facturas/${invoice.id}`));
      }
      printInvoiceTickets(full, copies);
      setNotice(`Se enviaron ${full.length} factura(s) a impresión, ${copies} copia(s) cada una.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const allVisibleSelected = rows.length > 0 && rows.every((invoice) => selectedIds.has(invoice.id));

  return (
    <div className="returns-window invoice-print-window" aria-label="Imprimir facturas">
      <section className="rw-history" aria-label="Facturas para imprimir">
        <div className="rw-history-bar">
          <h3>
            <Printer size={14} /> Imprimir facturas
          </h3>
          <div className="rw-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Número de factura, cliente o estado…"
              aria-label="Buscar facturas"
            />
          </div>
          <label>Desde <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Hasta <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label>
            Copias
            <select value={copies} onChange={(event) => setCopies(Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <span className="rw-count">{rows.length} factura(s)</span>
        </div>

        <div className="rw-actions invoice-print-actions">
          <button type="button" onClick={toggleVisible} disabled={!rows.length}>
            {allVisibleSelected ? "Quitar selección visible" : "Seleccionar visibles"}
          </button>
          <span className="rw-count">{selectedInvoices.length} seleccionada(s)</span>
          <button
            type="button"
            className="rw-primary"
            disabled={busy || !selectedInvoices.length}
            onClick={() => printInvoices(selectedInvoices)}
          >
            {busy ? "Preparando…" : `Imprimir seleccionadas (${selectedInvoices.length})`}
          </button>
        </div>

        {(error || notice) && (
          <div className="rw-messages">
            {error && <p className="rw-error" role="alert">{error}</p>}
            {notice && <p className="rw-notice" role="status">{notice}</p>}
          </div>
        )}

        <div className="rw-table-scroll rw-history-body">
          <table className="rw-table">
            <thead>
              <tr>
                <th aria-label="Seleccionar" />
                <th>Factura</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Modalidad</th>
                <th>Estado</th>
                <th className="rw-num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id} className={selectedIds.has(invoice.id) ? "is-picked" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      className="invoice-print-check"
                      checked={selectedIds.has(invoice.id)}
                      onChange={() => toggle(invoice.id)}
                      aria-label={`Seleccionar factura ${invoice.consecutive}`}
                    />
                  </td>
                  <td><b>{invoice.consecutive}</b></td>
                  <td>{dateOnly(invoice.createdAt)}</td>
                  <td>{clientLabel(invoice.client)}</td>
                  <td>{invoice.createdByUser?.username ?? "—"}</td>
                  <td>{invoice.saleMode ?? "—"}</td>
                  <td>{statusLabel(invoice.status)}</td>
                  <td className="rw-num">{formatCop(invoice.total)}</td>
                  <td>
                    <button type="button" className="rw-print" disabled={busy} onClick={() => printInvoices([invoice])}>
                      <Printer size={12} /> Imprimir
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="9" className="rw-empty">No hay facturas para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
