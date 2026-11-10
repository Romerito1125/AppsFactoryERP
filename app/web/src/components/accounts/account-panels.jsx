import { useCallback, useEffect, useMemo, useState } from "react";

import "./account-panels.css";
import { formatCop } from "@/lib/cop";
import { toDateInputLocal } from "@/lib/date-input";

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Saint muestra fechas cortas: 19/08/26.
export const shortDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }).format(new Date(value))
    : "";

const longDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "";

const toInput = (date) => {
  return toDateInputLocal(date);
};

/* ------------------------------- Operaciones ------------------------------- */

/**
 * "Operaciones a realizar": las mismas tarjetas de Saint. Todas tienen función.
 */
export function AccountOperations({
  kind, // "cobrar" | "pagar"
  onInvoices,
  onSchedule,
  onDebitNotes,
  onPayment,
  onAdvances,
  onCreditNotes,
  onVoidNotes,
}) {
  const cards = [
    ["Facturas", onInvoices],
    ["Giros o cuotas", onSchedule],
    ["Notas de débito", onDebitNotes],
    ["Pagos y abonos", onPayment],
    [kind === "cobrar" ? "Anticipos y saldos a favor" : "Anticipos a proveedores", onAdvances],
    ["Notas de crédito", onCreditNotes],
    ["Anular Notas crédito / Anticipos", onVoidNotes],
  ];
  return (
    <div className="saint-ops">
      <div className="saint-ops-title">Operaciones a realizar</div>
      <div className="saint-ops-grid">
        {cards.map(([label, action]) => (
          <button key={label} type="button" className="saint-ops-card" onClick={action}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Estado de cuenta ----------------------------- */

const prefix = { FACTURA: "FAC", ABONO: "PAG", DEVOLUCION: "DEV", ANULACION: "ANU" };

function rowLabel(row) {
  const detail = String(row.detail ?? "").split(" · ")[0];
  if (row.kind === "ABONO") return `PAG ${row.number} ${detail}`.trim();
  if (row.kind === "FACTURA") return `FAC ${row.number}`;
  return `${prefix[row.kind] ?? ""} ${row.number}`.trim();
}

/**
 * Libro de estado de cuenta: Número · Emisión · Débitos · Créditos · Saldo, con
 * filtros Movimientos/Desde/Hasta y, al pie, Imprime/Editar y los datos del
 * documento seleccionado (Monto, Saldo, Emisión, Vence).
 */
export function LedgerPanel({
  load,
  refreshKey,
  filterKey,
  canEdit,
  canVoid,
  onPrint,
  onEdit,
  onVoid,
  onSupport,
  onInvoicePrint,
  onInvoiceEdit,
  onInvoiceSupport,
  onInvoiceVoid,
  onError,
}) {
  const [filter, setFilter] = useState("ALL");
  const [from, setFrom] = useState(() => {
    const first = new Date();
    first.setDate(1);
    return toInput(first);
  });
  const [to, setTo] = useState(() => toInput(new Date()));
  const [data, setData] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);

  const reload = useCallback(async () => {
    try {
      setData(
        await load({
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        }),
      );
    } catch (requestError) {
      onError(requestError.message);
    }
  }, [load, from, to, onError]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const rows = (data?.rows ?? []).filter((row) => {
    if (filter === "FACTURAS") return row.kind === "FACTURA";
    if (filter === "ABONOS") return row.kind === "ABONO" || row.kind === "ANULACION";
    return true;
  });
  useEffect(() => {
    setSelectedKey((current) => {
      if (current && rows.some((row) => row.key === current)) return current;
      return rows.find((row) => row.kind === "ABONO" && row.receiptId)?.key ?? rows.at(-1)?.key ?? null;
    });
  }, [data, filter]);
  const selected =
    rows.find((row) => row.key === selectedKey) ?? rows[rows.length - 1] ?? null;
  const canAct = selected?.kind === "ABONO" && selected.receiptId;
  const isInvoice = selected?.kind === "FACTURA" && selected.invoiceId;
  const canPrint = Boolean(canAct || (isInvoice && onInvoicePrint));
  const canInvoiceEdit = Boolean(isInvoice && onInvoiceEdit);
  const canInvoiceSupport = Boolean(isInvoice && onInvoiceSupport);
  const canInvoiceVoid = Boolean(isInvoice && onInvoiceVoid);
  const actionHint = selected && !canAct
    && !isInvoice
    ? "Selecciona un movimiento PAG para imprimir, editar, ver soporte o anular."
    : "";

  return (
    <div className="saint-panel" data-filter-key={filterKey}>
      <div className="saint-filters">
        <label>
          Movimientos{" "}
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="ALL">Todos</option>
            <option value="FACTURAS">Facturas</option>
            <option value="ABONOS">Pagos y abonos</option>
          </select>
        </label>
        <label>
          Desde <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Hasta <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      <div className="saint-table-wrap">
        <table className="saint-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Emisión</th>
              <th className="n">Débitos</th>
              <th className="n">Créditos</th>
              <th className="n">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {data?.opening ? (
              <tr>
                <td>SALDO ANTERIOR</td>
                <td />
                <td />
                <td />
                <td className="n">{formatCop(data.opening)}</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.key}
                className={`${selected?.key === row.key ? "is-selected" : ""} ${row.voided ? "is-voided" : ""}`}
                onClick={() => setSelectedKey(row.key)}
              >
                <td>{rowLabel(row)}</td>
                <td>{shortDate(row.date)}</td>
                <td className="n">{row.debit ? formatCop(row.debit) : ""}</td>
                <td className="n">{row.credit ? formatCop(row.credit) : ""}</td>
                <td className="n">{formatCop(row.balance)}</td>
              </tr>
            ))}
            {!rows.length && !data?.opening && (
              <tr>
                <td colSpan="5" className="saint-empty">Sin movimientos en el periodo.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="saint-footer">
        <div className="saint-footer-actions">
          <button
            type="button"
            title={actionHint || (isInvoice ? "Imprimir factura" : "Imprimir recibo")}
            disabled={!canPrint}
            onClick={() => (isInvoice ? onInvoicePrint(selected.invoiceId) : onPrint(selected.receiptId))}
          >
            Imprime
          </button>
          <button
            type="button"
            title={!canEdit && (canAct || isInvoice) ? "Tu usuario no tiene permiso para editar documentos." : actionHint || (isInvoice ? "Editar número de factura" : "Editar recibo")}
            disabled={(!canAct && !canInvoiceEdit) || !canEdit || selected?.voided}
            onClick={() => (isInvoice ? onInvoiceEdit(selected.invoiceId) : onEdit(selected.receiptId))}
          >
            Editar
          </button>
          {onSupport && (
            <button
              type="button"
              title={actionHint || (isInvoice ? "Ver soporte de pago de la factura" : "Ver o cargar soporte")}
              disabled={!canAct && !canInvoiceSupport}
              onClick={() => (isInvoice ? onInvoiceSupport(selected.invoiceId) : onSupport(selected.receiptId))}
            >
              Soporte
            </button>
          )}
          {onVoid && (
            <button
              type="button"
              title={!canVoid && (canAct || isInvoice) ? "Tu usuario no tiene permiso para anular documentos." : actionHint || (isInvoice ? "Anular factura" : "Anular recibo")}
              disabled={(!canAct && !canInvoiceVoid) || !canVoid || selected?.voided}
              onClick={() => (isInvoice ? onInvoiceVoid(selected.invoiceId, selected.number) : onVoid(selected.receiptId))}
            >
              Anular
            </button>
          )}
          {actionHint && <span className="saint-footer-hint">{actionHint}</span>}
          <span className="saint-footer-doc">
            {selected ? rowLabel(selected) : ""}
          </span>
        </div>
        <div className="saint-footer-info">
          <span>Monto <b>{selected?.docAmount != null ? formatCop(selected.docAmount) : ""}</b></span>
          <span>Emisión <b>{selected ? longDate(selected.date) : ""}</b></span>
          <span>Saldo <b>{selected?.docBalance != null ? formatCop(selected.docBalance) : ""}</b></span>
          <span>Vence <b>{selected?.dueDate ? longDate(selected.dueDate) : ""}</b></span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Pendiente --------------------------------- */

/** Pendiente: Número · Detalle documento · Vence · Días · Saldo pendiente. */
export function PendingList({ rows, onPay, canEdit }) {
  const [selectedId, setSelectedId] = useState(null);
  const [today] = useState(() => Date.now());
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  return (
    <div className="saint-panel">
      <div className="saint-table-wrap">
        <table className="saint-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Detalle documento</th>
              <th>Vence</th>
              <th className="n">Días</th>
              <th className="n">Saldo pendiente</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const days = row.dueAt
                ? Math.floor((today - new Date(row.dueAt).getTime()) / 86400000)
                : null;
              return (
                <tr
                  key={row.id}
                  className={selected?.id === row.id ? "is-selected" : ""}
                  onClick={() => setSelectedId(row.id)}
                  onDoubleClick={canEdit ? () => onPay(row) : undefined}
                  title={canEdit ? "Doble clic para abonar" : undefined}
                >
                  <td>FAC {row.number}</td>
                  <td>{row.detail}</td>
                  <td>{shortDate(row.dueAt)}</td>
                  <td className="n">{days === null ? "" : Math.max(days, 0)}</td>
                  <td className="n">{formatCop(row.balance)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan="5" className="saint-empty">No hay saldos pendientes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="saint-footer">
        <div className="saint-footer-actions">
          <span className="saint-footer-doc">
            {selected ? `Número ${selected.number}` : ""}
            <br />
            {selected?.detail ?? ""}
          </span>
        </div>
        <div className="saint-footer-info">
          <span>Monto <b>{selected ? formatCop(selected.amount) : ""}</b></span>
          <span>Emisión <b>{selected ? longDate(selected.issuedAt) : ""}</b></span>
          <span>Saldo <b>{selected ? formatCop(selected.balance) : ""}</b></span>
          <span>Vencimiento <b>{selected?.dueAt ? longDate(selected.dueAt) : ""}</b></span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Vencimientos -------------------------------- */

const BUCKETS = [
  ["de 1 a 30 días", 1, 30],
  ["de 31 a 60 días", 31, 60],
  ["de 61 a 90 días", 61, 90],
  ["más de 90 días", 91, Infinity],
];
const SLICE_COLORS = ["#a85454", "#d4893c", "#7aa6c9", "#6d6d9e"];

function PieChart({ slices }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return <svg viewBox="0 0 200 120" className="saint-pie" aria-hidden="true"><ellipse cx="100" cy="60" rx="90" ry="50" fill="#e4e8ec" /></svg>;
  }
  let angle = -Math.PI / 2;
  const used = slices.filter((slice) => slice.value > 0);
  return (
    <svg viewBox="0 0 200 120" className="saint-pie" role="img" aria-label="Distribución del vencido">
      {used.length === 1 ? (
        <ellipse cx="100" cy="60" rx="90" ry="50" fill={used[0].color} />
      ) : (
        used.map((slice) => {
          const sweep = (slice.value / total) * Math.PI * 2;
          const x1 = 100 + 90 * Math.cos(angle);
          const y1 = 60 + 50 * Math.sin(angle);
          angle += sweep;
          const x2 = 100 + 90 * Math.cos(angle);
          const y2 = 60 + 50 * Math.sin(angle);
          return (
            <path
              key={slice.label}
              d={`M100 60 L${x1} ${y1} A90 50 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`}
              fill={slice.color}
            />
          );
        })
      )}
    </svg>
  );
}

/** Análisis de vencimientos: cuentas vencidas por rango de días y gráfico. */
export function AgingAnalysis({ rows }) {
  const [today] = useState(() => Date.now());
  const analysis = useMemo(() => {
    const overdue = BUCKETS.map(([label, min, max]) => ({ label, min, max, value: 0 }));
    let notDue = 0;
    for (const row of rows) {
      if (!row.dueAt) {
        notDue += row.balance;
        continue;
      }
      const days = Math.floor((today - new Date(row.dueAt).getTime()) / 86400000);
      if (days <= 0) {
        notDue += row.balance;
        continue;
      }
      const bucket = overdue.find((item) => days >= item.min && days <= item.max);
      if (bucket) bucket.value += row.balance;
    }
    const totalOverdue = round(overdue.reduce((sum, item) => sum + item.value, 0));
    return { overdue, totalOverdue, notDue: round(notDue) };
  }, [rows, today]);
  const pct = (value, total) => (total > 0 ? ((value / total) * 100).toFixed(2).replace(".", ",") : "0,00");

  return (
    <div className="saint-panel saint-aging">
      <div className="saint-ops-title">Análisis de vencimientos</div>
      <div className="saint-aging-body">
        <div className="saint-aging-table">
          <h4>Cuentas vencidas</h4>
          {analysis.overdue.map((item) => (
            <div className="saint-aging-row" key={item.label}>
              <span>{item.label}</span>
              <b>{formatCop(item.value)}</b>
              <i>{pct(item.value, analysis.totalOverdue)} %</i>
            </div>
          ))}
          <div className="saint-aging-row is-total">
            <span>Total vencido</span>
            <b>{formatCop(analysis.totalOverdue)}</b>
            <i>{analysis.totalOverdue > 0 ? "100,00" : "0,00"} %</i>
          </div>
          <h4>Cuentas por vencer</h4>
          <div className="saint-aging-row is-total">
            <span>Total por vencer</span>
            <b>{formatCop(analysis.notDue)}</b>
            <i />
          </div>
        </div>
        <div className="saint-aging-chart">
          <span>Vencido</span>
          <PieChart
            slices={analysis.overdue.map((item, index) => ({
              label: item.label,
              value: item.value,
              color: SLICE_COLORS[index],
            }))}
          />
        </div>
      </div>
    </div>
  );
}
