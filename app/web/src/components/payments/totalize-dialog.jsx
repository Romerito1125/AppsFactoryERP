import { useMemo, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

import { advanceFrom } from "@/lib/enter-advance";
import { readSupportFile } from "./support-file";
import "./totalize-dialog.css";

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

function money(value) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function parseAmount(value) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? round(parsed) : 0;
}

const isAmountDraft = (value) => /^\d*([.,]\d{0,2})?$/.test(value);

function defaultCashAccount(accounts) {
  return (
    accounts.find((account) => /efectivo|caja/i.test(`${account.name} ${account.accountType ?? ""}`)) ??
    accounts[0]
  );
}

function defaultDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + 15);
  return due.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

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
  bankAccounts,
  client = null,
  previousBalance = 0,
  bonusAvailable = 0,
  advances = [],
  initialDetail = "",
  sellerName = "",
  saving = false,
  error = "",
  onAccept,
  onCancel,
}) {
  const isSale = mode === "sale";
  const rootRef = useRef(null);
  const firstAccount = bankAccounts[0];
  const [documentNumber, setDocumentNumber] = useState("");
  const [detail, setDetail] = useState(initialDetail);
  const [paidAt, setPaidAt] = useState(today());
  const [cash, setCash] = useState("");
  const [cheque, setCheque] = useState("");
  const [chequeRef, setChequeRef] = useState("");
  const [cashAccountId, setCashAccountId] = useState(
    String(defaultCashAccount(bankAccounts)?.id ?? ""),
  );
  // Por defecto todo el total entra por la primera cuenta; el usuario lo reparte.
  const [instruments, setInstruments] = useState(() =>
    firstAccount && total > 0
      ? { [firstAccount.id]: { amount: String(round(total)), reference: "" } }
      : {},
  );
  const [bonus, setBonus] = useState("");
  const [advanceAmounts, setAdvanceAmounts] = useState({});
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [comments, setComments] = useState("");
  const [operationType, setOperationType] = useState("");
  const [seller, setSeller] = useState(sellerName);
  const [support, setSupport] = useState(null);
  const [print, setPrint] = useState(false);
  const [copies, setCopies] = useState(1);
  const [showInstruments, setShowInstruments] = useState(false);
  const [localError, setLocalError] = useState("");

  const cashN = parseAmount(cash);
  const chequeN = parseAmount(cheque);
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
  const paid = round(cashN + chequeN + instrumentsTotal + bonusN + advancesTotal);
  const remainder = round(total - paid);

  const hasCredit = Boolean(client?.hasCredit && Number(client?.maxCredit) > 0);
  const creditLimit = Number(client?.maxCredit ?? 0);
  const creditAvailable = round(creditLimit - Number(previousBalance));
  const creditAmount = isSale && remainder > 0.009 && hasCredit ? remainder : 0;

  const problem = useMemo(() => {
    if (!isSale) {
      if (!documentNumber.trim()) return "Escribe el número de documento (ticket).";
      if (detail.trim().length < 2) return "Escribe el detalle del documento.";
      if (mode === "receipt" && !seller.trim()) return "Escribe el vendedor.";
      if (Math.abs(remainder) > 0.009) {
        return `El desglose (${money(paid)}) debe ser igual al total (${money(total)}).`;
      }
    } else {
      if (remainder < -0.009) return "Lo pagado supera el total de la operación.";
      if (remainder > 0.009 && !hasCredit) {
        return `Faltan ${money(remainder)} por pagar: este cliente no tiene crédito.`;
      }
      if (creditAmount > 0 && creditAmount > creditAvailable + 0.009) {
        return `El crédito (${money(creditAmount)}) supera el disponible (${money(creditAvailable)}).`;
      }
      if (creditAmount > 0 && !dueDate) return "Indica el vencimiento del crédito.";
    }
    if ((cashN > 0 || chequeN > 0) && !cashAccountId) return "Selecciona la caja o cuenta del efectivo y los cheques.";
    return "";
  }, [isSale, mode, seller, documentNumber, detail, remainder, paid, total, hasCredit, creditAmount, creditAvailable, dueDate, cashN, chequeN, cashAccountId]);

  function setInstrument(accountId, field, value) {
    setInstruments((current) => ({
      ...current,
      [accountId]: { amount: "", reference: "", ...current[accountId], [field]: value },
    }));
  }

  function accept() {
    if (saving) return;
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError("");
    onAccept({
      documentNumber: documentNumber.trim(),
      detail: detail.trim(),
      paidAt,
      cashAmount: cashN,
      cashAccountId: cashN > 0 ? Number(cashAccountId) : undefined,
      instruments: [
        ...instrumentRows,
        ...(chequeN > 0
          ? [
              {
                bankAccountId: Number(cashAccountId),
                amount: chequeN,
                reference: chequeRef.trim() ? `Cheque ${chequeRef.trim()}` : "Cheque",
              },
            ]
          : []),
      ],
      bonusAmount: bonusN,
      advanceLines: advanceRows,
      creditAmount,
      creditDueDate: dueDate,
      comments: comments.trim(),
      operationType: operationType.trim(),
      sellerName: seller.trim(),
      support,
      print: { enabled: print, copies },
    });
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
                      <input
                        className="is-amount"
                        inputMode="decimal"
                        value={instruments[account.id]?.amount ?? ""}
                        onChange={(event) =>
                          isAmountDraft(event.target.value) &&
                          setInstrument(account.id, "amount", event.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
                {isSale && bonusAvailable > 0 && (
                  <tr className="is-special">
                    <td>BON</td>
                    <td>Bonus / miembro fiel · disponible {money(bonusAvailable)}</td>
                    <td>Se descuenta del saldo del cliente</td>
                    <td>
                      <input
                        className="is-amount"
                        inputMode="decimal"
                        value={bonus}
                        onChange={(event) =>
                          isAmountDraft(event.target.value) && setBonus(event.target.value)
                        }
                      />
                    </td>
                  </tr>
                )}
                {isSale &&
                  advances.map((advance) => (
                    <tr className="is-special" key={`adv${advance.id}`}>
                      <td>SAF</td>
                      <td>
                        Saldo a favor {advance.consecutive} · {money(advance.balance)}
                      </td>
                      <td>Se descuenta del anticipo</td>
                      <td>
                        <input
                          className="is-amount"
                          inputMode="decimal"
                          value={advanceAmounts[advance.id] ?? ""}
                          onChange={(event) =>
                            isAmountDraft(event.target.value) &&
                            setAdvanceAmounts((current) => ({
                              ...current,
                              [advance.id]: event.target.value,
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
              <strong>{money(round(instrumentsTotal + bonusN + advancesTotal))}</strong>
            </div>
          </div>
        ) : (
          <div className="totalize-body">
            {isSale && (
              <div className="totalize-credit-box">
                <div><span>Límite crédito</span><b>{hasCredit ? money(creditLimit) : "Sin crédito"}</b></div>
                <div><span>Saldo anterior</span><b>{money(previousBalance)}</b></div>
                <div><span>Crédito disponible</span><b>{hasCredit ? money(creditAvailable) : "—"}</b></div>
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
                <output className="is-total">{money(total)}</output>
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
                <input
                  autoFocus={isSale}
                  className="is-short is-amount"
                  inputMode="decimal"
                  value={cash}
                  placeholder="0,00"
                  onChange={(event) => {
                    if (!isAmountDraft(event.target.value)) return;
                    setCash(event.target.value);
                    // Pago dividido típico: lo que entra en efectivo se descuenta de la cuenta principal.
                    const keys = Object.keys(instruments);
                    if (firstAccount && keys.length === 1 && keys[0] === String(firstAccount.id)) {
                      setInstrument(
                        firstAccount.id,
                        "amount",
                        String(Math.max(0, round(total - parseAmount(event.target.value) - chequeN - bonusN - advancesTotal))),
                      );
                    }
                  }}
                />
              </label>
              <label>
                <span>Cheques</span>
                <div className="totalize-pair">
                  <input
                    className="is-short is-amount"
                    inputMode="decimal"
                    value={cheque}
                    placeholder="0,00"
                    onChange={(event) => isAmountDraft(event.target.value) && setCheque(event.target.value)}
                  />
                  <input
                    value={chequeRef}
                    placeholder="Banco / número del cheque"
                    disabled={chequeN <= 0}
                    onChange={(event) => setChequeRef(event.target.value)}
                  />
                </div>
              </label>
              {(cashN > 0 || chequeN > 0) && (
                <label>
                  <span>Caja / cuenta del efectivo</span>
                  <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)}>
                    {bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>Instrumentos de pago</span>
                <button type="button" className="totalize-instruments-btn" onClick={() => setShowInstruments(true)}>
                  {instrumentsTotal + bonusN + advancesTotal > 0
                    ? `${money(round(instrumentsTotal + bonusN + advancesTotal))} · ${instrumentRows.length + (bonusN ? 1 : 0) + advanceRows.length} medio(s)`
                    : "0,00"}
                </button>
              </label>
              <label>
                <span>Total desglose</span>
                <output className={`is-total ${Math.abs(remainder) > 0.009 && !creditAmount ? "is-bad" : ""}`}>
                  {money(paid)}
                </output>
              </label>
              {isSale && (
                <label>
                  <span>Crédito{hasCredit ? "" : " (cliente sin crédito)"}</span>
                  <output className="is-total">{money(creditAmount)}</output>
                  {hasCredit && paid > 0.009 && (
                    <button
                      type="button"
                      className="totalize-instruments-btn"
                      title="Quita los pagos de abajo y deja el total (o lo que falte) a crédito"
                      onClick={() => {
                        setInstruments({});
                        setBonus("");
                        setAdvanceAmounts({});
                        setCheque("");
                        setCash("");
                        // El botón desaparece al quedar todo a crédito: devuelve el foco al diálogo
                        // para que F3/Esc sigan funcionando.
                        rootRef.current?.querySelector("input")?.focus();
                      }}
                    >
                      Todo a crédito
                    </button>
                  )}
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
                  <output className="is-total">{money(round(Number(previousBalance) + creditAmount))}</output>
                </label>
              )}
              <label>
                <span>Comentarios del pago</span>
                <textarea value={comments} onChange={(event) => setComments(event.target.value)} rows={2} />
              </label>
              <label>
                <span>
                  <Paperclip size={12} /> Soporte{support ? ` · ${support.supportName}` : ""}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={async (event) => {
                    try {
                      setSupport(await readSupportFile(event.target.files?.[0] ?? null));
                      setLocalError("");
                    } catch (supportError) {
                      event.target.value = "";
                      setSupport(null);
                      setLocalError(supportError.message);
                    }
                  }}
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
                  <input value={seller} onChange={(event) => setSeller(event.target.value)} />
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
