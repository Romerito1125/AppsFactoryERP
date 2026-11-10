import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { advanceFrom } from "@/lib/enter-advance";
import { formatCopExact } from "@/lib/cop";
import { DecimalInput } from "@/components/money/decimal-input";
import { printReceipt } from "./print-receipt";
import { TotalizeDialog } from "./totalize-dialog";
import "./allocation-flow.css";

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const day = (value) =>
  value ? new Intl.DateTimeFormat("es-CO").format(new Date(value)) : "—";

const parseMoney = (value) => {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? round(amount) : 0;
};

function retentionRateForRow(row, base) {
  const ranges = Array.isArray(row.retentionRanges) ? row.retentionRanges : [];
  if (ranges.length) {
    const match = ranges.find((range) => {
      const minimum = Number(range.minimum ?? 0);
      const maximum = Number(range.maximum ?? Number.MAX_SAFE_INTEGER);
      return base >= minimum && base <= maximum;
    });
    return Math.min(99.99, Math.max(0, Number(match?.percentage ?? 0)));
  }
  return Math.min(99.99, Math.max(0, Number(row.retentionRate ?? 0)));
}

function defaultLine(row, withRetention) {
  const gross = round(row.balance);
  const rate = retentionRateForRow(row, gross);
  if (withRetention && rate > 0 && rate < 100) {
    const retention = round((gross * rate) / 100);
    return { amount: String(gross), retention: String(retention) };
  }
  return { amount: String(gross), retention: "" };
}

/**
 * "PAGOS O ABONOS A CUENTAS" → "TOTAL PAGOS Y ABONOS".
 * Genérico para cobros (clientes) y pagos (proveedores): `rows` son los
 * documentos pendientes { id, number, issuedAt, dueAt, balance }. `submit`
 * recibe las asignaciones y el resultado del diálogo y devuelve el recibo.
 */
export function AllocationFlow({
  title,
  party,
  rows,
  initialId = null,
  withRetention = false,
  bankAccounts,
  client = null,
  previousBalance = 0,
  sellerName = "",
  sellers = [],
  initialDocumentNumber = "",
  initialDetail = "",
  initialOperationType = "",
  receiptTitle = "TOTAL PAGOS Y ABONOS",
  totalLabel = "Total acreditado",
  mode = "receipt",
  submit,
  onClose,
  onDone,
}) {
  const [lines, setLines] = useState(() => {
    // La primera factura queda lista para cobrar al abrir la ventana. Así la
    // retención configurada en el cliente se ve desde el primer momento.
    const row = rows.find((item) => item.id === initialId) ?? rows[0];
    return row ? { [row.id]: defaultLine(row, withRetention) } : {};
  });
  const [selectedId, setSelectedId] = useState(initialId ?? rows[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [totalizing, setTotalizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [totalizeError, setTotalizeError] = useState("");

  const visible = rows.filter((row) =>
    String(row.number).toLowerCase().includes(search.trim().toLowerCase()),
  );
  const parsed = useMemo(
    () =>
      rows.map((row) => ({
        row,
        amount: parseMoney(lines[row.id]?.amount),
        retention: withRetention ? parseMoney(lines[row.id]?.retention) : 0,
      })),
    [rows, lines, withRetention],
  );
  const totalPending = round(
    rows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0),
  );
  const totalAmount = round(parsed.reduce((sum, item) => sum + item.amount, 0));
  const totalRetention = round(parsed.reduce((sum, item) => sum + item.retention, 0));
  const retentionNotice = withRetention
    ? [...new Set(rows.filter((row) => Number(row.retentionRate) > 0).map((row) => row.retentionLabel).filter(Boolean))].join(" · ")
    : "";

  function setLine(id, field, value) {
    if (!/^\d*([.,]\d{0,2})?$/.test(value)) return;

    if (field === "amount" && withRetention) {
      const row = rows.find((item) => item.id === id);
      const entered = parseMoney(value);
      if (entered <= 0) {
        setLines((current) => ({
          ...current,
          [id]: { amount: value, retention: "" },
        }));
        return;
      }
      const rate = row ? retentionRateForRow(row, entered) : 0;
      if (row && rate > 0 && rate < 100 && entered > 0) {
        const retention = round((entered * rate) / 100);
        setLines((current) => ({
          ...current,
          [id]: {
            amount: String(entered),
            retention: String(retention),
          },
        }));
        return;
      }
    }

    setLines((current) => ({
      ...current,
      [id]: { amount: "", retention: "", ...current[id], [field]: value },
    }));
  }

  function selectRow(row) {
    setSelectedId(row.id);
    setLines((current) => {
      if (parseMoney(current[row.id]?.amount) > 0) return current;
      return {
        ...current,
        [row.id]: { ...defaultLine(row, withRetention), ...current[row.id] },
      };
    });
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-allocation-input="${row.id}"]`)?.focus();
    });
  }

  function goTotalize() {
    const over = parsed.find((item) => item.amount > round(item.row.balance) + 0.009);
    if (over) {
      return setError(`El valor de ${over.row.number} supera su saldo pendiente.`);
    }
    if (totalAmount <= 0) return setError("Indica el monto en al menos un documento.");
    setError("");
    setTotalizing(true);
  }

  async function accept(result) {
    setSaving(true);
    setTotalizeError("");
    try {
      const allocations = parsed
        .filter((item) => item.amount > 0)
        .map((item) => ({
          id: item.row.id,
          amount: item.amount,
        }));
      const receipt = await submit(allocations, result);
      if (result.print.enabled) {
        try {
          printReceipt(receipt, { party, copies: result.print.copies });
        } catch (printError) {
          setError(printError.message);
        }
      }
      onDone(receipt);
    } catch (requestError) {
      setTotalizeError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event) {
    if (totalizing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "F3") {
      event.preventDefault();
      goTotalize();
    } else if (event.key === "Enter" && event.target.matches?.("input[data-cell]")) {
      event.preventDefault();
      advanceFrom(event.target, { scope: "[data-allocation]", onLast: goTotalize });
    }
  }

  return (
    <>
      <div className="module-dialog-backdrop totalize-backdrop">
        <section
          data-allocation
          className="module-dialog allocation-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Pagos o abonos a cuentas"
          onKeyDown={handleKeyDown}
        >
          <header className="module-dialog-titlebar">
            <strong>{title} · {party}</strong>
            <button type="button" aria-label="Cerrar" onClick={onClose}>
              <X size={17} />
            </button>
          </header>
          {withRetention && retentionNotice && (
            <div className="allocation-retention-notice">
              Retención calculada por el sistema: <strong>{retentionNotice}</strong>. No debes digitarla. El monto abonado es el valor bruto recibido; la retención se informa aparte para contabilidad.
            </div>
          )}
          <div className="allocation-table-wrap">
            <table className="provider-data-table allocation-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Emisión</th>
                  <th>Vence</th>
                  <th className="n">Saldo pendiente</th>
                  <th className="n">Monto abonado</th>
                  {withRetention && <th className="n">Retención automática</th>}
                  <th className="n">Saldo restante</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const item = parsed.find((entry) => entry.row.id === row.id);
                  return (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      aria-selected={selectedId === row.id}
                      className={selectedId === row.id ? "is-selected" : ""}
                      onClick={() => selectRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectRow(row);
                        }
                      }}
                    >
                      <td>{row.number}</td>
                      <td>{day(row.issuedAt)}</td>
                      <td>{day(row.dueAt)}</td>
                      <td className="n">{formatCopExact(row.balance)}</td>
                      <td>
                        <DecimalInput
                          data-cell
                          data-allocation-input={row.id}
                          autoFocus={index === 0}
                          value={lines[row.id]?.amount ?? ""}
                          onChange={(value) => setLine(row.id, "amount", String(value))}
                        />
                      </td>
                      {withRetention && (
                        <td className="n allocation-retention-value" aria-label={`Retención automática ${row.retentionLabel ?? ""}`}>
                          {formatCopExact(item.retention)}
                        </td>
                      )}
                      <td className="n">{formatCopExact(round(row.balance - item.amount))}</td>
                    </tr>
                  );
                })}
                {!visible.length && (
                  <tr>
                    <td colSpan={withRetention ? 7 : 6} className="table-empty">
                      No hay documentos pendientes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={`allocation-totals ${withRetention ? "" : "no-retention"}`}>
            <span>Totales</span>
            <b>{formatCopExact(totalPending)}</b>
            <b>{formatCopExact(totalAmount)}</b>
            {withRetention && <b>{formatCopExact(totalRetention)}</b>}
            <b>{formatCopExact(round(totalPending - totalAmount))}</b>
          </div>
          <div className="allocation-actions">
            <label>
              Buscar documento:
              <input value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <span className="totalize-hint">Enter avanza · F3 Totalizar · Esc Salir</span>
            <span className="allocation-selected">
              {selectedId ? `Seleccionado: ${rows.find((row) => row.id === selectedId)?.number ?? "—"}` : "Selecciona un documento"}
            </span>
            <button type="button" className="primary-action" onClick={goTotalize}>
              F3 Totalizar
            </button>
            <button type="button" onClick={onClose}>Esc Salir</button>
          </div>
          {error && <p className="totalize-error" role="alert">{error}</p>}
        </section>
      </div>
      {totalizing && (
        <TotalizeDialog
          mode={mode}
          title={receiptTitle}
          totalLabel={totalLabel}
          total={totalAmount}
          retentionTotal={withRetention ? totalRetention : 0}
          bankAccounts={bankAccounts}
          client={client}
          previousBalance={previousBalance}
          sellerName={sellerName}
          sellers={sellers}
          initialDocumentNumber={initialDocumentNumber}
          initialDetail={initialDetail}
          initialOperationType={initialOperationType}
          saving={saving}
          error={totalizeError}
          onAccept={accept}
          onCancel={() => setTotalizing(false)}
        />
      )}
    </>
  );
}
