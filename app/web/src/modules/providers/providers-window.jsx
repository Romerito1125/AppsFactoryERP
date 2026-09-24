import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  LoaderCircle,
  Package,
  Plus,
  Search,
  Sigma,
  Trash2,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { SearchOptionsMenu } from "@/components/desktop/search-options-menu";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";
import { ProductsWindow } from "@/modules/products/products-window";

const tabs = [
  { id: "statistics", label: "Estadística", icon: Sigma },
  { id: "products", label: "Productos", icon: Package },
];
const providerTypeOptions = [
  { value: "JURÍDICO", label: "Jurídico" },
  { value: "NATURAL", label: "Natural" },
];

const emptyProvider = {
  id: "",
  recordId: null,
  name: "",
  description: "",
  type: "JURÍDICO",
  supplierType: "JURÍDICO",
  taxId: "",
  representative: "",
  address1: "",
  address2: "",
  country: "",
  department: "",
  city: "",
  postalCode: "",
  phones: "",
  mobile: "",
  email: "",
  active: true,
  withholdingType: "",
  withholdingRate: "",
  withholdingMinimumBase: "",
  hasIslrWithholding: false,
  isSelfWithholding: false,
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
  const providerType = normalizeProviderType(provider.providerType);
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
    type: providerType,
    supplierType: providerType,
    taxId: provider.taxId || "",
    representative: provider.legalRepresentative || "",
    address1: provider.address || "",
    address2: provider.address2 || "",
    department: provider.department || "",
    city: provider.city || "",
    postalCode: provider.postalCode || "",
    phones: provider.phonePrimary || "",
    mobile: provider.phoneSecondary || "",
    email: provider.email || "",
    active: provider.isActive !== false,
    withholdingType: provider.withholdingType || "",
    withholdingRate:
      provider.withholdingRate === null || provider.withholdingRate === undefined
        ? ""
        : String(provider.withholdingRate),
    withholdingMinimumBase:
      provider.withholdingMinimumBase === null ||
      provider.withholdingMinimumBase === undefined
        ? ""
        : String(provider.withholdingMinimumBase),
    isSelfWithholding: Boolean(provider.isSelfWithholding),
    creditDays:
      provider.creditDays === null || provider.creditDays === undefined
        ? ""
        : String(provider.creditDays),
    observations: provider.observations || "",
    purchaseCount: provider._count?.purchaseOrders ?? 0,
    productCount: provider._count?.productLinks ?? 0,
  };
}

function normalizeProviderType(value) {
  return String(value ?? "").toUpperCase().includes("NATURAL")
    ? "NATURAL"
    : "JURÍDICO";
}

export function ProvidersWindow({ onClose, onRequestLogin, canAccess }) {
  const [providers, setProviders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [activeTab, setActiveTab] = useState("main");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
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
        if (cancelled) return;
        const nextProviders = items.map(mapProvider);
        setProviders(nextProviders);
        setSelectedId(nextProviders[0]?.recordId ?? null);
        if (nextProviders[0]) {
          setDraft({ ...nextProviders[0] });
        } else {
          setDraft({ ...emptyProvider });
        }
        setEditing(true);
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
    providers.find((provider) => provider.recordId === selectedId) ?? null;
  const canEdit = canAccess?.("PROVIDERS_EDIT") ?? true;
  const shownProvider = editing ? draft : selectedProvider;
  const hasChanges = useMemo(
    () => hasProviderDraftChanges(draft, selectedProvider),
    [draft, selectedProvider],
  );
  const filteredProviders = useMemo(
    () =>
      providers.filter((provider) =>
        (statusFilter === "todos" ||
          (statusFilter === "activos" ? provider.active : !provider.active)) &&
        `${provider.id} ${provider.description}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [providers, searchTerm, statusFilter],
  );
  const isNaturalProvider = shownProvider?.type === "NATURAL";
  const selectedIndex = filteredProviders.findIndex(
    (provider) => provider.recordId === selectedId,
  );
  const canMovePrevious = selectedIndex > 0;
  const canMoveNext =
    selectedIndex >= 0 && selectedIndex < filteredProviders.length - 1;

  function selectProvider(recordId) {
    setSelectedId(recordId);
    const provider = providers.find((item) => item.recordId === recordId);
    setDraft(provider ? { ...provider } : null);
    setEditing(Boolean(provider));
    setFieldErrors({});
    setNestedProductId(null);
    setProviderProducts([]);
    if (activeTab === "products") loadProviderProducts(recordId);
  }
  function handleAdd() {
    if (!canEdit) return;
    setSelectedId(null);
    setDraft({ ...emptyProvider });
    setEditing(true);
    setActiveTab("main");
    setFieldErrors({});
    setError("");
  }
  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  async function handleSave() {
    if (!canEdit || !draft || !hasChanges || saving || deleting) return;
    setError("");
    setFieldErrors({});
    const validationErrors = validateProviderDraft(draft);
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError("Corrige los campos marcados antes de guardar.");
      return;
    }
    setSaving(true);
    const body = {
      name: draft.name.trim(),
      taxId: draft.taxId.trim() || undefined,
      providerType: draft.supplierType,
      description: draft.description.trim() || undefined,
      address: draft.address1.trim() || undefined,
      address2: draft.address2.trim() || undefined,
      country: draft.country.trim() || undefined,
      city: draft.city.trim() || undefined,
      department: draft.department.trim() || undefined,
      postalCode: draft.postalCode.trim() || undefined,
      phonePrimary: draft.phones.trim() || undefined,
      phoneSecondary: draft.mobile.trim() || undefined,
      email: draft.email.trim() || undefined,
      legalRepresentative: draft.representative.trim() || undefined,
      withholdingType: draft.withholdingType.trim() || undefined,
      withholdingRate:
        draft.withholdingRate === "" ? undefined : Number(draft.withholdingRate),
      withholdingMinimumBase:
        draft.withholdingMinimumBase === ""
          ? undefined
          : Number(draft.withholdingMinimumBase),
      creditDays:
        draft.creditDays === "" ? undefined : Number(draft.creditDays),
      observations: draft.observations.trim() || undefined,
      isActive: Boolean(draft.active),
      hasIslrWithholding: Boolean(draft.hasIslrWithholding),
      isSelfWithholding: Boolean(draft.isSelfWithholding),
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
      setDraft({ ...normalized });
      setEditing(true);
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete() {
    if (!canEdit || deleting || saving) return;
    if (
      selectedId === null ||
      !window.confirm(
        "¿Deseas eliminar definitivamente este proveedor? Esta acción no se puede deshacer.",
      )
    )
      return;
    setDeleting(true);
    setError("");
    try {
      await apiClient.delete(`/proveedores/${selectedId}`);
      const remaining = providers.filter(
        (item) => item.recordId !== selectedId,
      );
      setProviders(remaining);
      const nextProvider = remaining[0] ?? null;
      setSelectedId(nextProvider?.recordId ?? null);
      setDraft(nextProvider ? { ...nextProvider } : { ...emptyProvider });
      setEditing(true);
      setFieldErrors({});
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin?.();
    } finally {
      setDeleting(false);
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
    if (recordId === null || recordId === undefined) {
      setProviderProducts([]);
      return;
    }
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
              <SearchOptionsMenu value={statusFilter} onChange={setStatusFilter} />
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
              <EditableSummaryField
                label="Id. Fiscal"
                value={shownProvider?.taxId ?? ""}
                editing={editing && canEdit}
                onChange={(value) => updateDraft("taxId", value)}
                error={fieldErrors?.taxId}
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
                <EditableSummaryField
                  label="Descripción"
                  value={shownProvider?.description ?? ""}
                  editing={editing && canEdit}
                  onChange={(value) => updateDraft("description", value)}
                />
              )}
              <div className="summary-field summary-type">
                <label>Tipo</label>
                {editing && canEdit ? (
                  <select
                    className="detail-input"
                    value={shownProvider?.type ?? ""}
                    onChange={(event) => {
                      updateDraft("type", event.target.value);
                      updateDraft("supplierType", event.target.value);
                    }}
                  >
                    {providerTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={shownProvider?.type ?? ""} readOnly />
                )}
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
              editing={editing && canEdit}
              onChange={updateDraft}
              loading={loading}
              fieldErrors={fieldErrors}
              providerProducts={providerProducts}
              onOpenProduct={setNestedProductId}
            />
            {editing && hasChanges && activeTab !== "statistics" && activeTab !== "products" && (
              <div className="provider-change-actions" role="group" aria-label="Acciones de cambios">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || deleting || !canEdit}
                >
                  {saving ? (
                    <LoaderCircle className="button-spinner" size={14} />
                  ) : (
                    <Check size={14} />
                  )}
                  {saving ? "Guardando…" : selectedId !== null ? "Guardar cambios" : "Crear proveedor"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFieldErrors({});
                    if (selectedProvider) setDraft({ ...selectedProvider });
                    else {
                      setSelectedId(null);
                      setDraft({ ...emptyProvider });
                      setEditing(true);
                    }
                    setError("");
                  }}
                  disabled={saving || deleting}
                >
                  <CircleX size={14} /> Cancelar
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <TransientMessage
            className="window-error"
            role="alert"
            onDismiss={() => setError("")}
          >
            {error}
          </TransientMessage>
        )}
        <footer className="provider-window-footer">
          <div className="provider-crud-actions">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canEdit || saving || deleting}
            >
              <Plus size={14} /> Agregar
            </button>
            {selectedProvider && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canEdit || deleting || saving}
              >
                {deleting ? (
                  <LoaderCircle className="button-spinner" size={14} />
                ) : (
                  <Trash2 size={14} />
                )}
                {deleting ? "Eliminando…" : "Borrar"}
              </button>
            )}
          </div>
          <div className="provider-navigation-actions">
            <button
              type="button"
              className="muted-action"
              disabled={!canMovePrevious || editing && hasChanges || saving || deleting}
              onClick={() => moveSelection(-1)}
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              type="button"
              className="muted-action"
              disabled={!canMoveNext || editing && hasChanges || saving || deleting}
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
  fieldErrors,
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
            error={fieldErrors?.withholdingType}
          />
          <DetailField
            label="Porcentaje retención"
            value={provider.withholdingRate}
            editing={editing}
            onChange={(value) => onChange("withholdingRate", value)}
            error={fieldErrors?.withholdingRate}
          />
          <DetailField
            label="Base mínima retención"
            value={provider.withholdingMinimumBase}
            editing={editing}
            onChange={(value) => onChange("withholdingMinimumBase", value)}
            error={fieldErrors?.withholdingMinimumBase}
          />
          <div className="detail-field">
            <label>Tiene retención ISLR</label>
            {editing ? (
              <input
                className="detail-checkbox-input"
                type="checkbox"
                checked={Boolean(provider.hasIslrWithholding)}
                onChange={(event) =>
                  onChange("hasIslrWithholding", event.target.checked)
                }
              />
            ) : (
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
            )}
          </div>
          <div className="detail-field">
            <label>Proveedor autorretenedor</label>
            {editing ? (
              <input
                className="detail-checkbox-input"
                type="checkbox"
                checked={Boolean(provider.isSelfWithholding)}
                onChange={(event) =>
                  onChange("isSelfWithholding", event.target.checked)
                }
              />
            ) : (
              <span className="checkbox-value">
                <span
                  className={
                    provider.isSelfWithholding
                      ? "fake-checkbox"
                      : "fake-checkbox is-empty"
                  }
                >
                  {provider.isSelfWithholding && <Check size={12} />}
                </span>
                {provider.isSelfWithholding ? "Sí" : "No"}
              </span>
            )}
          </div>
          <DetailField
            label="Días de crédito"
            value={provider.creditDays}
            editing={editing}
            onChange={(value) => onChange("creditDays", value)}
            error={fieldErrors?.creditDays}
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
        options={providerTypeOptions}
        onChange={(value) => {
          onChange("supplierType", value);
          onChange("type", value);
        }}
      />
      <BooleanField
        label="Activo"
        checked={provider.active}
        editing={editing}
        onChange={(value) => onChange("active", value)}
      />
      <DetailField
        label="Nombre / razón social"
        value={provider.name}
        wide
        editing={editing}
        onChange={(value) => onChange("name", value)}
        error={fieldErrors?.name}
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
        error={fieldErrors?.taxId}
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
        label="e-mail"
        value={provider.email}
        wide
        editing={editing}
        onChange={(value) => onChange("email", value)}
        error={fieldErrors?.email}
      />
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
      <input value={value ?? ""} readOnly />
    </div>
  );
}

function EditableSummaryField({
  label,
  value,
  editing = false,
  onChange,
  error = "",
}) {
  return (
    <div className={`summary-field ${error ? "has-error" : ""}`}>
      <label>{label}</label>
      <input
        className={error ? "is-invalid" : ""}
        value={value ?? ""}
        readOnly={!editing}
        aria-invalid={Boolean(error)}
        title={error || undefined}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function DetailField({
  label,
  value,
  select = false,
  options = [],
  wide = false,
  date = false,
  editing = false,
  onChange,
  error = "",
}) {
  return (
    <div
      className={`detail-field ${wide ? "wide-field" : ""} ${
        error ? "has-error" : ""
      }`}
    >
      <label>{label}</label>
      {editing ? (
        select && options.length ? (
          <select
            className={`detail-input ${error ? "is-invalid" : ""}`}
            value={value ?? ""}
            aria-invalid={Boolean(error)}
            title={error || undefined}
            onChange={(event) => onChange?.(event.target.value)}
          >
            {options.map((option) => {
              const optionValue =
                typeof option === "object" ? option.value : option;
              const optionLabel =
                typeof option === "object" ? option.label : option;
              return (
                <option key={optionValue} value={optionValue}>
                  {optionLabel}
                </option>
              );
            })}
          </select>
        ) : (
          <input
            className={`detail-input ${error ? "is-invalid" : ""}`}
            value={value ?? ""}
            aria-invalid={Boolean(error)}
            title={error || undefined}
            onChange={(event) => onChange?.(event.target.value)}
          />
        )
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
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function BooleanField({ label, checked, editing, onChange }) {
  return (
    <div className="detail-field active-field">
      <label>{label}</label>
      {editing ? (
        <input
          className="detail-checkbox-input"
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : (
        <span className="checkbox-value">
          <span className={checked ? "fake-checkbox" : "fake-checkbox is-empty"}>
            {checked && <Check size={12} />}
          </span>
          {checked ? "Sí" : "No"}
        </span>
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

function hasProviderDraftChanges(draft, provider) {
  if (!draft) return false;
  if (!provider) return true;
  const fields = [
    "name",
    "description",
    "supplierType",
    "taxId",
    "representative",
    "address1",
    "address2",
    "country",
    "department",
    "city",
    "postalCode",
    "phones",
    "mobile",
    "email",
    "withholdingType",
    "withholdingRate",
    "withholdingMinimumBase",
    "creditDays",
    "observations",
    "active",
    "hasIslrWithholding",
    "isSelfWithholding",
  ];
  return fields.some(
    (field) => String(draft[field] ?? "") !== String(provider[field] ?? ""),
  );
}

function validateProviderDraft(provider) {
  const errors = {};
  if (!provider.name?.trim()) errors.name = "El nombre es obligatorio.";
  else if (provider.name.trim().length < 2)
    errors.name = "El nombre debe tener al menos 2 caracteres.";
  if (provider.taxId?.trim() && provider.taxId.trim().length < 3)
    errors.taxId = "El ID fiscal debe tener al menos 3 caracteres.";
  if (provider.email?.trim() && !/^\S+@\S+\.\S+$/.test(provider.email.trim()))
    errors.email = "Ingresa un correo válido.";
  if (
    provider.creditDays !== "" &&
    (!Number.isInteger(Number(provider.creditDays)) ||
      Number(provider.creditDays) < 0)
  )
    errors.creditDays = "Los días de crédito deben ser un entero mayor o igual a cero.";
  if (
    provider.withholdingRate !== "" &&
    (!Number.isFinite(Number(provider.withholdingRate)) ||
      Number(provider.withholdingRate) < 0 ||
      Number(provider.withholdingRate) > 100)
  )
    errors.withholdingRate = "El porcentaje debe estar entre 0 y 100.";
  if (
    provider.withholdingMinimumBase !== "" &&
    (!Number.isFinite(Number(provider.withholdingMinimumBase)) ||
      Number(provider.withholdingMinimumBase) < 0)
  )
    errors.withholdingMinimumBase = "La base mínima no puede ser negativa.";
  return errors;
}
