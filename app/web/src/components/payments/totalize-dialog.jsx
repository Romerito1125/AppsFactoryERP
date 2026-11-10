import { useMemo, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

import { advanceFrom } from "@/lib/enter-advance";
import { readSupportFile } from "./support-file";
import "./totalize-dialog.css";
import { formatCop, formatCopExact } from "@/lib/cop";
import { DecimalInput } from "@/components/money/decimal-input";
import { toDateInputLocal } from "@/lib/date-input";

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const parseAmount = (value) => {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? round(amount) : 0;
};

function defaultCashAccount(accounts) {
  return (
    accounts.find((account) => /efectivo|caja/i.test(`${account.name} ${account.accountType ?? ""}`)) ??
    accounts[0]
  );
}

function defaultDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + 15);
  return toDateInputLocal(due);
}

const today = () => toDateInputLocal(new Date());

/**
 * Diálogo "Total pagos y abonos" (cobros y pagos) y "Total operación" (venta),
 * con efectivo, instrumentos de pago por cuenta, bonus / miembro fiel, saldos a
 * favor, crédito, soporte y comprobante. Teclado: Enter avanza, F3 acepta, Esc sale.
 */
export function TotalizeDialog({
  mode = "receipt", // receipt (cobro) | payment (pago) | sale (venta)
  title,
  totalLabel = "Total acreditado",
  total,
  retentionTotal = 0,
  bankAccounts = [],
  client = null,
  previousBalance = 0,
  bonusAvailable = 0,
  advances = [],
  initialDetail = "",
  sellerName = "",
  sellers = [],
  initialDocumentNumber = "",
  initialOperationType = "",
  saving = false,
  error = "",
  onAccept,
  onCancel,
}) {
  const isSale = mode === "sale";
  const showCreditSummary = mode === "receipt" && Boolean(client);
  const rootRef = useRef(null);
  const firstAccount = bankAccounts[0];
  const cashAccount = defaultCashAccount(bankAccounts);
  const [documentNumber, setDocumentNumber] = useState(initialDocumentNumber);
  const [detail, setDetail] = useState(initialDetail);
  const [paidAt, setPaidAt] = useState(today());
  const [cash, setCash] = useState(() =>
    !isSale && total > 0 ? String(round(total)) : "",
  );
  const [cashAccountId, setCashAccountId] = useState(
    String(defaultCashAccount(bankAccounts)?.id ?? ""),
  );
  // En ventas se conserva el flujo rápido por cuenta bancaria; cobros y pagos
  // empiezan en efectivo y solo pasan a instrumentos al elegirlo.
  const [instruments, setInstruments] = useState(() =>
    isSale && firstAccount && total > 0
      ? { [firstAccount.id]: { amount: String(round(total)), reference: "" } }
      : {},
  );
  const [bonus, setBonus] = useState("");
  const [advanceAmounts, setAdvanceAmounts] = useState({});
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [comments, setComments] = useState("");
  const [operationType, setOperationType] = useState(initialOperationType);
  const [seller, setSeller] = useState(sellerName);
  const [saleCreditMode, setSaleCreditMode] = useState(false);
  const [support, setSupport] = useState(null);
  const [print, setPrint] = useState(false);
  const [copies, setCopies] = useState(1);
  const [showInstruments, setShowInstruments] = useState(false);
  const [localError, setLocalError] = useState("");

  const cashN = parseAmount(cash);
  const instrumentRows = bankAccounts
    .map((account) => ({
      bankAccountId: account.id,
      amount: parseAmount(instruments[account.id]?.amount),
      reference: instruments[account.id]?.reference?.trim() ?? "",
    }))
    .filter((row) => row.amount > 0);
  const instrumentsTotal = round(instrumentRows.reduce((sum, row) => sum + row.amount, 0));
  const bonusN = Math.min(parseAmount(bonus), round(bonusAvailable));
  const advanceRows = advances
    .map((advance) => ({
      advanceId: advance.id,
      amount: Math.min(parseAmount(advanceAmounts[advance.id]), Number(advance.balance)),
    }))
    .filter((row) => row.amount > 0);
  const advancesTotal = round(advanceRows.reduce((sum, row) => sum + row.amount, 0));
  const paid = round(cashN + instrumentsTotal + bonusN + advancesTotal);
  const remainder = round(total - paid);

  const hasCredit = Boolean(client?.hasCredit && Number(client?.maxCredit) > 0);
  const creditLimit = Number(client?.maxCredit ?? 0);
  const creditAvailable = round(creditLimit - Number(previousBalance));
  const canUseCredit = hasCredit && creditAvailable > 0.009;
  const creditAmount = isSale && saleCreditMode && remainder > 0.009 && canUseCredit ? remainder : 0;

  const problem = useMemo(() => {
    if (!isSale) {
      if (!bankAccounts.length) return "Registra al menos una cuenta bancaria activa para recibir o realizar el pago.";
      if (!documentNumber.trim()) return "Escribe el número de documento (ticket).";
      if (detail.trim().length < 2) return "Escribe el detalle del documento.";
      if (mode === "receipt" && !seller.trim()) return "Escribe el vendedor.";
      if (Math.abs(remainder) > 0.009) {
        return `El desglose (${formatCopExact(paid)}) debe ser igual al total (${formatCopExact(total)}).`;
      }
    } else {
      if (remainder < -0.009) return "Lo pagado supera el total de la operación.";
      if (remainder > 0.009 && !hasCredit) {
        return `Faltan ${formatCopExact(remainder)} por pagar: este cliente no tiene crédito.`;
      }
      if (remainder > 0.009 && hasCredit && !canUseCredit) {
        return "El cliente no tiene crédito disponible suficiente.";
      }
      if (remainder > 0.009 && !saleCreditMode) {
        return "Completa el pago o selecciona Crédito.";
      }
      if (creditAmount > 0 && creditAmount > creditAvailable + 0.009) {
        return `El crédito (${formatCopExact(creditAmount)}) supera el disponible (${formatCopExact(creditAvailable)}).`;
      }
      if (creditAmount > 0 && !dueDate) return "Indica el vencimiento del crédito.";
    }
    if (cashN > 0 && !cashAccountId) return "Selecciona la caja o cuenta del efectivo.";
    return "";
  }, [isSale, mode, seller, documentNumber, detail, remainder, paid, total, hasCredit, canUseCredit, creditAmount, creditAvailable, dueDate, cashN, cashAccountId, saleCreditMode, bankAccounts.length]);

  function setInstrument(accountId, field, value) {
    setInstruments((current) => ({
      ...current,
      [accountId]: { amount: "", reference: "", ...current[accountId], [field]: value },
    }));
  }

  function toggleSaleCredit(nextValue) {
    setLocalError("");
    setSaleCreditMode(nextValue);
    if (nextValue) {
      setCash("");
      setInstruments({});
      setBonus("");
      setAdvanceAmounts({});
    } else if (firstAccount && total > 0) {
      setInstruments({ [firstAccount.id]: { amount: String(round(total)), reference: "" } });
    }
  }

  function openInstruments() {
    // Abrir el detalle no cambia ningún medio ni monto. El operador decide
    // explícitamente cuánto pasa a transferencia y cuánto queda en efectivo.
    setShowInstruments(true);
  }

  function accept() {
    if (saving) return;
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError("");
    const payload = {
      documentNumber: documentNumber.trim(),
      detail: detail.trim(),
      paidAt,
      cashAmount: cashN,
      cashAccountId: cashN > 0 ? Number(cashAccountId) : undefined,
      instruments: [
        ...instrumentRows,
      ],
      bonusAmount: bonusN,
      advanceLines: advanceRows,
      creditAmount,
      creditDueDate: dueDate,
      comments: comments.trim(),
      operationType: operationType.trim(),
      sellerName: seller.trim(),
      print: { enabled: print, copies },
    };
    // El soporte es opcional. No enviamos una propiedad vacía para que una
    // venta totalmente a crédito (efectivo 0) no dependa de adjuntar archivo.
    if (support) payload.support = support;
    onAccept(payload);
  }

  async function chooseSupport(event) {
    try {
      setSupport(await readSupportFile(event.target.files?.[0] ?? null));
      setLocalError("");
    } catch (supportError) {
      event.target.value = "";
      setSupport(null);
      setLocalError(supportError.message);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (showInstruments) setShowInstruments(false);
      else onCancel();
      return;
    }
    if (event.key === "F3") {
      event.preventDefault();
      if (showInstruments) setShowInstruments(false);
      else accept();
      return;
    }
    if (event.key !== "Enter") return;
    if (["BUTTON", "TEXTAREA"].includes(event.target.tagName)) return;
    event.preventDefault();
    event.stopPropagation();
    advanceFrom(event.target, {
      scope: "[data-totalize]",
      onLast: () => (showInstruments ? setShowInstruments(false) : accept()),
    });
  }

  const shownError = localError || error;

  return (
    <div className="module-dialog-backdrop totalize-backdrop">
      <section
        ref={rootRef}
        data-totalize
        className="module-dialog totalize-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
      >
        <header className="module-dialog-titlebar">
          <strong>{showInstruments ? "INSTRUMENTOS DE PAGO" : title}</strong>
          <button type="button" aria-label="Cerrar" onClick={onCancel}>
            <X size={17} />
          </button>
        </header>

        {showInstruments ? (
          <div className="totalize-body">
            <table className="totalize-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cuenta bancaria</th>
                  <th>Número de documento</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {bankAccounts.map((account, index) => (
                  <tr key={account.id}>
                    <td>{String(account.id).padStart(3, "0")}</td>
                    <td>
                      {account.name}
                      {account.bankName ? ` · ${account.bankName}` : ""}
                    </td>
                    <td>
                      <input
                        autoFocus={index === 0}
                        value={instruments[account.id]?.reference ?? ""}
                        placeholder="Consignación / transferencia"
                        onChange={(event) =>
                          setInstrument(account.id, "reference", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <DecimalInput
                        className="is-amount"
                        value={instruments[account.id]?.amount ?? ""}
                        onChange={(value) => setInstrument(account.id, "amount", String(value))}
                      />
                    </td>
                  </tr>
                ))}
                {!bankAccounts.length && (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      No hay cuentas bancarias activas registradas.
                    </td>
                  </tr>
                )}
                {isSale && bonusAvailable > 0 && (
                  <tr className="is-special">
                    <td>BON</td>
                    <td>Bonus / miembro fiel · disponible {formatCop(bonusAvailable)}</td>
                    <td>Se descuenta del saldo del cliente</td>
                    <td>
                      <DecimalInput
                        className="is-amount"
                        value={bonus}
                        onChange={(value) => setBonus(String(value))}
                      />
                    </td>
                  </tr>
                )}
                {isSale &&
                  advances.map((advance) => (
                    <tr className="is-special" key={`adv${advance.id}`}>
                      <td>SAF</td>
                      <td>
                        Saldo a favor {advance.consecutive} · {formatCop(advance.balance)}
                      </td>
                      <td>Se descuenta del anticipo</td>
                      <td>
                        <DecimalInput
                          className="is-amount"
                          value={advanceAmounts[advance.id] ?? ""}
                          onChange={(value) =>
                            setAdvanceAmounts((current) => ({
                              ...current,
                              [advance.id]: String(value),
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="totalize-instruments-total">
              <span>Total instrumentos</span>
              <strong>{formatCopExact(round(instrumentsTotal + bonusN + advancesTotal))}</strong>
            </div>
            <div className="totalize-support-strip">
              <Paperclip size={17} />
              <strong>Documento de soporte</strong>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={chooseSupport}
              />
              <span>{support ? support.supportName : "Opcional · imagen o PDF"}</span>
            </div>
          </div>
        ) : (
          <div className="totalize-body">
            {showCreditSummary && (
              <div className="totalize-credit-box">
                <div><span>Límite crédito</span><b>{hasCredit ? formatCopExact(creditLimit) : "Sin crédito"}</b></div>
                <div><span>Saldo anterior</span><b>{formatCopExact(previousBalance)}</b></div>
                <div><span>Crédito disponible</span><b>{hasCredit ? formatCopExact(creditAvailable) : "—"}</b></div>
              </div>
            )}
            {isSale && (
              <div className="totalize-sale-mode" role="group" aria-label="Forma de pago de la venta">
                <span>Forma de pago</span>
                <div className="totalize-sale-mode-actions">
                  <button
                    type="button"
                    className={!saleCreditMode ? "is-active" : ""}
                    onClick={() => toggleSaleCredit(false)}
                  >
                    Contado
                  </button>
                  {canUseCredit && (
                    <button
                      type="button"
                      className={saleCreditMode ? "is-active" : ""}
                      onClick={() => toggleSaleCredit(true)}
                    >
                      Crédito
                    </button>
                  )}
                </div>
                <small>
                  {canUseCredit
                    ? saleCreditMode
                      ? "El saldo pendiente se registrará a crédito."
                      : "Completa el pago para registrar la factura de contado."
                    : hasCredit
                      ? "Este cliente agotó su crédito disponible."
                      : "Este cliente no tiene crédito configurado."}
                </small>
              </div>
            )}
            {!isSale && Number(retentionTotal) > 0 && (
              <div className="totalize-retention-summary">
                <span>Total documento <strong>{formatCopExact(total)}</strong></span>
                <span>Retención calculada <strong>{formatCopExact(retentionTotal)}</strong></span>
                <span>Total recibido <strong>{formatCopExact(total)}</strong></span>
              </div>
            )}
            <div className="totalize-grid">
              {!isSale && (
                <label>
                  <span>Número de documento <i>*</i></span>
                  <input
                    autoFocus
                    className="is-short"
                    value={documentNumber}
                    onChange={(event) => setDocumentNumber(event.target.value)}
                  />
                </label>
              )}
              {!isSale && (
                <label>
                  <span>Detalle documento <i>*</i></span>
                  <input value={detail} onChange={(event) => setDetail(event.target.value)} />
                </label>
              )}
              <label>
                <span>{totalLabel}</span>
                <output className="is-total">{formatCopExact(total)}</output>
              </label>
              {!isSale && (
                <>
                  <label>
                    <span>Fecha posteo</span>
                    <input className="is-short" type="date" value={today()} disabled />
                  </label>
                  <label>
                    <span>Fecha documento</span>
                    <input className="is-short" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
                  </label>
                </>
              )}
              <label>
                <span>Efectivo</span>
                <DecimalInput
                  autoFocus={isSale}
                  className="is-short is-amount"
                  value={cash}
                  onChange={(value) => {
                    setCash(String(value));
                    // Pago dividido típico: lo que entra en efectivo se descuenta de la cuenta principal.
                    const keys = Object.keys(instruments);
                    if (firstAccount && keys.length === 1 && keys[0] === String(firstAccount.id)) {
                      setInstrument(
                        firstAccount.id,
                        "amount",
                        String(Math.max(0, round(total - value - bonusN - advancesTotal))),
                      );
                    }
                  }}
                />
              </label>
              <label>
                <span>Caja / cuenta del efectivo</span>
                <select
                  value={cashAccountId}
                  disabled={!cashN || !bankAccounts.length}
                  onChange={(event) => setCashAccountId(event.target.value)}
                >
                  {!bankAccounts.length && <option value="">Sin cuentas activas</option>}
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Transferencia / cuenta bancaria</span>
                <button type="button" className="totalize-instruments-btn" onClick={openInstruments}>
                  {instrumentsTotal + bonusN + advancesTotal > 0
                    ? `${formatCopExact(round(instrumentsTotal + bonusN + advancesTotal))} · ${instrumentRows.length + (bonusN ? 1 : 0) + advanceRows.length} medio(s)`
                    : "0,00"}
                </button>
              </label>
              <label>
                <span>Total desglose</span>
                <output className={`is-total ${Math.abs(remainder) > 0.009 && !creditAmount ? "is-bad" : ""}`}>
                  {formatCopExact(paid)}
                </output>
              </label>
              {isSale && canUseCredit && (
                <label>
                  <span>Crédito a registrar</span>
                  <output className="is-total">{formatCopExact(creditAmount)}</output>
                </label>
              )}
              {isSale && creditAmount > 0 && (
                <label>
                  <span>Vencimiento del crédito</span>
                  <input className="is-short" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </label>
              )}
              {isSale && (
                <label>
                  <span>Saldo operación</span>
                  <output className="is-total">{formatCopExact(round(Number(previousBalance) + creditAmount))}</output>
                </label>
              )}
              <label className="totalize-wide">
                <span>Comentarios del pago</span>
                <textarea value={comments} onChange={(event) => setComments(event.target.value)} rows={2} />
              </label>
              <label className="totalize-wide">
                <span>
                  <Paperclip size={12} /> Soporte (opcional){support ? ` · ${support.supportName}` : ""}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={chooseSupport}
                />
              </label>
              {!isSale && (
                <label>
                  <span>Tipo de operación</span>
                  <input value={operationType} onChange={(event) => setOperationType(event.target.value)} />
                </label>
              )}
              {mode === "receipt" && (
                <label>
                  <span>Vendedor <i>*</i></span>
                  {sellers.length ? (
                    <select
                      value={seller}
                      onChange={(event) => setSeller(event.target.value)}
                    >
                      <option value="">Seleccionar vendedor</option>
                      {sellers.map((item) => (
                        <option key={item.id ?? item.username} value={item.username ?? item.name}>
                          {item.name ?? item.username}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={seller} onChange={(event) => setSeller(event.target.value)} />
                  )}
                </label>
              )}
              {!isSale && (
                <label className="totalize-print">
                  <span>Imprimir recibo</span>
                  <div>
                    <input type="checkbox" checked={print} onChange={(event) => setPrint(event.target.checked)} /> Sí
                    <span> Copias </span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={copies}
                      disabled={!print}
                      onChange={(event) => setCopies(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
                    />
                    <span> Impresora </span>
                    <select disabled={!print} defaultValue="default">
                      <option value="default">Default</option>
                    </select>
                  </div>
                </label>
              )}
            </div>
          </div>
        )}

        {shownError && <p className="totalize-error" role="alert">{shownError}</p>}
        <div className="module-dialog-footer">
          <span className="totalize-hint">Enter avanza · F3 acepta · Esc sale</span>
          {showInstruments ? (
            <button type="button" className="primary-action" onClick={() => setShowInstruments(false)}>
              Aceptar instrumentos
            </button>
          ) : (
            <button type="button" className="primary-action" disabled={saving} onClick={accept}>
              {saving ? "Guardando…" : "F3 Aceptar"}
            </button>
          )}
          <button type="button" onClick={showInstruments ? () => setShowInstruments(false) : onCancel}>
            Esc Salir
          </button>
        </div>
      </section>
    </div>
  );
}
