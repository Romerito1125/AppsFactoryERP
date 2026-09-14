import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { SearchOptionsMenu } from "@/components/desktop/search-options-menu";
import { apiClient } from "@/lib/api-client";

const emptyClient = {
  identification: "",
  firstName: "",
  lastName: "",
  phone: "",
  address: "",
  clientType: "MINORISTA",
  email: "",
  password: "",
  referralCode: "",
  referralLevel: 0,
  isActive: true,
  user: null,
};

export function ClientsWindow({ onClose, onRequestLogin, canAccess }) {
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [activeTab, setActiveTab] = useState("main");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyClient);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  async function loadClients(preferredSelectedId = selectedId) {
    setLoading(true);
    setError("");
    try {
      const result = await apiClient.getAllPages("/clientes", {
        estado: "todos",
      });
      const nextSelectedId = result.some(
        (client) => client.id === preferredSelectedId,
      )
        ? preferredSelectedId
        : result[0]?.id ?? null;
      const nextSelectedClient = result.find(
        (client) => client.id === nextSelectedId,
      );
      setClients(result);
      setSelectedId(nextSelectedId);
      setDraft(nextSelectedClient ? toDraft(nextSelectedClient) : { ...emptyClient });
      setEditing(true);
      setFieldErrors({});
      if (!nextSelectedClient) {
        setReferrals([]);
        setActiveTab("main");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getAllPages("/clientes", { estado: "todos" })
      .then((result) => {
        if (cancelled) return;
        setClients(result);
        const firstClient = result[0];
        setSelectedId(firstClient?.id ?? null);
        if (firstClient) {
          setDraft(toDraft(firstClient));
        } else {
          setDraft({ ...emptyClient });
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

  const filteredClients = useMemo(
    () =>
      clients.filter((client) =>
        (statusFilter === "todos" ||
          (statusFilter === "activos" ? client.isActive : !client.isActive)) &&
        `${client.identification} ${client.firstName} ${client.lastName} ${client.phone ?? ""}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [clients, searchTerm, statusFilter],
  );
  const selectedClient =
    clients.find((client) => client.id === selectedId) ?? null;
  const canEdit = canAccess?.("CLIENTS_EDIT") ?? true;
  const hasChanges = useMemo(
    () => hasClientDraftChanges(draft, selectedClient),
    [draft, selectedClient],
  );
  const selectedIndex = filteredClients.findIndex(
    (client) => client.id === selectedId,
  );
  const canMovePrevious = selectedIndex > 0;
  const canMoveNext =
    selectedIndex >= 0 && selectedIndex < filteredClients.length - 1;

  function selectClient(id) {
    setSelectedId(id);
    setEditing(true);
    setReferrals([]);
    setFieldErrors({});
    setError("");
    const client = clients.find((item) => item.id === id);
    if (client) setDraft(toDraft(client));
    if (activeTab === "referrals") loadReferrals(id);
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

  function handleAdd() {
    if (!canEdit) return;
    setSelectedId(null);
    setDraft({ ...emptyClient });
    setEditing(true);
    setActiveTab("main");
    setFieldErrors({});
    setError("");
  }

  async function handleSave() {
    if (!canEdit || !hasChanges) return;
    setError("");
    setFieldErrors({});
    const validationErrors = validateClientDraft(
      draft,
      Boolean(selectedClient?.user),
    );
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError("Corrige los campos marcados antes de guardar.");
      return;
    }

    setSaving(true);
    const body = {
      identification: draft.identification.trim(),
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      phone: draft.phone.trim() || undefined,
      address: draft.address.trim() || undefined,
      clientType: draft.clientType,
      email: draft.email.trim() || undefined,
      password: draft.password || undefined,
      isActive: Boolean(draft.isActive),
    };
    try {
      const saved = selectedId
        ? await apiClient.patch(`/clientes/${selectedId}`, body)
        : await apiClient.post("/clientes", body);
      await loadClients(selectedId);
      setSelectedId(saved.id);
      setDraft(toDraft(saved));
      setEditing(true);
    } catch (requestError) {
      setError(requestError.message);
      setFieldErrors(getClientFieldErrors(requestError));
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
    } finally {
      setSaving(false);
    }
  }

  function cancelChanges() {
    setFieldErrors({});
    if (selectedClient) {
      setDraft(toDraft(selectedClient));
      setEditing(true);
    } else {
      setSelectedId(null);
      setDraft({ ...emptyClient });
      setEditing(true);
      setActiveTab("main");
    }
    setError("");
  }

  async function handleDelete() {
    if (!canEdit) return;
    if (
      !selectedId ||
      !window.confirm(
        "¿Deseas eliminar definitivamente este cliente? Esta acción no se puede deshacer.",
      )
    )
      return;
    setError("");
    setDeleting(true);
    try {
      await apiClient.delete(`/clientes/${selectedId}`);
      await loadClients(null);
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
    } finally {
      setDeleting(false);
    }
  }

  async function loadReferrals(clientId) {
    if (!clientId) return;
    try {
      setReferrals(await apiClient.get(`/clientes/${clientId}/referidos`));
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
    }
  }

  async function showReferrals() {
    setActiveTab("referrals");
    await loadReferrals(selectedId);
  }

  function moveSelection(offset) {
    const index = filteredClients.findIndex(
      (client) => client.id === selectedId,
    );
    const next = filteredClients[index + offset];
    if (next) selectClient(next.id);
  }

  return (
    <section
      className={`provider-window client-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Ventana de clientes"
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle client-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <UsersRound size={14} />
        </div>
        <strong>CLIENTES</strong>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar clientes"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content">
        <aside className="provider-list-panel">
          <div className="provider-list-toolbar">
            <label htmlFor="client-search">Buscar</label>
            <div className="provider-search-field">
              <Search size={15} />
              <input
                id="client-search"
                aria-label="Buscar cliente"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <SearchOptionsMenu value={statusFilter} onChange={setStatusFilter} />
          </div>
          <div
            className="provider-table client-list-table"
            role="table"
            aria-label="Listado de clientes"
          >
            <div className="provider-table-head" role="row">
              <span>Identificación</span>
              <span>Descripción</span>
            </div>
            {filteredClients.map((client) => (
              <button
                className={
                  client.id === selectedId
                    ? "provider-table-row is-selected"
                    : "provider-table-row"
                }
                type="button"
                role="row"
                key={client.id}
                onClick={() => selectClient(client.id)}
              >
                <span>{client.identification}</span>
                <span>
                  {client.firstName} {client.lastName}
                </span>
              </button>
            ))}
            {loading && <div className="window-state">Cargando clientes…</div>}
            {!loading && !filteredClients.length && (
              <div className="window-state">No hay clientes para mostrar.</div>
            )}
            <div className="provider-empty-rows" aria-hidden="true">
              {Array.from({
                length: Math.max(0, 8 - filteredClients.length),
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
        <div className="provider-detail-panel client-detail-panel">
          <div className="provider-summary-form client-summary-form">
            <ClientSummaryField
              label="Identificación"
              value={draft.identification}
              editing={editing && canEdit}
              onChange={(value) => updateDraft("identification", value)}
              error={fieldErrors.identification}
            />
            <SummaryField
              label="Descripción"
              value={`${draft.firstName} ${draft.lastName}`}
            />
            <div className="summary-field summary-type">
              <label>Estado</label>
              {editing && canEdit ? (
                <select
                  className="detail-input"
                  value={draft.isActive ? "true" : "false"}
                  onChange={(event) =>
                    updateDraft("isActive", event.target.value === "true")
                  }
                >
                  <option value="true">ACTIVO</option>
                  <option value="false">INACTIVO</option>
                </select>
              ) : (
                <input value={draft.isActive ? "ACTIVO" : "INACTIVO"} readOnly />
              )}
            </div>
          </div>
          <div className="provider-tabs primary-tabs client-tabs">
            <button
              className={
                activeTab === "main" ? "provider-tab is-active" : "provider-tab"
              }
              type="button"
              onClick={() => setActiveTab("main")}
            >
              <UsersRound size={14} />
              Datos principales
            </button>
            <button
              className={
                activeTab === "referrals"
                  ? "provider-tab is-active"
                  : "provider-tab"
              }
              type="button"
              onClick={showReferrals}
            >
              <FileText size={14} />
              Referidos
            </button>
          </div>
          {activeTab === "referrals" ? (
            <ReferralsPanel referrals={referrals} />
          ) : (
            <ClientMain
              client={draft}
              editing={editing && canEdit}
              onChange={updateDraft}
              fieldErrors={fieldErrors}
            />
          )}
          {hasChanges && (
            <div className="client-change-actions" role="group" aria-label="Acciones de cambios">
              <button
                type="button"
                disabled={saving || deleting || !canEdit}
                onClick={handleSave}
              >
                {saving ? (
                  <LoaderCircle className="button-spinner" size={14} />
                ) : (
                  <Check size={14} />
                )}
                {saving ? "Guardando…" : selectedId ? "Guardar cambios" : "Crear cliente"}
              </button>
              <button
                type="button"
                onClick={cancelChanges}
                disabled={saving || deleting}
              >
                <CircleX size={14} /> Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="window-error" role="alert">
          {error}
        </div>
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
          {selectedClient && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedClient || !canEdit || deleting || saving}
            >
              {deleting ? (
                <LoaderCircle className="button-spinner" size={14} />
              ) : (
                <Trash2 size={14} />
              )}{" "}
              {deleting ? "Eliminando…" : "Borrar"}
            </button>
          )}
        </div>
        <div className="provider-navigation-actions">
          <button
            type="button"
            className="muted-action"
            disabled={!canMovePrevious}
            onClick={() => moveSelection(-1)}
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <button
            type="button"
            className="muted-action"
            disabled={!canMoveNext}
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
  );
}

function ClientMain({ client, editing, onChange, fieldErrors }) {
  return (
    <div className="provider-main-details client-main-details">
      <EditableField
        label="Tipo de cliente"
        value={client.clientType}
        editing={editing}
        onChange={(value) => onChange("clientType", value)}
        error={fieldErrors.clientType}
        select
        options={["MINORISTA", "MAYORISTA"]}
      />
      <BooleanField
        label="Activo"
        checked={client.isActive}
        editing={editing}
        onChange={(value) => onChange("isActive", value)}
      />
      <EditableField
        label="Nombres"
        value={client.firstName}
        editing={editing}
        onChange={(value) => onChange("firstName", value)}
        error={fieldErrors.firstName}
      />
      <EditableField
        label="Apellidos"
        value={client.lastName}
        editing={editing}
        onChange={(value) => onChange("lastName", value)}
        error={fieldErrors.lastName}
      />
      <EditableField
        label="Teléfono"
        value={client.phone}
        editing={editing}
        onChange={(value) => onChange("phone", value)}
        error={fieldErrors.phone}
      />
      <EditableField
        label="e-mail / usuario"
        value={client.email || client.user?.username || ""}
        editing={editing}
        onChange={(value) => onChange("email", value)}
        error={fieldErrors.email}
      />
      <EditableField
        label="Dirección"
        value={client.address}
        editing={editing}
        onChange={(value) => onChange("address", value)}
        error={fieldErrors.address}
        wide
      />
      <EditableField
        label="Contraseña"
        value={client.password}
        editing={editing}
        onChange={(value) => onChange("password", value)}
        error={fieldErrors.password}
        type="password"
        autoComplete="new-password"
        className="client-password-field"
        wide
      />
      <EditableField
        label="Código referido"
        value={client.referralCode}
        editing={false}
      />
      <EditableField
        label="Nivel referido"
        value={String(client.referralLevel ?? 0)}
        editing={false}
      />
      {editing && (
        <p className="form-hint">
          Para crear el acceso indica correo y contraseña. Deja la contraseña
          vacía para conservar la actual.
        </p>
      )}
    </div>
  );
}

function ReferralsPanel({ referrals }) {
  return (
    <div className="provider-tab-panel data-panel">
      <ProviderDataTable
        caption="Clientes referidos"
        columns={["Identificación", "Nombres", "Apellidos"]}
        rows={referrals.map((item) => [
          item.referredClient.identification,
          item.referredClient.firstName,
          item.referredClient.lastName,
        ])}
        empty="No hay referidos registrados."
      />
    </div>
  );
}

function ProviderDataTable({ caption, columns, rows, empty }) {
  return (
    <div className="provider-data-table-wrap">
      <div className="provider-table-caption">{caption}</div>
      {rows.length ? (
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
              <tr key={`${row[0]}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="table-empty">{empty}</div>
      )}
    </div>
  );
}

function EditableField({
  label,
  value,
  editing,
  onChange,
  select = false,
  options = [],
  wide = false,
  error = "",
  type = "text",
  autoComplete,
  className = "",
}) {
  return (
    <div
      className={`detail-field ${wide ? "wide-field" : ""} ${className} ${
        error ? "has-error" : ""
      }`}
    >
      <label>{label}</label>
      {editing ? (
        select ? (
          <select
            className={`detail-input ${error ? "is-invalid" : ""}`}
            value={value}
            aria-invalid={Boolean(error)}
            title={error || undefined}
            onChange={(event) => onChange(event.target.value)}
          >
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            className={`detail-input ${error ? "is-invalid" : ""}`}
            type={type}
            autoComplete={autoComplete}
            value={value ?? ""}
            aria-invalid={Boolean(error)}
            title={error || undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      ) : (
        <div className="detail-control">
          <span>{value || " "}</span>
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

function ClientSummaryField({ label, value, editing, onChange, error }) {
  return (
    <div className={`summary-field ${error ? "has-error" : ""}`}>
      <label>{label}</label>
      {editing ? (
        <input
          className={error ? "is-invalid" : ""}
          value={value ?? ""}
          aria-invalid={Boolean(error)}
          title={error || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input value={value ?? ""} readOnly />
      )}
      {error && <span className="field-error">{error}</span>}
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

function toDraft(client) {
  return {
    ...emptyClient,
    ...client,
    email: client.user?.username ?? client.email ?? "",
    password: "",
  };
}

function hasClientDraftChanges(draft, selectedClient) {
  const baseline = selectedClient
    ? {
        ...selectedClient,
        email: selectedClient.user?.username ?? selectedClient.email ?? "",
        password: "",
      }
    : emptyClient;

  return [
    "identification",
    "firstName",
    "lastName",
    "phone",
    "address",
    "clientType",
    "email",
    "password",
    "isActive",
  ].some((field) => (draft[field] ?? "") !== (baseline[field] ?? ""));
}

function validateClientDraft(client, hasExistingAccess = false) {
  const errors = {};
  const identification = client.identification.trim();
  const firstName = client.firstName.trim();
  const lastName = client.lastName.trim();
  const email = client.email.trim();
  const password = client.password ?? "";

  if (!identification) {
    errors.identification = "La identificación es obligatoria.";
  } else if (identification.length < 3) {
    errors.identification = "La identificación debe tener al menos 3 caracteres.";
  }
  if (!firstName) errors.firstName = "Los nombres son obligatorios.";
  if (!lastName) errors.lastName = "Los apellidos son obligatorios.";
  if (!client.clientType) errors.clientType = "Selecciona el tipo de cliente.";
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "Escribe un correo válido.";
  }
  if (!hasExistingAccess && email && !password) {
    errors.password = "Indica una contraseña para crear el acceso.";
  }
  if (password && !email) {
    errors.email = "Indica un correo para crear el acceso.";
  }
  if (password && password.length < 6) {
    errors.password = "La contraseña debe tener al menos 6 caracteres.";
  }

  return errors;
}

function getClientFieldErrors(requestError) {
  const message = requestError?.message ?? "";
  const errors = {};
  if (/identificaci[oó]n|identification/i.test(message)) {
    errors.identification = message;
  }
  if (/correo|email|e-mail/i.test(message)) errors.email = message;
  if (/contrase[nñ]a|password/i.test(message)) errors.password = message;
  if (/nombre|firstName/i.test(message)) errors.firstName = message;
  if (/apellido|lastName/i.test(message)) errors.lastName = message;
  if (/tipo de cliente|clientType/i.test(message)) errors.clientType = message;
  return errors;
}
