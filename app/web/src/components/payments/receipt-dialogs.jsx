import { useState } from "react";
import { X } from "lucide-react";

import { readSupportFile } from "./support-file";
import "./totalize-dialog.css";

/* ------------------------------ Editar / anular ------------------------------ */

export function ReceiptEditDialog({ receipt, onSave, onCancel, saving, error }) {
  const [documentNumber, setDocumentNumber] = useState(receipt.documentNumber);
  const [detail, setDetail] = useState(receipt.detail);
  const [paidAt, setPaidAt] = useState(String(receipt.paidAt).slice(0, 10));
  const [comments, setComments] = useState(receipt.comments ?? "");
  const [operationType, setOperationType] = useState(receipt.operationType ?? "");
  const [sellerName, setSellerName] = useState(receipt.sellerName ?? "");
  const [support, setSupport] = useState(null);
  const [removeSupport, setRemoveSupport] = useState(false);
  const [localError, setLocalError] = useState("");

  return (
    <div className="module-dialog-backdrop totalize-backdrop">
      <section
        className="module-dialog totalize-dialog"
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => event.key === "Escape" && onCancel()}
      >
        <header className="module-dialog-titlebar">
          <strong>EDITAR RECIBO {receipt.receiptNumber}</strong>
          <button type="button" aria-label="Cerrar" onClick={onCancel}><X size={17} /></button>
        </header>
        <div className="totalize-body">
          <p className="cobrar-edit-note">
            Los valores y el banco no se modifican aquí. Si el monto está mal, anula el recibo y regístralo de nuevo.
            Cada cambio queda en la auditoría.
          </p>
          <div className="totalize-grid">
            <label><span>Número de documento (ticket)</span><input autoFocus value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} /></label>
            <label><span>Fecha documento</span><input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></label>
            <label className="is-wide"><span>Detalle documento</span><input value={detail} onChange={(e) => setDetail(e.target.value)} /></label>
            <label><span>Tipo de operación</span><input value={operationType} onChange={(e) => setOperationType(e.target.value)} /></label>
            <label><span>Vendedor</span><input value={sellerName} onChange={(e) => setSellerName(e.target.value)} /></label>
            <label className="is-wide"><span>Comentarios</span><textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} /></label>
            <label className="is-wide">
              <span>
                Soporte {receipt.hasSupport || receipt.supportName ? `actual: ${receipt.supportName ?? "adjunto"}` : "(ninguno)"}
                {support ? ` → nuevo: ${support.supportName}` : ""}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={async (event) => {
                  try {
                    setSupport(await readSupportFile(event.target.files?.[0] ?? null));
                    setRemoveSupport(false);
                    setLocalError("");
                  } catch (supportError) {
                    event.target.value = "";
                    setLocalError(supportError.message);
                  }
                }}
              />
              {(receipt.hasSupport || receipt.supportName) && (
                <label className="cobrar-inline">
                  <input type="checkbox" checked={removeSupport} onChange={(e) => setRemoveSupport(e.target.checked)} /> Quitar el soporte actual
                </label>
              )}
            </label>
          </div>
        </div>
        {(localError || error) && <p className="totalize-error" role="alert">{localError || error}</p>}
        <div className="module-dialog-footer">
          <button
            type="button"
            className="primary-action"
            disabled={saving}
            onClick={() =>
              onSave({
                documentNumber: documentNumber.trim(),
                detail: detail.trim(),
                paidAt: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
                comments,
                operationType,
                sellerName,
                removeSupport: removeSupport || undefined,
                ...(support ?? {}),
              })
            }
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <button type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}

export function VoidReceiptDialog({ receiptNumber, onConfirm, onCancel, saving, error }) {
  const [reason, setReason] = useState("");
  return (
    <div className="module-dialog-backdrop totalize-backdrop">
      <section className="module-dialog totalize-dialog" role="dialog" aria-modal="true">
        <header className="module-dialog-titlebar">
          <strong>ANULAR RECIBO {receiptNumber}</strong>
          <button type="button" aria-label="Cerrar" onClick={onCancel}><X size={17} /></button>
        </header>
        <div className="totalize-body">
          <p className="cobrar-edit-note">
            Se devolverá el saldo a las facturas abonadas y se registrará un egreso por el mismo valor en las cuentas
            que recibieron el dinero (necesitan saldo suficiente).
          </p>
          <label className="totalize-grid">
            <span>Motivo de la anulación</span>
            <input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        </div>
        {error && <p className="totalize-error" role="alert">{error}</p>}
        <div className="module-dialog-footer">
          <button type="button" className="primary-action" disabled={saving || reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>
            {saving ? "Anulando…" : "Anular recibo"}
          </button>
          <button type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}

export function InvoiceEditDialog({ invoice, onSave, onCancel, saving, error }) {
  const [consecutive, setConsecutive] = useState(invoice.consecutive ?? "");
  const [localError, setLocalError] = useState("");
  return (
    <div className="module-dialog-backdrop totalize-backdrop">
      <section className="module-dialog totalize-dialog" role="dialog" aria-modal="true">
        <header className="module-dialog-titlebar">
          <strong>EDITAR FACTURA {invoice.consecutive}</strong>
          <button type="button" aria-label="Cerrar" onClick={onCancel}><X size={17} /></button>
        </header>
        <div className="totalize-body">
          <p className="cobrar-edit-note">
            Puedes corregir el número de la factura. Los productos, valores, inventario y pagos no se modifican desde este estado de cuenta.
          </p>
          <label>
            <span>Número de factura *</span>
            <input
              autoFocus
              value={consecutive}
              onChange={(event) => setConsecutive(event.target.value)}
            />
          </label>
        </div>
        {(localError || error) && <p className="totalize-error" role="alert">{localError || error}</p>}
        <div className="module-dialog-footer">
          <button
            type="button"
            className="primary-action"
            disabled={saving}
            onClick={() => {
              const value = consecutive.trim();
              if (value.length < 3) return setLocalError("Escribe un número de factura válido.");
              setLocalError("");
              onSave({ consecutive: value });
            }}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <button type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}
