import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Edit3,
  Package,
  Plus,
  Search,
  Sigma,
  Trash2,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { apiClient } from "@/lib/api-client";
import { ProductsWindow } from "@/modules/products/products-window";

const demoProviders = [
  {
    id: "000001",
    name: "CENTRAL DE ABASTOS SAS",
    description: "CENTRAL DE ABASTOS SAS",
    type: "JURÍDICO",
    supplierType: "Nacional",
    taxId: "800123456-9",
    className: "Mayorista",
    representative: "María Fernanda Rojas",
    address1: "Carrera 5 # 24-18",
    address2: "",
    country: "COLOMBIA",
    department: "TOLIMA",
    city: "MELGAR",
    municipality: "MELGAR",
    postalCode: "734001",
    phones: "3752255",
    mobile: "310 555 0198",
    fax: "",
    email: "compras@centralabastos.co",
    startDate: "16/07/2014",
    active: true,
    withholdingType: "Contribuyente",
    hasIslrWithholding: true,
    creditDays: "30",
    observations: "Proveedor principal de abarrotes.",
    pendingBalance: "0.0",
    advances: "0.0",
    lastPurchase: "18/08/2026",
    lastPayment: "25/08/2026",
    maxCredit: "15.000.000",
    averagePaymentDays: "28",
    withholdings: "0.0",
  },
  {
    id: "000002",
    name: "CARNES DON PEPITO",
    description: "CARNES DON PEPITO",
    type: "NATURAL",
    firstName: "Carlos",
    middleName: "",
    lastName: "Pérez",
    secondLastName: "",
    supplierType: "Nacional",
    taxId: "900456789-2",
    className: "Minorista",
    representative: "Carlos Pérez",
    address1: "Calle 11 # 8-42",
    address2: "",
    country: "COLOMBIA",
    department: "BOLÍVAR",
    city: "CARMEN DE BOLÍVAR",
    municipality: "CARMEN DE BOLÍVAR",
    postalCode: "131001",
    phones: "6861022",
    mobile: "315 440 1288",
    fax: "",
    email: "ventas@donpepito.co",
    startDate: "08/01/2020",
    active: true,
    withholdingType: "Exento de retención",
    hasIslrWithholding: false,
    creditDays: "0",
    observations: "Compra directa de productos cárnicos.",
    pendingBalance: "0.0",
    advances: "0.0",
    lastPurchase: "12/08/2026",
    lastPayment: "12/08/2026",
    maxCredit: "0.0",
    averagePaymentDays: "0",
    withholdings: "0.0",
  },
  {
    id: "80000000",
    name: "SMARTTECH SAS",
    description: "SMARTTECH SAS",
    type: "JURÍDICO",
    supplierType: "Nacional",
    taxId: "901235460-7",
    className: "Tecnología",
    representative: "Equipo comercial",
    address1: "Avenida El Dorado # 68-12",
    address2: "Oficina 402",
    country: "COLOMBIA",
    department: "CUNDINAMARCA",
    city: "BOGOTÁ D.C.",
    municipality: "BOGOTÁ D.C.",
    postalCode: "110931",
    phones: "601 742 8800",
    mobile: "",
    fax: "",
    email: "contacto@smarttech.co",
    startDate: "22/03/2022",
    active: true,
    withholdingType: "Autorretenedor",
    hasIslrWithholding: true,
    creditDays: "15",
    observations: "Proveedor de equipos y servicios tecnológicos.",
    pendingBalance: "0.0",
    advances: "0.0",
    lastPurchase: "02/08/2026",
    lastPayment: "20/08/2026",
    maxCredit: "8.000.000",
    averagePaymentDays: "16",
    withholdings: "125.000",
  },
];

const tabs = [
  { id: "statistics", label: "Estadística", icon: Sigma },
  { id: "products", label: "Productos", icon: Package },
];

const emptyProvider = {
  id: "",
  recordId: null,
  name: "",
  description: "",
  type: "JURÍDICO",
  supplierType: "Nacional",
  taxId: "",
  className: "",
  representative: "",
  address1: "",
  address2: "",
  country: "",
  department: "",
  city: "",
  municipality: "",
  postalCode: "",
  phones: "",
  mobile: "",
  fax: "",
  email: "",
  startDate: "",
  active: true,
  withholdingType: "",
  hasIslrWithholding: false,
  creditDays: "",
  observations: "",
  pendingBalance: "0",
  advances: "0",
  lastPurchase: "",
  lastPayment: "",
  maxCredit: "0",
  averagePaymentDays: "0",
  withholdings: "0",
};

function mapProvider(provider) {
  const recordId = Number(provider.id);
  return {
    ...emptyProvider,
    ...provider,
    id: String(provider.taxId || provider.id).padStart(
      provider.taxId ? 0 : 6,
      "0",
    ),
    recordId,
    name: provider.name ?? "",
    description: provider.description || provider.name || "",
    type: String(provider.providerType || "")
      .toUpperCase()
      .includes("NATURAL")
      ? "NATURAL"
      : "JURÍDICO",
    supplierType: provider.providerType || "Nacional",
    taxId: provider.taxId || "",
    representative: provider.legalRepresentative || "",
    address1: provider.address || "",
    phones: provider.phonePrimary || "",
    mobile: provider.phoneSecondary || "",
    email: provider.email || "",
    active: provider.isActive !== false,
    purchaseCount: provider._count?.purchaseOrders ?? 0,
    productCount: provider._count?.productLinks ?? 0,
  };
}

export function ProvidersWindow({ onClose, onRequestLogin }) {
  const [providers, setProviders] = useState(() =>
    demoProviders.map((provider) => ({
      ...provider,
      recordId: Number(provider.id),
    })),
  );
  const [selectedId, setSelectedId] = useState(Number(demoProviders[0].id));
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("main");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [providerProducts, setProviderProducts] = useState([]);
  const [nestedProductId, setNestedProductId] = useState(null);
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getAllPages("/proveedores", { estado: "todos" })
      .then((items) => {
        if (cancelled || !items.length) return;
        const nextProviders = items.map(mapProvider);
        setProviders(nextProviders);
        setSelectedId(nextProviders[0].recordId);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProvider =
    providers.find((provider) => provider.recordId === selectedId) ??
    providers[0];
  const shownProvider = editing ? draft : selectedProvider;
  const filteredProviders = useMemo(
    () =>
      providers.filter((provider) =>
        `${provider.id} ${provider.description}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [providers, searchTerm],
  );
  const isNaturalProvider = shownProvider?.type === "NATURAL";

  function selectProvider(recordId) {
    setSelectedId(recordId);
    setEditing(false);
    setDraft(null);
    setNestedProductId(null);
    setProviderProducts([]);
    if (activeTab === "products") loadProviderProducts(recordId);
  }
  function handleAdd() {
    setSelectedId(null);
    setDraft({ ...emptyProvider });
    setEditing(true);
    setActiveTab("main");
    setError("");
  }
  function handleEdit() {
    if (selectedProvider) {
      setDraft({ ...selectedProvider });
      setEditing(true);
      setError("");
    }
  }
  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  async function handleSave() {
    setError("");
    const body = {
      name: draft.name.trim(),
      taxId: draft.taxId.trim() || undefined,
      providerType: draft.supplierType,
      description: draft.description.trim() || undefined,
      address: draft.address1.trim() || undefined,
      country: draft.country.trim() || undefined,
      city: draft.city.trim() || undefined,
      phonePrimary: draft.phones.trim() || undefined,
      phoneSecondary: draft.mobile.trim() || undefined,
      email: draft.email.trim() || undefined,
      legalRepresentative: draft.representative.trim() || undefined,
    };
    try {
      const saved = selectedId
        ? await apiClient.patch(`/proveedores/${selectedId}`, body)
        : await apiClient.post("/proveedores", body);
      const normalized = mapProvider(saved);
      setProviders((current) =>
        selectedId
          ? current.map((item) =>
              item.recordId === selectedId ? normalized : item,
            )
          : [...current, normalized],
      );
      setSelectedId(normalized.recordId);
      setDraft(null);
      setEditing(false);
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
    }
  }
  async function handleDelete() {
    if (!selectedId || !window.confirm("¿Deseas desactivar este proveedor?"))
      return;
    try {
      await apiClient.delete(`/proveedores/${selectedId}`);
      setProviders((current) =>
        current.map((item) =>
          item.recordId === selectedId ? { ...item, active: false } : item,
        ),
      );
      setEditing(false);
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
    }
  }
  function moveSelection(offset) {
    const index = filteredProviders.findIndex(
      (provider) => provider.recordId === selectedId,
    );
    const next = filteredProviders[index + offset];
    if (next) selectProvider(next.recordId);
  }
  async function loadProviderProducts(recordId) {
    try {
      const items = await apiClient.getAllPages("/productos", {
        providerId: recordId,
      });
      setProviderProducts(items);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="provider-window-host" style={windowStyle}>
      <section
        className={`provider-window ${isDragging ? "is-dragging" : ""}`}
        aria-label="Ventana de proveedores"
      >
        <header
          className="provider-titlebar drag-handle"
          onPointerDown={handlePointerDown}
          title="Arrastre para mover la ventana"
        >
          <div className="provider-title-mark">
            <BuildingGlyph />
          </div>
          <strong>PROVEEDORES</strong>
          <button
            type="button"
            className="provider-close"
            aria-label="Cerrar proveedores"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="provider-content">
          <aside className="provider-list-panel">
            <div className="provider-list-toolbar">
              <label htmlFor="provider-search">Buscar</label>
              <div className="provider-search-field">
                <Search size={15} />
                <input
                  id="provider-search"
                  aria-label="Buscar proveedor"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="search-options"
                aria-label="Opciones de búsqueda"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <div
              className="provider-table"
              role="table"
              aria-label="Listado de proveedores"
            >
              <div className="provider-table-head" role="row">
                <span>ID Fiscal</span>
                <span>Descripción</span>
              </div>
              {filteredProviders.map((provider) => (
                <button
                  className={
                    provider.recordId === selectedId
                      ? "provider-table-row is-selected"
                      : "provider-table-row"
                  }
                  type="button"
                  role="row"
                  key={provider.id}
                  onClick={() => selectProvider(provider.recordId)}
                >
                  <span>{provider.id}</span>
                  <span>{provider.description}</span>
                </button>
              ))}
              <div className="provider-empty-rows" aria-hidden="true">
                {Array.from({
                  length: Math.max(0, 8 - filteredProviders.length),
                }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
            </div>
            <div className="provider-list-scroll" aria-hidden="true">
              <span>‹</span>
              <span className="scroll-track">
                <i />
              </span>
              <span>›</span>
            </div>
          </aside>

          <div className="provider-detail-panel">
            <div
              className={`provider-summary-form ${isNaturalProvider ? "natural-summary" : ""}`}
            >
              <SummaryField
                label="Id. Fiscal"
                value={shownProvider?.id ?? ""}
              />
              {isNaturalProvider ? (
                <>
                  <SummaryField
                    label="Nombre"
                    value={shownProvider?.firstName}
                  />
                  <SummaryField
                    label="2º Nombre"
                    value={shownProvider?.middleName}
                  />
                  <SummaryField
                    label="Apellido"
                    value={shownProvider?.lastName}
                  />
                  <SummaryField
                    label="2º Apellido"
                    value={shownProvider?.secondLastName}
                  />
                </>
              ) : (
                <SummaryField
                  label="Descripción"
                  value={shownProvider?.description}
                />
              )}
              <div className="summary-field summary-type">
                <label>Tipo</label>
                <div className="select-like">
                  <span>{shownProvider?.type}</span>
                  <ChevronDown size={14} />
                </div>
              </div>
            </div>

            <div className="provider-tabs primary-tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    className={
                      activeTab === tab.id
                        ? "provider-tab is-active"
                        : "provider-tab"
                    }
                    type="button"
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === "products")
                        loadProviderProducts(selectedId);
                    }}
                  >
                    <Icon size={15} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="provider-tabs secondary-tabs">
              <button
                className={
                  activeTab === "main" ||
                  tabs.every((tab) => activeTab !== tab.id)
                    ? "provider-tab is-active"
                    : "provider-tab"
                }
                type="button"
                onClick={() => setActiveTab("main")}
              >
                Datos principales
              </button>
              <button
                className={
                  activeTab === "financial"
                    ? "provider-tab is-active"
                    : "provider-tab"
                }
                type="button"
                onClick={() => setActiveTab("financial")}
              >
                Datos financieros
              </button>
            </div>

            <ProviderDetails
              activeTab={activeTab}
              provider={shownProvider}
              editing={editing}
              onChange={updateDraft}
              loading={loading}
              providerProducts={providerProducts}
              onOpenProduct={setNestedProductId}
            />
          </div>
        </div>

        {error && (
          <div className="window-error" role="alert">
            {error}
          </div>
        )}
        <footer className="provider-window-footer">
          <div className="provider-crud-actions">
            {editing ? (
              <button type="button" onClick={handleSave}>
                <Check size={14} /> Guardar
              </button>
            ) : (
              <button type="button" onClick={handleAdd}>
                <Plus size={14} /> Agregar
              </button>
            )}
            {!editing && (
              <button
                type="button"
                onClick={handleEdit}
                disabled={!selectedProvider}
              >
                <Edit3 size={14} /> Modificar
              </button>
            )}
            {!editing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={!selectedProvider}
              >
                <Trash2 size={14} /> Borrar
              </button>
            )}
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(null);
                }}
              >
                <CircleX size={14} /> Cancelar
              </button>
            )}
          </div>
          <div className="provider-navigation-actions">
            <button
              type="button"
              className="muted-action"
              onClick={() => moveSelection(-1)}
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              type="button"
              className="muted-action"
              onClick={() => moveSelection(1)}
            >
              Próximo <ChevronRight size={14} />
            </button>
            <button type="button" className="exit-action" onClick={onClose}>
              <CircleX size={14} /> Salir
            </button>
          </div>
        </footer>
      </section>
      {nestedProductId && (
        <div className="subwindow-layer">
          <ProductsWindow
            initialProductId={nestedProductId}
            onClose={() => setNestedProductId(null)}
            onRequestLogin={onRequestLogin}
          />
        </div>
      )}
    </div>
  );
}

function ProviderDetails({
  activeTab,
  provider,
  editing,
  onChange,
  loading,
  providerProducts,
  onOpenProduct,
}) {
  if (!provider)
    return (
      <div className="provider-tab-panel empty-provider-panel">
        <strong>
          {loading ? "Cargando proveedores…" : "Selecciona un proveedor"}
        </strong>
      </div>
    );
  if (activeTab === "statistics") {
    return (
      <div className="provider-tab-panel data-panel">
        <ProviderDataTable
          caption="Compras acumuladas por período"
          columns={[
            "PERIODO",
            "Nro. compras",
            "Compras contado",
            "Compras crédito",
            "Total compras",
          ]}
          rows={[
            [`Actual`, String(provider.purchaseCount ?? 0), "—", "—", "—"],
          ]}
        />
      </div>
    );
  }

  if (activeTab === "products") {
    return (
      <div className="provider-tab-panel data-panel">
        <ProviderDataTable
          caption={`Productos asociados a ${provider.description}`}
          columns={["Código", "Descripción", "Documento"]}
          rows={providerProducts.map((row) => [
            row.barcodes?.find((barcode) => barcode.isPrimary)?.code ??
              String(row.id),
            row.name,
            row.primaryProvider?.taxId ?? "—",
          ])}
          rowKeys={providerProducts.map((row) => row.id)}
          onRowDoubleClick={(index) =>
            onOpenProduct?.(providerProducts[index]?.id)
          }
        />
      </div>
    );
  }

  if (activeTab === "financial") {
    return (
      <div className="provider-tab-panel financial-panel">
        <div className="financial-form-grid">
          <DetailField
            label="Tipo retención"
            value={provider.withholdingType}
            select
            wide
            editing={editing}
            onChange={(value) => onChange("withholdingType", value)}
          />
          <div className="detail-field">
            <label>Tiene retención ISLR</label>
            <span className="checkbox-value">
              <span
                className={
                  provider.hasIslrWithholding
                    ? "fake-checkbox"
                    : "fake-checkbox is-empty"
                }
              >
                {provider.hasIslrWithholding && <Check size={12} />}
              </span>
              {provider.hasIslrWithholding ? "Sí" : "No"}
            </span>
          </div>
          <DetailField
            label="Días de crédito"
            value={provider.creditDays}
            editing={editing}
            onChange={(value) => onChange("creditDays", value)}
          />
          <DetailField
            label="Observaciones"
            value={provider.observations}
            wide
            editing={editing}
            onChange={(value) => onChange("observations", value)}
          />
        </div>
        <div className="financial-metrics">
          <MetricField
            label="Saldo pendiente"
            value={provider.pendingBalance}
            accent
          />
          <MetricField label="Adelantos" value={provider.advances} accent />
          <MetricField label="Última compra" value={provider.lastPurchase} />
          <MetricField label="Último pago" value={provider.lastPayment} />
          <MetricField label="Máximo crédito" value={provider.maxCredit} />
          <MetricField
            label="Días prom. pago"
            value={provider.averagePaymentDays}
          />
          <MetricField label="Retenciones" value={provider.withholdings} />
        </div>
      </div>
    );
  }

  return (
    <div className="provider-main-details">
      <DetailField
        label="Tipo proveedor"
        value={provider.supplierType}
        select
        editing={editing}
        onChange={(value) => onChange("supplierType", value)}
      />
      <div className="detail-field active-field">
        <label>Activo</label>
        <span className="checkbox-value">
          <span
            className={
              provider.active ? "fake-checkbox" : "fake-checkbox is-empty"
            }
          >
            {provider.active && <Check size={12} />}
          </span>{" "}
          {provider.active ? "Sí" : "No"}
        </span>
      </div>
      <DetailField
        label="Nombre / razón social"
        value={provider.name}
        wide
        editing={editing}
        onChange={(value) => onChange("name", value)}
      />
      <DetailField
        label="Descripción"
        value={provider.description}
        wide
        editing={editing}
        onChange={(value) => onChange("description", value)}
      />
      <DetailField
        label="Id. fiscal"
        value={provider.taxId}
        editing={editing}
        onChange={(value) => onChange("taxId", value)}
      />
      <DetailField
        label="Clase"
        value={provider.className}
        editing={editing}
        onChange={(value) => onChange("className", value)}
      />
      <DetailField
        label="Representante"
        value={provider.representative}
        wide
        editing={editing}
        onChange={(value) => onChange("representative", value)}
      />
      <DetailField
        label="Dirección 1"
        value={provider.address1}
        wide
        editing={editing}
        onChange={(value) => onChange("address1", value)}
      />
      <DetailField
        label="Dirección 2"
        value={provider.address2}
        wide
        editing={editing}
        onChange={(value) => onChange("address2", value)}
      />
      <DetailField
        label="País"
        value={provider.country}
        select
        editing={editing}
        onChange={(value) => onChange("country", value)}
      />
      <DetailField
        label="Departamento"
        value={provider.department}
        select
        editing={editing}
        onChange={(value) => onChange("department", value)}
      />
      <DetailField
        label="Ciudad"
        value={provider.city}
        select
        editing={editing}
        onChange={(value) => onChange("city", value)}
      />
      <DetailField
        label="Municipio"
        value={provider.municipality}
        select
        wide
        editing={editing}
        onChange={(value) => onChange("municipality", value)}
      />
      <DetailField
        label="Zona postal"
        value={provider.postalCode}
        editing={editing}
        onChange={(value) => onChange("postalCode", value)}
      />
      <DetailField
        label="Teléfonos"
        value={provider.phones}
        wide
        editing={editing}
        onChange={(value) => onChange("phones", value)}
      />
      <DetailField
        label="Móvil celular"
        value={provider.mobile}
        editing={editing}
        onChange={(value) => onChange("mobile", value)}
      />
      <DetailField
        label="Fax"
        value={provider.fax}
        editing={editing}
        onChange={(value) => onChange("fax", value)}
      />
      <DetailField
        label="e-mail"
        value={provider.email}
        wide
        editing={editing}
        onChange={(value) => onChange("email", value)}
      />
      <DetailField label="Fecha inicio" value={provider.startDate} date />
    </div>
  );
}

function ProviderDataTable({
  caption,
  columns,
  rows,
  rowKeys,
  onRowDoubleClick,
}) {
  return (
    <div className="provider-data-table-wrap">
      <div className="provider-table-caption">{caption}</div>
      <table className="provider-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowKeys?.[rowIndex] ?? `${row[0]}-${rowIndex}`}
              onDoubleClick={() => onRowDoubleClick?.(rowIndex)}
              title={
                onRowDoubleClick
                  ? "Doble clic para abrir el producto"
                  : undefined
              }
            >
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryField({ label, value }) {
  return (
    <div className="summary-field">
      <label>{label}</label>
      <input value={value} readOnly />
    </div>
  );
}

function DetailField({
  label,
  value,
  select = false,
  wide = false,
  date = false,
  editing = false,
  onChange,
}) {
  return (
    <div className={`detail-field ${wide ? "wide-field" : ""}`}>
      <label>{label}</label>
      {editing ? (
        <input
          className="detail-input"
          value={value ?? ""}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <div
          className={
            select || date ? "detail-control select-like" : "detail-control"
          }
        >
          <span>{value || " "}</span>
          {select && <ChevronDown size={13} />}
          {date && <CalendarDays size={13} />}
        </div>
      )}
    </div>
  );
}

function MetricField({ label, value, accent = false }) {
  return (
    <div className="metric-field">
      <label>{label}</label>
      <div className={accent ? "metric-control is-accent" : "metric-control"}>
        {value}
      </div>
    </div>
  );
}

function BuildingGlyph() {
  return (
    <span className="building-glyph">
      <span />
      <span />
      <span />
    </span>
  );
}
