import { useEffect, useState } from "react";
import { Activity, CircleX, HandCoins, LoaderCircle, RefreshCw, Save, UsersRound, X } from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

export function ReferralsWindow({ onClose, onRequestLogin }) {
  const [summary, setSummary] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { handlePointerDown, isDragging, style: windowStyle } = useDraggableWindow();

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [summaryResult, policyResult, referralResult] = await Promise.all([
        apiClient.get("/referidos/resumen-utilidades"),
        apiClient.get("/referidos/politicas-utilidad"),
        apiClient.getAllPages("/referidos"),
      ]);
      setSummary(summaryResult);
      setPolicies(policyResult.map((policy) => ({ ...policy, percentage: String(policy.percentage ?? "") })));
      setReferrals(referralResult);
    } catch (requestError) {
      setError(requestError.message ?? "No se pudo cargar el control de referidos.");
      if (/sesión|inicia sesión|401/i.test(requestError.message ?? "")) onRequestLogin?.();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  async function savePolicies() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await apiClient.put("/referidos/politicas-utilidad", policies.map((policy) => ({ generation: Number(policy.generation), percentage: Number(policy.percentage), isActive: policy.generation === 4 ? true : Boolean(policy.isActive) })));
      setPolicies(saved.map((policy) => ({ ...policy, percentage: String(policy.percentage ?? "") })));
      setNotice("Política guardada. La generación 4 queda reservada para obra social.");
    } catch (requestError) {
      setError(requestError.message ?? "No se pudo guardar la política.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`provider-window p1-window referrals-window ${isDragging ? "is-dragging" : ""}`} style={windowStyle} aria-label="Referidos y utilidades">
      <header className="provider-titlebar drag-handle p1-titlebar" onPointerDown={handlePointerDown}><div className="provider-title-mark"><UsersRound size={14} /></div><strong>REFERIDOS Y UTILIDADES</strong><button type="button" className="provider-close" onClick={onClose} aria-label="Cerrar referidos"><X size={17} /></button></header>
      <div className="p1-heading"><div><span>VENTAS · REGLAS DE UTILIDAD</span><h2>Distribución trazable por generaciones</h2><p>La base calcula sobre utilidad; la generación 4 no es cobrable y se destina a obra social.</p></div><button type="button" className="p1-secondary-button" onClick={() => void loadData()} disabled={loading}><RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Actualizar</button></div>
      {(error || notice) && <TransientMessage className={error ? "window-error" : "p1-success"} role={error ? "alert" : "status"} onDismiss={() => { setError(""); setNotice(""); }}>{error || notice}</TransientMessage>}
      {loading ? <div className="p1-state p1-page-state"><LoaderCircle size={24} className="is-spinning" /> Cargando utilidades…</div> : <>
        <div className="p1-kpi-grid"><Metric icon={<HandCoins size={17} />} label="Por entregar" value={summary?.porEntregar} tone="blue" /><Metric icon={<Activity size={17} />} label="Total repartido" value={summary?.totalRepartido} tone="green" /><Metric icon={<UsersRound size={17} />} label="Obra social" value={summary?.obraSocial} tone="orange" /><Metric icon={<Activity size={17} />} label="Referidos registrados" value={referrals.length} tone="violet" isMoney={false} /></div>
        <div className="p1-content-grid referrals-grid">
          <section className="p1-card"><div className="p1-card-title"><div><strong>Reglas por generación</strong><span>El porcentaje se aplica a la utilidad aprobada.</span></div><button type="button" className="p1-primary-button" onClick={() => void savePolicies()} disabled={saving}><Save size={14} /> {saving ? "Guardando…" : "Guardar reglas"}</button></div><div className="p1-policy-table"><div className="p1-policy-head"><span>Generación</span><span>Porcentaje</span><span>Destino</span><span>Estado</span></div>{policies.map((policy) => <div className={`p1-policy-row ${policy.generation === 4 ? "is-social" : ""}`} key={policy.generation}><strong>Generación {policy.generation}</strong><label><input type="number" min="0" max="100" step="0.01" disabled={policy.generation === 4} value={policy.percentage} onChange={(event) => setPolicies((current) => current.map((item) => item.generation === policy.generation ? { ...item, percentage: event.target.value } : item))} /> %</label><span>{policy.generation === 4 ? "Obra social · no cobrable" : "Beneficio del referido"}</span><label className="p1-checkbox"><input type="checkbox" disabled={policy.generation === 4} checked={policy.generation === 4 ? true : Boolean(policy.isActive)} onChange={(event) => setPolicies((current) => current.map((item) => item.generation === policy.generation ? { ...item, isActive: event.target.checked } : item))} /> Activa</label></div>)}</div></section>
          <section className="p1-card"><div className="p1-card-title"><div><strong>Resumen por generación</strong><span>Historial económico sin mostrar utilidad neta de referidos.</span></div></div><div className="p1-generation-list">{(summary?.porGeneracion ?? []).map((row) => <div className={`p1-generation-row ${row.generation === 4 ? "is-social" : ""}`} key={row.generation}><div><strong>G{row.generation}</strong><span>{row.generation === 4 ? "Destino social" : "Beneficio"}</span></div><b>${money(row.generated)}</b><small>Disponible ${money(row.available)} · Usado ${money(row.used)}{row.socialWork ? ` · Social $${money(row.socialWork)}` : ""}</small></div>)}{!(summary?.porGeneracion ?? []).length && <div className="p1-state">Sin movimientos aún.</div>}</div></section>
        </div>
        <section className="p1-card p1-referrals-table-card"><div className="p1-card-title"><div><strong>Trazabilidad de la red</strong><span>{referrals.length} relaciones registradas · compras y utilidades se auditan en Acciones del sistema.</span></div></div>{referrals.length ? <div className="p1-simple-table"><div className="p1-simple-head"><span>Código</span><span>Referente</span><span>Cliente referido</span><span>Fecha</span></div>{referrals.slice(0, 50).map((referral) => <div className="p1-simple-row" key={referral.id}><span>{referral.codeUsed}</span><span>{clientName(referral.referrerClient)}</span><span>{clientName(referral.referredClient)}</span><span>{date(referral.createdAt)}</span></div>)}</div> : <div className="p1-state">No hay relaciones de referidos registradas.</div>}</section>
      </>}
      <footer className="provider-window-footer"><span>La cuarta generación se informa, pero nunca aparece como saldo cobrable del usuario.</span><button type="button" className="exit-action" onClick={onClose}><CircleX size={14} /> Salir</button></footer>
    </section>
  );
}

function Metric({ icon, label, value, tone, isMoney = true }) { return <article className={`p1-kpi ${tone}`}><span>{icon} {label}</span><strong>{isMoney ? `$${money(value)}` : Number(value ?? 0).toLocaleString("es-CO")}</strong></article>; }
function clientName(client) { return [client?.firstName, client?.lastName].filter(Boolean).join(" ") || client?.identification || "—"; }
function date(value) { return value ? new Date(value).toLocaleDateString("es-CO") : "—"; }
function money(value) { return Number(value ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
