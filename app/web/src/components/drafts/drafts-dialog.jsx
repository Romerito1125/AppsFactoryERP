import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import "./drafts-dialog.css";

const stamp = (value) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";

/** Guarda (o actualiza) un documento en espera. No afecta stock, caja, cartera ni saldos. */
export function saveDraft({ id, kind, title, payload }) {
  return apiClient.post("/borradores", { id, kind, title, payload });
}

/**
 * Documentos en espera (ventas «VENTA» o compras «COMPRA»): lista, retoma o elimina.
 * `onLoad(draft)` recibe el borrador completo con su `payload`.
 */
export function DraftsDialog({ kind, onLoad, onClose }) {
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/borradores", { kind })
      .then((rows) => !cancelled && setDrafts(Array.isArray(rows) ? rows : []))
      .catch((requestError) => !cancelled && setError(requestError.message));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  async function open(draft) {
    setBusyId(draft.id);
    try {
      onLoad(await apiClient.get(`/borradores/${draft.id}`));
    } catch (requestError) {
      setError(requestError.message);
      setBusyId(null);
    }
  }

  async function remove(draft) {
    if (!window.confirm(`¿Eliminar el borrador «${draft.title}»?`)) return;
    try {
      await apiClient.delete(`/borradores/${draft.id}`);
      setDrafts((current) => current.filter((row) => row.id !== draft.id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="module-dialog-backdrop drafts-backdrop" onClick={onClose}>
      <section
        className="module-dialog drafts-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <header className="module-dialog-titlebar">
          <strong>{kind === "VENTA" ? "FACTURAS EN ESPERA" : "COMPRAS EN ESPERA"}</strong>
          <button type="button" aria-label="Cerrar" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <p className="drafts-hint">
          Para guardar una compra sin confirmarla usa «Guardar en espera». Para continuarla después, pulsa «Retomar».
          Mientras está en espera no mueve inventario, caja, bancos ni cartera.
        </p>
        {error && <p className="totalize-error" role="alert">{error}</p>}
        <table className="saint-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Actualizado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(drafts ?? []).map((draft) => (
              <tr key={draft.id}>
                <td>{draft.title}</td>
                <td>{draft.username}</td>
                <td>{stamp(draft.updatedAt)}</td>
                <td className="drafts-actions">
                  <button type="button" className="primary-action" disabled={busyId === draft.id} onClick={() => open(draft)}>
                    {busyId === draft.id ? "Abriendo…" : "Retomar"}
                  </button>
                  <button type="button" onClick={() => remove(draft)}>Eliminar</button>
                </td>
              </tr>
            ))}
            {drafts && !drafts.length && (
              <tr>
                <td colSpan="4" className="saint-empty">No hay documentos en espera.</td>
              </tr>
            )}
            {!drafts && !error && (
              <tr>
                <td colSpan="4" className="saint-empty">Consultando…</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="module-dialog-footer">
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  );
}
