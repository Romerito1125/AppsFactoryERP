import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { advanceFrom } from "@/lib/enter-advance";
import { formatCop, readCopInput } from "@/lib/cop";
import { CopInput } from "@/components/money/cop-input";
import { printReceipt } from "./print-receipt";
import { TotalizeDialog } from "./totalize-dialog";
import "./allocation-flow.css";

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const day = (value) =>
  value ? new Intl.DateTimeFormat("es-CO").format(new Date(value)) : "—";

const parseMoney = (value) => readCopInput(value).value;

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
  sellerName = "",
  receiptTitle = "TOTAL PAGOS Y ABONOS",
  totalLabel = "Total acreditado",
  mode = "receipt",
  submit,
  onClose,
  onDone,
}) {
  const [lines, setLines] = useState(() => {
    const row = rows.find((item) => item.id === initialId);
    return row ? { [row.id]: { amount: String(row.balance), retention: "" } } : {};
  });
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
  const totalPending = round(rows.reduce((sum, row) => sum + row.balance, 0));
  const totalAmount = round(parsed.reduce((sum, item) => sum + item.amount, 0));
  const totalRetention = round(parsed.reduce((sum, item) => sum + item.retention, 0));

  function setLine(id, field, value) {
    if (!/^\d*([.,]\d{0,2})?$/.test(value)) return;
    setLines((current) => ({
      ...current,
      [id]: { amount: "", retention: "", ...current[id], [field]: value },
    }));
  }

  function goTotalize() {
    const over = parsed.find((item) => item.amount + item.retention > item.row.balance + 0.009);
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
          ...(item.retention > 0 ? { retention: item.retention } : {}),
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
          <div className="allocation-table-wrap">
            <table className="provider-data-table allocation-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Emisión</th>
                  <th>Vence</th>
                  <th className="n">Saldo pendiente</th>
                  <th className="n">Monto abonado</th>
                  {withRetention && <th className="n">Retenciones</th>}
                  <th className="n">Saldo restante</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const item = parsed.find((entry) => entry.row.id === row.id);
                  return (
                    <tr key={row.id}>
                      <td>{row.number}</td>
                      <td>{day(row.issuedAt)}</td>
                      <td>{day(row.dueAt)}</td>
                      <td className="n">{formatCop(row.balance)}</td>
                      <td>
                        <CopInput
                          data-cell
                          autoFocus={index === 0}
                          value={parseMoney(lines[row.id]?.amount)}
                          onChange={(value) => setLine(row.id, "amount", String(value))}
                        />
                      </td>
                      {withRetention && (
                        <td>
                          <CopInput
                            data-cell
                            value={parseMoney(lines[row.id]?.retention)}
                            onChange={(value) => setLine(row.id, "retention", String(value))}
                          />
                        </td>
                      )}
                      <td className="n">{formatCop(round(row.balance - item.amount - item.retention))}</td>
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
            <b>{formatCop(totalPending)}</b>
            <b>{formatCop(totalAmount)}</b>
            {withRetention && <b>{formatCop(totalRetention)}</b>}
            <b>{formatCop(round(totalPending - totalAmount - totalRetention))}</b>
          </div>
          <div className="allocation-actions">
            <label>
              Buscar documento:
              <input value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <span className="totalize-hint">Enter avanza · F3 Totalizar · Esc Salir</span>
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
          bankAccounts={bankAccounts}
          sellerName={sellerName}
          saving={saving}
          error={totalizeError}
          onAccept={accept}
          onCancel={() => setTotalizing(false)}
        />
      )}
    </>
  );
}
