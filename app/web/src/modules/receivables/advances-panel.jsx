import { useState } from "react";
import { Banknote, Plus, X } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { formatCop, readCopInput } from "@/lib/cop";
import { CopInput } from "@/components/money/cop-input";

const dateText = (value) =>
  value ? new Intl.DateTimeFormat("es-CO").format(new Date(value)) : "—";

const statusText = {
  DISPONIBLE: "Disponible",
  APLICADO: "Aplicado",
  DEVUELTO: "Devuelto",
};

/** Anticipos y saldos a favor: registrar, aplicar a un crédito o devolver en dinero. */
export function AdvancesPanel({
  client,
  advances,
  openCredits,
  bankAccounts,
  canEdit,
  onChanged,
  onNotice,
  onError,
}) {
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);

  async function run(action, successMessage) {
    setSaving(true);
    try {
      await action();
      setDialog(null);
      onNotice(successMessage);
      await onChanged();
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    if (dialog.type === "create") {
      const amount = Number(dialog.amount);
      if (!client || !(amount > 0) || !dialog.bankAccountId) {
        return onError("Indica el monto y la cuenta donde ingresa el anticipo.");
      }
      return run(
        () =>
          apiClient.post("/anticipos", {
            clientId: client.id,
            amount,
            bankAccountId: Number(dialog.bankAccountId),
            notes: dialog.notes?.trim() || undefined,
          }),
        "Anticipo registrado y abonado a la cuenta bancaria.",
      );
    }
    if (dialog.type === "apply") {
      const amount = Number(dialog.amount);
      if (!dialog.creditId || !(amount > 0)) {
        return onError("Selecciona el crédito y el monto a aplicar.");
      }
      return run(
        () =>
          apiClient.post(`/anticipos/${dialog.advance.id}/aplicar`, {
            creditId: Number(dialog.creditId),
            amount,
          }),
        "Saldo a favor aplicado al crédito.",
      );
    }
    if (!dialog.bankAccountId) return onError("Selecciona la cuenta de la que sale el dinero.");
    return run(
      () =>
        apiClient.post(`/anticipos/${dialog.advance.id}/devolver`, {
          bankAccountId: Number(dialog.bankAccountId),
        }),
      "Saldo a favor devuelto en dinero.",
    );
  }

  const available = advances
    .filter((advance) => advance.status === "DISPONIBLE")
    .reduce((sum, advance) => sum + Number(advance.balance), 0);

  return (
    <div className="provider-tab-panel data-panel">
      <div className="payable-filter-row">
        <label>Anticipos y saldos a favor</label>
        <span>Disponible: {formatCop(available)}</span>
        <button
          type="button"
          disabled={!canEdit || !client}
          onClick={() =>
            setDialog({ type: "create", amount: "", bankAccountId: "", notes: "" })
          }
        >
          <Plus size={13} /> Nuevo anticipo
        </button>
      </div>
      <div className="provider-data-table-wrap">
        {advances.length ? (
          <table className="provider-data-table receivable-data-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Valor</th>
                <th>Aplicado</th>
                <th>Saldo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((advance) => (
                <tr key={advance.id}>
                  <td>{advance.consecutive}</td>
                  <td>{dateText(advance.createdAt)}</td>
                  <td>{advance.source === "DEVOLUCION" ? "Devolución" : "Anticipo"}</td>
                  <td>{formatCop(advance.amount)}</td>
                  <td>{formatCop(advance.appliedAmount)}</td>
                  <td>{formatCop(advance.balance)}</td>
                  <td>{statusText[advance.status] ?? advance.status}</td>
                  <td>
                    {advance.status === "DISPONIBLE" && canEdit && (
                      <>
                        <button
                          type="button"
                          disabled={!openCredits.length}
                          title={
                            openCredits.length
                              ? "Aplicar a un crédito pendiente"
                              : "El cliente no tiene créditos pendientes"
                          }
                          onClick={() =>
                            setDialog({
                              type: "apply",
                              advance,
                              creditId: String(openCredits[0]?.id ?? ""),
                              amount: String(
                                Math.min(
                                  Number(advance.balance),
                                  Number(openCredits[0]?.balance ?? 0),
                                ) || "",
                              ),
                            })
                          }
                        >
                          Aplicar
                        </button>{" "}
                        <button
                          type="button"
                          onClick={() =>
                            setDialog({ type: "refund", advance, bankAccountId: "" })
                          }
                        >
                          <Banknote size={12} /> Devolver
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="table-empty">Este cliente no tiene anticipos ni saldos a favor.</div>
        )}
      </div>

      {dialog && (
        <div className="payable-editor-backdrop">
          <div className="payable-editor receivable-editor" role="dialog" aria-modal="true">
            <header className="inline-editor-title">
              <strong>
                {dialog.type === "create"
                  ? "Nuevo anticipo"
                  : dialog.type === "apply"
                    ? `Aplicar ${dialog.advance.consecutive}`
                    : `Devolver ${dialog.advance.consecutive}`}
              </strong>
              <button type="button" aria-label="Cerrar" onClick={() => setDialog(null)}>
                <X size={14} />
              </button>
            </header>
            <div className="payable-editor-grid">
              {dialog.type === "create" && (
                <label className="editor-field">
                  <span>Monto</span>
                  <CopInput
                    value={readCopInput(dialog.amount).value}
                    onChange={(amount) => setDialog({ ...dialog, amount: String(amount) })}
                  />
                </label>
              )}
              {dialog.type === "apply" && (
                <>
                  <label className="editor-field editor-field-wide">
                    <span>Crédito</span>
                    <select
                      value={dialog.creditId}
                      onChange={(event) => {
                        const credit = openCredits.find(
                          (item) => String(item.id) === event.target.value,
                        );
                        setDialog({
                          ...dialog,
                          creditId: event.target.value,
                          amount: String(
                            Math.min(
                              Number(dialog.advance.balance),
                              Number(credit?.balance ?? 0),
                            ) || "",
                          ),
                        });
                      }}
                    >
                      {openCredits.map((credit) => (
                        <option key={credit.id} value={credit.id}>
                          {credit.invoice?.consecutive ?? `CR-${credit.id}`} · saldo{" "}
                          {formatCop(credit.balance)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="editor-field">
                    <span>Monto (máx. {formatCop(dialog.advance.balance)})</span>
                    <CopInput
                      value={readCopInput(dialog.amount).value}
                      onChange={(amount) => setDialog({ ...dialog, amount: String(amount) })}
                    />
                  </label>
                </>
              )}
              {dialog.type !== "apply" && (
                <label className="editor-field">
                  <span>
                    {dialog.type === "create" ? "Cuenta que recibe" : "Cuenta de salida"}
                  </span>
                  <select
                    value={dialog.bankAccountId}
                    onChange={(event) =>
                      setDialog({ ...dialog, bankAccountId: event.target.value })
                    }
                  >
                    <option value="">Selecciona</option>
                    {bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {dialog.type === "refund" && (
                <p className="receivable-payment-hint">
                  Se devolverán <strong>{formatCop(dialog.advance.balance)}</strong> en dinero.
                </p>
              )}
              {dialog.type === "create" && (
                <label className="payable-notes-field">
                  <span>Comentarios</span>
                  <textarea
                    value={dialog.notes}
                    onChange={(event) => setDialog({ ...dialog, notes: event.target.value })}
                  />
                </label>
              )}
            </div>
            <div className="inline-editor-actions">
              <button type="button" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button type="button" className="primary-action" disabled={saving} onClick={submit}>
                {saving ? "Guardando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
