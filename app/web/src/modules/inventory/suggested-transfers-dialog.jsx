import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { apiClient } from "@/lib/api-client";

const qty = (value) => Number(value ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 3 });

/**
 * #31 · Traslados sugeridos: bodegas bajo el mínimo contra bodegas con excedente, agrupados por
 * proveedor/marca. La cantidad es editable y cada ruta bodega→bodega se genera como un traslado
 * múltiple (mismo endpoint de la pestaña Traslados).
 */
export function SuggestedTransfersDialog({ onClose, onDone, onError }) {
  const [rows, setRows] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiClient
      .get("/inventario/traslados/sugeridos")
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRows(list);
        setQuantities(Object.fromEntries(list.map((row, index) => [index, String(row.quantity)])));
        setPicked(Object.fromEntries(list.map((_, index) => [index, true])));
      })
      .catch((requestError) => {
        setRows([]);
        setMessage(requestError.message ?? "No se pudieron calcular los traslados sugeridos.");
      });
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    (rows ?? []).forEach((row, index) => {
      const key = row.providerName || row.brand || "Sin proveedor / marca";
      map.set(key, [...(map.get(key) ?? []), { row, index }]);
    });
    return [...map.entries()];
  }, [rows]);

  async function generate() {
    const chosen = (rows ?? [])
      .map((row, index) => ({ row, index, quantity: Number(String(quantities[index]).replace(",", ".")) }))
      .filter((entry) => picked[entry.index] && entry.quantity > 0);
    if (!chosen.length) {
      setMessage("Selecciona al menos una línea con cantidad.");
      return;
    }
    const routes = new Map();
    chosen.forEach(({ row, quantity }) => {
      const key = `${row.fromWarehouseId}>${row.toWarehouseId}`;
      const route = routes.get(key) ?? { fromWarehouseId: row.fromWarehouseId, toWarehouseId: row.toWarehouseId, items: [] };
      route.items.push({ productId: row.productId, quantity: Math.min(quantity, row.fromAvailable) });
      routes.set(key, route);
    });
    setBusy(true);
    setMessage("");
    try {
      const batches = [];
      for (const route of routes.values()) {
        const result = await apiClient.post("/inventario/traslado-multiple", {
          ...route,
          supportNote: "Traslado sugerido por stock mínimo",
        });
        batches.push(result?.batchNumber ?? "grupo generado");
      }
      onDone(`Traslados generados: ${batches.join(", ")}`);
    } catch (requestError) {
      setMessage(requestError.message ?? "No se pudo generar el traslado.");
      onError?.(requestError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="module-dialog-backdrop">
      <section className="module-dialog suggested-transfers-dialog" role="dialog" aria-modal="true" aria-label="Traslados sugeridos">
        <header className="module-dialog-titlebar">
          <strong>TRASLADOS SUGERIDOS</strong>
          <button type="button" aria-label="Cerrar" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="suggested-transfers-body">
          {rows === null && <p>Calculando sugerencias…</p>}
          {rows && !rows.length && <p>No hay bodegas bajo el mínimo con excedente disponible en otra bodega.</p>}
          {groups.map(([group, entries]) => (
            <section key={group}>
              <h4>{group}</h4>
              <table className="suggested-transfers-table">
                <thead>
                  <tr><th></th><th>Producto</th><th>Desde</th><th>Hacia</th><th>Destino (mín / actual)</th><th>Cantidad</th></tr>
                </thead>
                <tbody>
                  {entries.map(({ row, index }) => (
                    <tr key={index}>
                      <td><input type="checkbox" checked={Boolean(picked[index])} onChange={(e) => setPicked((c) => ({ ...c, [index]: e.target.checked }))} /></td>
                      <td>{row.productName}</td>
                      <td>{row.fromWarehouse} ({qty(row.fromAvailable)})</td>
                      <td>{row.toWarehouse}</td>
                      <td>{qty(row.minimum)} / {qty(row.toAvailable)}</td>
                      <td><input className="suggested-qty" value={quantities[index] ?? ""} inputMode="decimal" onChange={(e) => setQuantities((c) => ({ ...c, [index]: e.target.value }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        {message && <p className="totalize-error" role="alert">{message}</p>}
        <div className="module-dialog-footer">
          <button type="button" className="primary-action" disabled={busy || !rows?.length} onClick={generate}>
            {busy ? "Generando…" : "Generar traslados"}
          </button>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  );
}
