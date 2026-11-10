import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { advanceFrom } from "@/lib/enter-advance";
import { apiClient } from "@/lib/api-client";
import "./purchase-total-dialog.css";
import { formatCop, readCopInput } from "@/lib/cop";
import { CopInput } from "@/components/money/cop-input";
import { dateInputToIso, toDateInputLocal } from "@/lib/date-input";

// En COP los importes son pesos enteros: cada total se redondea al peso.
const round = (value) => Math.round(Number(value) || 0);

const num = (value) => {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const isDraft = (value) => /^\d*([.,]\d{0,2})?$/.test(value);
const todayInput = () => {
  return toDateInputLocal();
};

function addDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputLocal(date);
}

/**
 * «TOTAL OPERACIÓN» de la compra (capturas C26/C29): descuentos, flete, total neto, base
 * imponible y retención (editables con permiso y motivo), pagos en cuenta, saldo
 * pendiente, fecha de factura y vencimiento. El IVA no se modifica.
 *
 * `totals.total` es el total de renglones con IVA incluido y `totals.lines` la base sin IVA.
 */
export function PurchaseTotalDialog({
  totals,
  provider,
  initialReference,
  hasPriceEdits,
  editing,
  saving,
  error,
  onAccept,
  onCancel,
}) {
  const rootRef = useRef(null);
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [freight, setFreight] = useState("");
  const defaultRate = Number(
    provider?.withholdingRate ??
      String(provider?.withholdingType ?? "").match(/[0-9]+(?:[.,][0-9]+)?/)?.[0]?.replace(",", ".") ??
      0,
  );
  const providerRetains =
    !provider?.isSelfWithholding && (provider?.hasIslrWithholding || Boolean(provider?.withholdingType));
  const [rate, setRate] = useState(providerRetains && defaultRate > 0 ? String(defaultRate) : "");
  const [baseText, setBaseText] = useState("");
  const [baseReason, setBaseReason] = useState("");
  const [cash, setCash] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [orderRef, setOrderRef] = useState(initialReference ?? "");
  const [operationType, setOperationType] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayInput());
  const [days, setDays] = useState("0");
  const [notes, setNotes] = useState("");
  const [copies, setCopies] = useState(1);
  const [savePrices, setSavePrices] = useState(true);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    rootRef.current?.querySelector("input")?.focus();
    apiClient
      .getAllPages("/cuentas-bancarias", { estado: "activos" })
      .then((rows) => {
        setAccounts(rows);
        setAccountId((current) => current || String(rows[0]?.id ?? ""));
      })
      .catch(() => {});
  }, []);

  const factor = (1 - Math.min(100, num(d1)) / 100) * (1 - Math.min(100, num(d2)) / 100);
  const afterDiscount = round(totals.total * factor);
  const d1Amount = round(totals.total * (num(d1) / 100));
  const d2Amount = round(totals.total * (1 - num(d1) / 100) * (num(d2) / 100));
  const totalNet = round(afterDiscount + num(freight));
  // Base imponible = renglones sin IVA tras descuentos (el flete no entra en la base).
  const calculatedBase = round(totals.lines * factor);
  const baseEdited = baseText !== "" && Math.abs(num(baseText) - calculatedBase) > 0.01;
  const base = baseText === "" ? calculatedBase : num(baseText);
  const retentionAmount = round(base * (num(rate) / 100));
  const payable = round(totalNet - retentionAmount);
  const paid = round(num(cash));
  const pending = round(payable - paid);
  const dueDate = addDays(invoiceDate, Math.max(0, Math.floor(num(days))));

  const problem = useMemo(() => {
    if (paid > payable + 0.009) return "Lo pagado supera el total a pagar.";
    if (paid > 0 && !accountId) return "Selecciona la caja o cuenta de la que sale el pago.";
    if (baseEdited && baseReason.trim().length < 3) return "Escribe el motivo de la corrección de la base.";
    return "";
  }, [paid, payable, accountId, baseEdited, baseReason]);

  function accept() {
    if (saving) return;
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError("");
    onAccept({
      discount1Percent: num(d1),
      discount2Percent: num(d2),
      freight: num(freight),
      retentionBase: base,
      retentionBaseEdited: baseEdited,
      ...(baseEdited ? { retentionBaseReason: baseReason.trim() } : {}),
      ...(rate !== "" ? { retentionRate: num(rate) } : {}),
      paymentCondition: pending <= 0.009 ? "CONTADO" : "CREDITO",
      invoiceDate: dateInputToIso(invoiceDate),
      dueDate: dateInputToIso(dueDate),
      operationType: operationType.trim() || undefined,
      purchaseOrderRef: orderRef.trim() || undefined,
      notes: notes.trim() || undefined,
      pay: { cash: num(cash), accountId: Number(accountId) || null },
      copies,
      savePrices: hasPriceEdits ? savePrices : false,
    });
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "F3") {
      event.preventDefault();
      accept();
    } else if (event.key === "Enter" && !["BUTTON", "TEXTAREA"].includes(event.target.tagName)) {
      event.preventDefault();
      event.stopPropagation();
      advanceFrom(event.target, { scope: "[data-purchase-total]", onLast: accept });
    }
  }

  const shown = localError || error;

  return (
    <div className="module-dialog-backdrop purchase-total-backdrop">
      <section
        ref={rootRef}
        data-purchase-total
        className="module-dialog purchase-total-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Total operación"
        onKeyDown={handleKeyDown}
      >
        <header className="module-dialog-titlebar purchase-total-title">
          <strong>TOTAL OPERACIÓN</strong>
          <button type="button" aria-label="Cerrar" onClick={onCancel}>
            <X size={17} />
          </button>
        </header>
        <div className="purchase-total-tab">Datos de la operación</div>
        <div className="purchase-total-body">
          <label>
            <span>Total operación</span>
            <output>{formatCop(totals.total)}</output>
          </label>
          <label>
            <span>Primer descuento</span>
            <div className="pt-pair">
              <input value={d1} placeholder="0,00" inputMode="decimal" onChange={(e) => isDraft(e.target.value) && setD1(e.target.value)} />
              <b>{formatCop(d1Amount)} · {formatCop(num(d1))}%</b>
            </div>
          </label>
          <label>
            <span>Segundo descuento</span>
            <div className="pt-pair">
              <input value={d2} placeholder="0,00" inputMode="decimal" onChange={(e) => isDraft(e.target.value) && setD2(e.target.value)} />
              <b>{formatCop(d2Amount)} · {formatCop(num(d2))}%</b>
            </div>
          </label>
          <label>
            <span>Flete</span>
            <CopInput value={readCopInput(freight).value} onChange={(amount) => setFreight(String(amount))} />
          </label>
          <label>
            <span>Total neto</span>
            <output>{formatCop(totalNet)}</output>
          </label>
          <label>
            <span>Base imponible (antes de IVA)</span>
            <div className="pt-pair">
              <CopInput
                value={baseText === "" ? calculatedBase : readCopInput(baseText).value}
                onChange={(amount) => setBaseText(String(amount))}
              />
              <b>Calculada antes de IVA: {formatCop(calculatedBase)}</b>
            </div>
          </label>
          {baseEdited && (
            <label>
              <span>Motivo del cambio de base *</span>
              <input value={baseReason} onChange={(e) => setBaseReason(e.target.value)} />
            </label>
          )}
          <label>
            <span>Retenciones (% sobre la base)</span>
            <div className="pt-pair">
              <input value={rate} placeholder="0" inputMode="decimal" onChange={(e) => isDraft(e.target.value) && setRate(e.target.value)} />
              <b>{formatCop(retentionAmount)}</b>
            </div>
          </label>
          <label>
            <span>Total a pagar</span>
            <output>{formatCop(payable)}</output>
          </label>
          <label>
            <span>Efectivo</span>
            <CopInput value={readCopInput(cash).value} onChange={(amount) => setCash(String(amount))} />
          </label>
          {paid > 0 && (
            <label>
              <span>Caja / cuenta del pago</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>Total pagado</span>
            <output>{formatCop(paid)}</output>
          </label>
          <label>
            <span>Saldo pendiente</span>
            <output className={pending < -0.009 ? "is-bad" : ""}>{formatCop(pending)}</output>
          </label>
          <label>
            <span>Orden de compra</span>
            <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
          </label>
          <label>
            <span>Tipo de operación</span>
            <input value={operationType} onChange={(e) => setOperationType(e.target.value)} />
          </label>
          <label>
            <span>Fecha de posteo</span>
            <input type="date" value={todayInput()} disabled />
          </label>
          <label>
            <span>Fecha factura compra</span>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </label>
          <label>
            <span>Días vencimiento</span>
            <div className="pt-pair">
              <input type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} />
              <b>Vencimiento {dueDate.split("-").reverse().join("/")}</b>
            </div>
          </label>
          <label>
            <span>Comentarios</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label>
            <span>Número de copias</span>
            <input type="number" min="1" max="5" value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
          </label>
          <label className="pt-check">
            <span>Guardar cambio precio</span>
            <input
              type="checkbox"
              checked={hasPriceEdits && savePrices}
              disabled={!hasPriceEdits}
              onChange={(e) => setSavePrices(e.target.checked)}
            />
            <small>{hasPriceEdits ? "Sí: actualiza los precios de venta editados" : "No hay precios editados"}</small>
          </label>
        </div>
        {shown && <p className="totalize-error" role="alert">{shown}</p>}
        <div className="module-dialog-footer">
          <span className="totalize-hint">
            {paid > 0
              ? "Al aceptar con pago la compra se ordena, se recibe y se paga."
              : "Sin pago: queda a crédito hasta el vencimiento."}
            {" · F3 acepta · Esc sale"}
          </span>
          <button type="button" className="primary-action" disabled={saving} onClick={accept}>
            {saving ? "Guardando…" : editing ? "F3 Actualizar" : "F3 Aceptar"}
          </button>
          <button type="button" onClick={onCancel}>Esc Cancelar</button>
        </div>
      </section>
    </div>
  );
}
