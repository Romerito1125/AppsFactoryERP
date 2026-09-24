import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CircleX, MapPin, Phone, RefreshCw, Truck, X } from "lucide-react";

import { NotificationBell, NotificationsWindow } from "@/components/desktop/notification-center";
import { SystemStatusbar } from "@/components/desktop/system-statusbar";
import { TransientMessage } from "@/components/desktop/transient-message";
import { WindowTitlebar } from "@/components/desktop/window-titlebar";
import { apiClient } from "@/lib/api-client";

const statuses = ["PENDIENTE", "EN_PREPARACION", "EN_CAMINO", "ENTREGADO"];
const labels = { PENDIENTE: "Pendiente", EN_PREPARACION: "En preparación", EN_CAMINO: "En camino", ENTREGADO: "Entregado", CANCELADO: "Cancelado" };

export function DeliveryAgentPage({ session, onLogout, onRequestLogin }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setDeliveries(await apiClient.getAllPages("/domicilios")); } catch (requestError) { setError(requestError.message ?? "No se pudieron cargar tus domicilios."); if (/sesión|inicia sesión/i.test(requestError.message ?? "")) onRequestLogin?.(); } finally { setLoading(false); }
  }, [onRequestLogin]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const handler = () => void load(); window.addEventListener("notifications:incoming", handler); return () => window.removeEventListener("notifications:incoming", handler); }, [load]);

  const pending = useMemo(() => deliveries.filter((delivery) => !["ENTREGADO", "CANCELADO"].includes(delivery.status)), [deliveries]);

  async function advance(delivery) {
    const next = statuses[Math.min(statuses.indexOf(delivery.status) + 1, statuses.length - 1)];
    if (!next || next === delivery.status) return;
    try { const updated = await apiClient.patch(`/domicilios/${delivery.id}/estado`, { status: next }); setDeliveries((current) => current.map((item) => item.id === delivery.id ? updated : item)); setSelected(updated); setNotice(`Domicilio ${updated.invoice?.consecutive ?? ""} actualizado: ${labels[next]}.`); } catch (requestError) { setError(requestError.message ?? "No se pudo actualizar el domicilio."); }
  }

  function handleNotification(item) { if (item?.action?.entityId) { const match = deliveries.find((delivery) => Number(delivery.id) === Number(item.action.entityId)); if (match) setSelected(match); } setNotificationOpen(false); }

  return <div className="delivery-agent-app"><WindowTitlebar activeModule="administrative" notificationControl={<NotificationBell session={session} onOpenCenter={() => setNotificationOpen(true)} onOpenNotification={handleNotification} onRequestLogin={onRequestLogin} />} /><main className="delivery-agent-main"><header className="delivery-agent-header"><div><span>OPERACIÓN DE DOMICILIOS</span><h2>Mis entregas</h2><p>Solo ves los domicilios que tienes asignados.</p></div><button type="button" className="p1-secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Actualizar</button></header>{(error || notice) && <TransientMessage className={error ? "window-error" : "p1-success"} role={error ? "alert" : "status"} onDismiss={() => { setError(""); setNotice(""); }}>{error || notice}</TransientMessage>}<div className="delivery-agent-summary"><strong>{pending.length}</strong><span>domicilios en proceso</span><b>{deliveries.filter((delivery) => delivery.status === "ENTREGADO").length}</b><span>entregados</span></div>{loading ? <div className="p1-state"><RefreshCw size={20} className="is-spinning" /> Cargando domicilios…</div> : <div className="delivery-agent-list">{deliveries.map((delivery) => <article className="delivery-agent-card" key={delivery.id}><div className="delivery-agent-card-top"><div><strong>{delivery.invoice?.consecutive ?? `Domicilio #${delivery.id}`}</strong><span className={`delivery-agent-status ${delivery.status?.toLowerCase()}`}>{labels[delivery.status] ?? delivery.status}</span></div><b>${money(delivery.deliveryFee)}</b></div><div className="delivery-agent-card-body"><span><MapPin size={14} /> {delivery.address}</span><span><Phone size={14} /> {delivery.recipientName} · {delivery.recipientPhone}</span>{delivery.notes && <span>Nota: {delivery.notes}</span>}</div><div className="delivery-agent-card-actions"><button type="button" className="p1-small-button" onClick={() => setSelected(delivery)}>Ver detalle</button>{pending.some((item) => item.id === delivery.id) && <button type="button" className="p1-primary-button" onClick={() => void advance(delivery)}><Truck size={14} /> Marcar {labels[statuses[Math.min(statuses.indexOf(delivery.status) + 1, statuses.length - 1)]]}</button>}</div></article>)}{!deliveries.length && <div className="p1-state"><Truck size={25} /> No tienes domicilios asignados.</div>}</div>}</main><SystemStatusbar session={session} onLogin={onRequestLogin} onLogout={onLogout} canOpenPos={false} />{notificationOpen && <div className="delivery-agent-notifications"><NotificationsWindow session={session} onClose={() => setNotificationOpen(false)} onOpenNotification={handleNotification} onRequestLogin={onRequestLogin} /></div>}{selected && <DeliveryDetail delivery={selected} onClose={() => setSelected(null)} onAdvance={() => void advance(selected)} />}</div>;
}

function DeliveryDetail({ delivery, onClose, onAdvance }) { return <div className="delivery-agent-detail-backdrop"><section className="delivery-agent-detail"><header><strong>Detalle del domicilio</strong><button type="button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button></header><div><b>{delivery.invoice?.consecutive ?? "—"}</b><span className={`delivery-agent-status ${delivery.status?.toLowerCase()}`}>{labels[delivery.status]}</span></div><dl><dt>Destinatario</dt><dd>{delivery.recipientName}</dd><dt>Teléfono</dt><dd>{delivery.recipientPhone}</dd><dt>Dirección</dt><dd>{delivery.address}</dd><dt>Valor domicilio</dt><dd>${money(delivery.deliveryFee)}</dd><dt>Notas</dt><dd>{delivery.notes || "Sin notas"}</dd></dl><footer><button type="button" className="p1-secondary-button" onClick={onClose}><CircleX size={14} /> Cerrar</button>{!["ENTREGADO", "CANCELADO"].includes(delivery.status) && <button type="button" className="p1-primary-button" onClick={onAdvance}><Check size={14} /> Avanzar estado</button>}</footer></section></div>; }
function money(value) { return Number(value ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
