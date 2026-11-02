import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { money, shortDate } from "./account-panels";
import "./notes-center.css";

const TITLES = {
  cobrar: {
    debito: "NOTAS DE DÉBITO",
    credito: "NOTAS DE CRÉDITO",
    anticipo: "NOTAS CRÉDITO / ANTICIPOS",
    anular: "ANULAR NOTAS CRÉDITO / ANTICIPOS",
  },
  pagar: {
    debito: "NOTAS DE DÉBITO",
    credito: "NOTAS DE CRÉDITO",
    anticipo: "NOTAS DÉBITO / ANTICIPOS",
    anular: "ANULAR NOTAS CRÉDITO / ANTICIPOS",
  },
};

const HINTS = {
  cobrar: {
    debito: "Cargo adicional al cliente (intereses, ajustes): crea una nueva cuenta por cobrar.",
    credito: "Descuento o ajuste a favor del cliente: baja el saldo de una de sus cuentas, sin mover dinero.",
  },
  pagar: {
    debito: "Baja lo que se le debe al proveedor en una compra (retención, descuento, ajuste).",
    credito: "Sube lo que se le debe al proveedor en una compra (flete, cargo adicional).",
    anticipo: "Pago adelantado al proveedor: sale dinero de la cuenta elegida y queda como saldo de anticipos.",
  },
};

const kindLabel = { DEBITO: "N/D", CREDITO: "N/C", ANTICIPO: "ANT" };

/**
 * Notas de débito/crédito, anticipos y anulaciones de Cuentas por cobrar y por pagar.
 * `documents` son las cuentas por cobrar (cobrar) o las compras recibidas (pagar) a las
 * que se pueden aplicar las notas.
 */
export function NotesCenter({
  side, // "cobrar" | "pagar"
  mode, // "debito" | "credito" | "anticipo" | "anular"
  party, // { id, name }
  documents,
  bankAccounts,
  canEdit,
  onClose,
  onChanged,
}) {
  const [notes, setNotes] = useState(null);
  const [returns, setReturns] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    documentNumber: "",
    detail: "",
    amount: "",
    documentId: "",
    dueDate: "",
    bankAccountId: "",
  });
  const [action, setAction] = useState(null); // { type: "void"|"apply", note, ... }

  const load = useCallback(async () => {
    const partyParam = side === "cobrar" ? { clientId: party.id } : { providerId: party.id };
    try {
      setNotes(
        await apiClient.get("/notas", {
          side: side === "cobrar" ? "COBRAR" : "PAGAR",
          ...partyParam,
        }),
      );
      if (side === "cobrar" && (mode === "credito" || mode === "anular")) {
        setReturns(
          mode === "credito"
            ? await apiClient.get("/devoluciones", { clientId: party.id }).catch(() => [])
            : [],
        );
      }
      if (side === "cobrar" && mode === "anular") {
        setAdvances(await apiClient.get("/anticipos", { clientId: party.id }).catch(() => []));
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [side, mode, party.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const all = notes ?? [];
    const noteRows = all
      .filter((note) => {
        if (mode === "anular") return note.status === "VIGENTE";
        const kind = mode === "debito" ? "DEBITO" : mode === "credito" ? "CREDITO" : "ANTICIPO";
        return note.kind === kind;
      })
      .map((note) => ({
        key: `n${note.id}`,
        note,
        number: `${kindLabel[note.kind]} ${note.documentNumber}`,
        date: note.issuedAt,
        detail: note.detail,
        amount: Number(note.amount),
        voided: note.status === "ANULADO",
        status: note.status === "ANULADO" ? "Anulada" : "Vigente",
        reference:
          note.kind === "ANTICIPO"
            ? `Saldo ${money(note.balance)}`
            : documentLabel(note, documents),
      }));
    const returnRows =
      mode === "credito"
        ? (returns ?? []).map((row) => ({
            key: `r${row.id}`,
            number: `DEV ${row.consecutive}`,
            date: row.createdAt,
            detail: `Devolución · ${row.reason}`,
            amount: Number(row.total),
            status: "Devolución",
            reference: `FAC ${row.invoice?.consecutive ?? ""}`,
          }))
        : [];
    const advanceRows =
      mode === "anular"
        ? (advances ?? [])
            .filter((row) => row.status === "DISPONIBLE" && Number(row.appliedAmount) === 0)
            .map((row) => ({
              key: `a${row.id}`,
              clientAdvance: row,
              number: `ANT ${row.consecutive}`,
              date: row.createdAt,
              detail: row.notes ?? "Anticipo de cliente",
              amount: Number(row.amount),
              status: "Vigente",
              reference: `Saldo ${money(row.balance)}`,
            }))
        : [];
    return [...noteRows, ...advanceRows, ...returnRows].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
  }, [notes, returns, advances, mode, documents]);

  const needsDocument = mode === "credito" || (side === "pagar" && mode === "debito");
  const needsBank = side === "pagar" && mode === "anticipo";
  const showForm = mode !== "anular" && canEdit;

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    const amount = Number(String(form.amount).replace(",", "."));
    if (!form.documentNumber.trim()) return setError("Escribe el número de documento.");
    if (form.detail.trim().length < 2) return setError("Escribe el detalle.");
    if (!(amount > 0)) return setError("Escribe un valor mayor a cero.");
    if ((needsDocument || (side === "pagar" && mode === "credito")) && !form.documentId) {
      return setError(side === "cobrar" ? "Selecciona la cuenta por cobrar." : "Selecciona la compra.");
    }
    if (needsBank && !form.bankAccountId) return setError("Selecciona la cuenta de la que sale el anticipo.");
    setSaving(true);
    setError("");
    try {
      await apiClient.post(`/notas/${side}/${mode}`, {
        ...(side === "cobrar" ? { clientId: party.id } : { providerId: party.id }),
        documentNumber: form.documentNumber.trim(),
        detail: form.detail.trim(),
        amount,
        ...(side === "cobrar" && form.documentId ? { creditId: Number(form.documentId) } : {}),
        ...(side === "pagar" && form.documentId ? { purchaseOrderId: Number(form.documentId) } : {}),
        ...(side === "cobrar" && mode === "debito" && form.dueDate
          ? { dueDate: new Date(`${form.dueDate}T00:00:00`).toISOString() }
          : {}),
        ...(needsBank ? { bankAccountId: Number(form.bankAccountId) } : {}),
      });
      setForm({ documentNumber: "", detail: "", amount: "", documentId: "", dueDate: "", bankAccountId: "" });
      await load();
      onChanged("Nota registrada; los saldos quedaron actualizados.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmAction() {
    setSaving(true);
    setError("");
    try {
      if (action.type === "void") {
        if (action.reason.trim().length < 3) throw new Error("Escribe el motivo de la anulación.");
        if (action.row.clientAdvance) {
          await apiClient.post(`/anticipos/${action.row.clientAdvance.id}/anular`, { reason: action.reason.trim() });
        } else {
          await apiClient.post(`/notas/${action.row.note.id}/anular`, { reason: action.reason.trim() });
        }
        onChanged("Anulado; los saldos y el banco quedaron revertidos.");
      } else {
        const amount = Number(String(action.amount).replace(",", "."));
        if (!action.documentId || !(amount > 0)) throw new Error("Selecciona la compra y el valor a aplicar.");
        await apiClient.post(`/notas/${action.row.note.id}/aplicar`, {
          purchaseOrderId: Number(action.documentId),
          amount,
        });
        onChanged("Anticipo aplicado a la compra.");
      }
      setAction(null);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-dialog-backdrop totalize-backdrop">
      <section
        className="module-dialog notes-dialog"
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <header className="module-dialog-titlebar">
          <strong>
            {TITLES[side][mode]} · {party.name}
          </strong>
          <button type="button" aria-label="Cerrar" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        {HINTS[side][mode] && <p className="notes-hint">{HINTS[side][mode]}</p>}
        {mode === "anular" && (
          <p className="notes-hint">
            Elige la nota o el anticipo que quieres anular. Se devuelven los saldos y, si hubo dinero, el banco queda
            igual que antes.
          </p>
        )}

        {showForm && (
          <div className="notes-form">
            <label>
              <span>Número de documento *</span>
              <input
                autoFocus
                value={form.documentNumber}
                onChange={(event) => setField("documentNumber", event.target.value)}
              />
            </label>
            <label className="is-wide">
              <span>Detalle *</span>
              <input value={form.detail} onChange={(event) => setField("detail", event.target.value)} />
            </label>
            {(needsDocument || (side === "pagar" && mode === "credito")) && (
              <label className="is-wide">
                <span>{side === "cobrar" ? "Cuenta por cobrar *" : "Compra *"}</span>
                <select value={form.documentId} onChange={(event) => setField("documentId", event.target.value)}>
                  <option value="">Selecciona…</option>
                  {documents.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · saldo {money(item.balance)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needsBank && (
              <label>
                <span>Cuenta de salida *</span>
                <select value={form.bankAccountId} onChange={(event) => setField("bankAccountId", event.target.value)}>
                  <option value="">Selecciona…</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
            )}
            {side === "cobrar" && mode === "debito" && (
              <label>
                <span>Vencimiento</span>
                <input type="date" value={form.dueDate} onChange={(event) => setField("dueDate", event.target.value)} />
              </label>
            )}
            <label>
              <span>Valor *</span>
              <input
                inputMode="decimal"
                className="is-amount"
                value={form.amount}
                placeholder="0,00"
                onChange={(event) => /^\d*([.,]\d{0,2})?$/.test(event.target.value) && setField("amount", event.target.value)}
              />
            </label>
            <button type="button" className="primary-action" disabled={saving} onClick={submit}>
              {saving ? "Guardando…" : "Registrar"}
            </button>
          </div>
        )}

        {error && <p className="totalize-error" role="alert">{error}</p>}

        <div className="saint-table-wrap notes-table">
          <table className="saint-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Detalle</th>
                <th>Documento / saldo</th>
                <th className="n">Valor</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.voided ? "is-voided" : ""}>
                  <td>{row.number}</td>
                  <td>{shortDate(row.date)}</td>
                  <td>{row.detail}</td>
                  <td>{row.reference}</td>
                  <td className="n">{money(row.amount)}</td>
                  <td>{row.status}</td>
                  <td>
                    {canEdit && !row.voided && (row.note || row.clientAdvance) && (
                      <span className="notes-actions">
                        {row.note?.kind === "ANTICIPO" && side === "pagar" && mode === "anticipo" && Number(row.note.balance) > 0 && (
                          <button
                            type="button"
                            onClick={() => setAction({ type: "apply", row, documentId: "", amount: String(row.note.balance) })}
                          >
                            Aplicar a compra
                          </button>
                        )}
                        {row.note?.status === "VIGENTE" && (
                          <button type="button" onClick={() => setAction({ type: "void", row, reason: "" })}>
                            Anular
                          </button>
                        )}
                        {row.clientAdvance && (
                          <button type="button" onClick={() => setAction({ type: "void", row, reason: "" })}>
                            Anular
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {notes && !rows.length && (
                <tr>
                  <td colSpan="7" className="saint-empty">No hay registros todavía.</td>
                </tr>
              )}
              {!notes && !error && (
                <tr>
                  <td colSpan="7" className="saint-empty">Consultando…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {action && (
          <div className="notes-action-bar">
            {action.type === "void" ? (
              <>
                <span>Anular {action.row.number}:</span>
                <input
                  autoFocus
                  placeholder="Motivo de la anulación"
                  value={action.reason}
                  onChange={(event) => setAction({ ...action, reason: event.target.value })}
                />
              </>
            ) : (
              <>
                <span>Aplicar {action.row.number} a:</span>
                <select value={action.documentId} onChange={(event) => setAction({ ...action, documentId: event.target.value })}>
                  <option value="">Compra…</option>
                  {documents.map((item) => (
                    <option key={item.id} value={item.id}>{item.label} · saldo {money(item.balance)}</option>
                  ))}
                </select>
                <input
                  className="is-amount"
                  value={action.amount}
                  onChange={(event) => setAction({ ...action, amount: event.target.value })}
                />
              </>
            )}
            <button type="button" className="primary-action" disabled={saving} onClick={confirmAction}>
              Confirmar
            </button>
            <button type="button" onClick={() => setAction(null)}>Cancelar</button>
          </div>
        )}

        <div className="module-dialog-footer">
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  );
}

function documentLabel(note, documents) {
  const id = note.creditId ?? note.purchaseOrderId;
  if (!id) return note.kind === "DEBITO" ? "Cuenta nueva" : "";
  const doc = documents.find((item) => item.id === id);
  return doc ? doc.label : `#${id}`;
}
