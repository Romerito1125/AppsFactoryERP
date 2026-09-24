import { useEffect, useMemo, useState } from "react";
import { BadgePercent, CalendarClock, Check, CircleX, Filter, LoaderCircle, Plus, RefreshCw, Search, Tag, UsersRound, X } from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

const DISCOUNT_TYPES = [
  ["PORCENTAJE", "Porcentaje"],
  ["MONTO_FIJO", "Monto fijo"],
  ["PRECIO_ESPECIAL", "Precio especial directo"],
];

const emptyDraft = {
  name: "",
  description: "",
  discountType: "PORCENTAJE",
  discountValue: "",
  startsAt: "",
  endsAt: "",
  minimumProductQuantity: "",
  maximumProductQuantity: "",
  isStackable: false,
  clientId: "",
  productId: "",
  productTypeId: "",
  tagId: "",
};

export function OffersWindow({ onClose, onRequestLogin }) {
  const [offers, setOffers] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [tags, setTags] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { handlePointerDown, isDragging, style: windowStyle } = useDraggableWindow();

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [offerRows, clientRows, productRows, productTypeRows, tagRows] = await Promise.all([
        apiClient.getAllPages("/ofertas", { estado: "todos" }),
        apiClient.getAllPages("/clientes", { estado: "activos" }),
        apiClient.getAllPages("/productos", { estado: "activos" }),
        apiClient.getAllPages("/tipos-producto", { estado: "activos" }),
        apiClient.getAllPages("/etiquetas", { estado: "activos" }),
      ]);
      setOffers(offerRows);
      setClients(clientRows);
      setProducts(productRows);
      setProductTypes(productTypeRows);
      setTags(tagRows);
    } catch (requestError) {
      setError(requestError.message ?? "No se pudieron cargar las ofertas.");
      if (/sesión|inicia sesión|401/i.test(requestError.message ?? "")) onRequestLogin?.();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const visibleOffers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return offers;
    return offers.filter((offer) => `${offer.name} ${offer.description ?? ""}`.toLowerCase().includes(query));
  }, [offers, search]);

  function startNew() {
    setEditingId(null);
    setDraft(emptyDraft);
    setNotice("");
  }

  function editOffer(offer) {
    setEditingId(offer.id);
    setDraft({
      name: offer.name ?? "",
      description: offer.description ?? "",
      discountType: offer.discountType ?? "PORCENTAJE",
      discountValue: String(offer.discountValue ?? ""),
      startsAt: toDateInput(offer.startsAt),
      endsAt: toDateInput(offer.endsAt),
      minimumProductQuantity: String(offer.minimumProductQuantity ?? ""),
      maximumProductQuantity: String(offer.maximumProductQuantity ?? ""),
      isStackable: Boolean(offer.isStackable),
      clientId: String(offer.clients?.[0]?.id ?? offer.offerClients?.[0]?.clientId ?? ""),
      productId: String(offer.products?.[0]?.id ?? offer.offerProducts?.[0]?.productId ?? ""),
      productTypeId: String(offer.productTypes?.[0]?.id ?? offer.offerProductTypes?.[0]?.productTypeId ?? ""),
      tagId: String(offer.tags?.[0]?.id ?? offer.offerTags?.[0]?.tagId ?? ""),
    });
  }

  async function saveOffer(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      discountType: draft.discountType,
      discountValue: Number(draft.discountValue),
      startsAt: draft.startsAt ? new Date(`${draft.startsAt}T00:00:00`).toISOString() : undefined,
      endsAt: draft.endsAt ? new Date(`${draft.endsAt}T23:59:59`).toISOString() : undefined,
      minimumProductQuantity: draft.minimumProductQuantity ? Number(draft.minimumProductQuantity) : undefined,
      maximumProductQuantity: draft.maximumProductQuantity ? Number(draft.maximumProductQuantity) : undefined,
      isStackable: draft.isStackable,
      clientIds: draft.clientId ? [Number(draft.clientId)] : [],
      productIds: draft.productId ? [Number(draft.productId)] : [],
      productTypeIds: draft.productTypeId ? [Number(draft.productTypeId)] : [],
      tagIds: draft.tagId ? [Number(draft.tagId)] : [],
    };
    try {
      const saved = editingId
        ? await apiClient.patch(`/ofertas/${editingId}`, body)
        : await apiClient.post("/ofertas", body);
      setOffers((current) => editingId ? current.map((offer) => offer.id === editingId ? saved : offer) : [saved, ...current]);
      setNotice(editingId ? "Oferta actualizada." : "Oferta creada y disponible para POS y app.");
      startNew();
    } catch (requestError) {
      setError(requestError.message ?? "No se pudo guardar la oferta.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOffer(offer) {
    try {
      const updated = offer.isActive
        ? await apiClient.delete(`/ofertas/${offer.id}`)
        : await apiClient.patch(`/ofertas/${offer.id}/reactivar`, {});
      setOffers((current) => current.map((item) => item.id === offer.id ? updated : item));
      setNotice(offer.isActive ? "Oferta desactivada." : "Oferta activada.");
    } catch (requestError) {
      setError(requestError.message ?? "No se pudo cambiar el estado.");
    }
  }

  return (
    <section className={`provider-window p1-window offers-window ${isDragging ? "is-dragging" : ""}`} style={windowStyle} aria-label="Ofertas y precios especiales">
      <header className="provider-titlebar drag-handle p1-titlebar" onPointerDown={handlePointerDown}>
        <div className="provider-title-mark"><BadgePercent size={14} /></div>
        <strong>OFERTAS Y PRECIOS ESPECIALES</strong>
        <button type="button" className="provider-close" onClick={onClose} aria-label="Cerrar ofertas"><X size={17} /></button>
      </header>
      <div className="p1-heading">
        <div><span>VENTAS · PRECIOS</span><h2>Ofertas que funcionan en POS y app</h2><p>Asigna un cliente o producto y define porcentaje, monto o precio final directo.</p></div>
        <button type="button" className="p1-secondary-button" onClick={() => void loadData()} disabled={loading}><RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Actualizar</button>
      </div>
      {(error || notice) && <TransientMessage className={error ? "window-error" : "p1-success"} role={error ? "alert" : "status"} onDismiss={() => { setError(""); setNotice(""); }}>{error || notice}</TransientMessage>}
      <div className="p1-content-grid">
        <section className="p1-card">
          <div className="p1-card-title"><div><strong>{editingId ? "Editar oferta" : "Nueva oferta"}</strong><span>El precio especial es el valor final por unidad.</span></div>{editingId && <button type="button" className="p1-link-button" onClick={startNew}>Nueva</button>}</div>
          <form className="p1-form" onSubmit={saveOffer}>
            <label>Nombre<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej. Precio mayorista café" /></label>
            <label>Descripción<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Condición de la oferta" /></label>
            <div className="p1-form-row"><label>Tipo<select value={draft.discountType} onChange={(event) => setDraft({ ...draft, discountType: event.target.value })}>{DISCOUNT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>{draft.discountType === "PORCENTAJE" ? "% descuento" : "Valor"}<input required type="number" min="0" step="0.01" value={draft.discountValue} onChange={(event) => setDraft({ ...draft, discountValue: event.target.value })} placeholder={draft.discountType === "PRECIO_ESPECIAL" ? "Precio final" : "0"} /></label></div>
            <div className="p1-form-row"><label>Cliente (opcional)<select value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}><option value="">Todos los clientes</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.firstName} {client.lastName} · {client.identification}</option>)}</select></label><label>Producto (opcional)<select value={draft.productId} onChange={(event) => setDraft({ ...draft, productId: event.target.value })}><option value="">Todos los productos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.code}</option>)}</select></label></div>
            <div className="p1-form-row"><label>Línea / tipo (opcional)<select value={draft.productTypeId} onChange={(event) => setDraft({ ...draft, productTypeId: event.target.value })}><option value="">Todos los tipos</option>{productTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Etiqueta (opcional)<select value={draft.tagId} onChange={(event) => setDraft({ ...draft, tagId: event.target.value })}><option value="">Todas las etiquetas</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label></div>
            <div className="p1-form-row"><label>Desde<input type="date" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label><label>Hasta<input type="date" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label></div>
            <div className="p1-form-row"><label>Mínimo unidades<input type="number" min="1" value={draft.minimumProductQuantity} onChange={(event) => setDraft({ ...draft, minimumProductQuantity: event.target.value })} /></label><label>Máximo unidades<input type="number" min="1" value={draft.maximumProductQuantity} onChange={(event) => setDraft({ ...draft, maximumProductQuantity: event.target.value })} /></label></div>
            <label className="p1-checkbox"><input type="checkbox" checked={draft.isStackable} onChange={(event) => setDraft({ ...draft, isStackable: event.target.checked })} /> Se puede acumular con otra oferta</label>
            <div className="p1-form-actions"><button type="submit" className="p1-primary-button" disabled={saving}><Check size={14} /> {saving ? "Guardando…" : "Guardar oferta"}</button><button type="button" className="p1-secondary-button" onClick={startNew}><CircleX size={14} /> Limpiar</button></div>
          </form>
        </section>
        <section className="p1-card p1-list-card">
          <div className="p1-card-title"><div><strong>Ofertas configuradas</strong><span>{offers.length} registros · cálculo compartido por POS y app</span></div></div>
          <div className="p1-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre…" /><Filter size={14} /></div>
          {loading ? <div className="p1-state"><LoaderCircle size={20} className="is-spinning" /> Cargando…</div> : visibleOffers.length ? <div className="p1-offer-list">{visibleOffers.map((offer) => <article className={`p1-offer-row ${offer.isActive ? "" : "is-inactive"}`} key={offer.id}><div className="p1-offer-icon"><Tag size={16} /></div><div className="p1-offer-main"><strong>{offer.name}</strong><span>{discountLabel(offer)} · {targetLabel(offer)}</span><small><CalendarClock size={12} /> {dateLabel(offer.startsAt, offer.endsAt)} {offer.isStackable ? "· Acumulable" : ""}</small></div><div className="p1-offer-actions"><button type="button" className="p1-small-button" onClick={() => editOffer(offer)}>Editar</button><button type="button" className="p1-small-button" onClick={() => void toggleOffer(offer)}>{offer.isActive ? "Desactivar" : "Activar"}</button></div></article>)}</div> : <div className="p1-state"><Tag size={25} /> No hay ofertas para este filtro.</div>}
        </section>
      </div>
      <footer className="provider-window-footer"><span>El motor aplica automáticamente el precio vigente y la condición del cliente.</span><button type="button" className="exit-action" onClick={onClose}><CircleX size={14} /> Salir</button></footer>
    </section>
  );
}

function discountLabel(offer) {
  if (offer.discountType === "PRECIO_ESPECIAL") return `Precio final $${formatNumber(offer.discountValue)}`;
  if (offer.discountType === "MONTO_FIJO") return `Descuento $${formatNumber(offer.discountValue)}`;
  return `${formatNumber(offer.discountValue)}% de descuento`;
}

function targetLabel(offer) {
  const clients = offer.clients?.length ?? offer.offerClients?.length ?? 0;
  const products = offer.products?.length ?? offer.offerProducts?.length ?? 0;
  if (clients && products) return `${clients} cliente(s) · ${products} producto(s)`;
  if (clients) return `${clients} cliente(s)`;
  if (products) return `${products} producto(s)`;
  return "Regla general";
}

function dateLabel(startsAt, endsAt) {
  if (!startsAt && !endsAt) return "Siempre vigente";
  return `${startsAt ? new Date(startsAt).toLocaleDateString("es-CO") : "Desde hoy"} – ${endsAt ? new Date(endsAt).toLocaleDateString("es-CO") : "Sin vencimiento"}`;
}

function toDateInput(value) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function formatNumber(value) { return Number(value ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 2 }); }
