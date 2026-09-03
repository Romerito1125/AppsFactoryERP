import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Edit3,
  FileText,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { apiClient } from "@/lib/api-client";

const emptyClient = {
  identification: "",
  firstName: "",
  lastName: "",
  phone: "",
  address: "",
  clientType: "MINORISTA",
  email: "",
  referralCode: "",
  referralLevel: 0,
  isActive: true,
  user: null,
};

export function ClientsWindow({ onClose, onRequestLogin }) {
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("main");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyClient);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  async function loadClients() {
    setLoading(true);
    setError("");
    try {
      const result = await apiClient.getAllPages("/clientes", {
        estado: "todos",
      });
      setClients(result);
      setSelectedId((current) => current ?? result[0]?.id ?? null);
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
        if (firstClient) setDraft(toDraft(firstClient));
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
        `${client.identification} ${client.firstName} ${client.lastName} ${client.phone ?? ""}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [clients, searchTerm],
  );
  const selectedClient =
    clients.find((client) => client.id === selectedId) ?? null;

  function selectClient(id) {
    setSelectedId(id);
    setEditing(false);
    setReferrals([]);
    const client = clients.find((item) => item.id === id);
    if (client) setDraft(toDraft(client));
    if (activeTab === "referrals") loadReferrals(id);
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleAdd() {
    setSelectedId(null);
    setDraft({ ...emptyClient });
    setEditing(true);
    setActiveTab("main");
    setError("");
  }

  function handleEdit() {
    if (!selectedClient) return;
    setDraft(toDraft(selectedClient));
    setEditing(true);
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    const body = {
      identification: draft.identification.trim(),
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      phone: draft.phone.trim() || undefined,
      address: draft.address.trim() || undefined,
      clientType: draft.clientType,
      email: draft.email.trim() || undefined,
    };
    try {
      const saved = selectedId
        ? await apiClient.patch(`/clientes/${selectedId}`, body)
        : await apiClient.post("/clientes", body);
      await loadClients();
      setSelectedId(saved.id);
      setEditing(false);
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !window.confirm("¿Deseas desactivar este cliente?"))
      return;
    setError("");
    try {
      await apiClient.delete(`/clientes/${selectedId}`);
      await loadClients();
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
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
            <button
              type="button"
              className="search-options"
              aria-label="Opciones de búsqueda"
            >
              <ChevronDown size={14} />
            </button>
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
              editing={editing}
              onChange={(value) => updateDraft("identification", value)}
            />
            <SummaryField
              label="Descripción"
              value={
                selectedClient
                  ? `${selectedClient.firstName} ${selectedClient.lastName}`
                  : `${draft.firstName} ${draft.lastName}`
              }
            />
            <div className="summary-field summary-type">
              <label>Estado</label>
              <div className="select-like">
                <span>{draft.isActive ? "ACTIVO" : "INACTIVO"}</span>
                <ChevronDown size={14} />
              </div>
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
              editing={editing}
              onChange={updateDraft}
            />
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
          {editing ? (
            <button type="button" disabled={saving} onClick={handleSave}>
              <Check size={14} /> {saving ? "Guardando…" : "Guardar"}
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
              disabled={!selectedClient}
            >
              <Edit3 size={14} /> Modificar
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedClient}
            >
              <Trash2 size={14} /> Borrar
            </button>
          )}
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(
                  selectedClient ? toDraft(selectedClient) : { ...emptyClient },
                );
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
  );
}

function ClientMain({ client, editing, onChange }) {
  return (
    <div className="provider-main-details client-main-details">
      <EditableField
        label="Tipo de cliente"
        value={client.clientType}
        editing={editing}
        onChange={(value) => onChange("clientType", value)}
        select
        options={["MINORISTA", "MAYORISTA"]}
      />
      <div className="detail-field active-field">
        <label>Activo</label>
        <span className="checkbox-value">
          <span
            className={
              client.isActive ? "fake-checkbox" : "fake-checkbox is-empty"
            }
          >
            {client.isActive && <Check size={12} />}
          </span>
          {client.isActive ? "Sí" : "No"}
        </span>
      </div>
      <EditableField
        label="Nombres"
        value={client.firstName}
        editing={editing}
        onChange={(value) => onChange("firstName", value)}
      />
      <EditableField
        label="Apellidos"
        value={client.lastName}
        editing={editing}
        onChange={(value) => onChange("lastName", value)}
      />
      <EditableField
        label="Teléfono"
        value={client.phone}
        editing={editing}
        onChange={(value) => onChange("phone", value)}
      />
      <EditableField
        label="e-mail / usuario"
        value={client.email || client.user?.username || ""}
        editing={editing}
        onChange={(value) => onChange("email", value)}
      />
      <EditableField
        label="Dirección"
        value={client.address}
        editing={editing}
        onChange={(value) => onChange("address", value)}
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
          El correo se usa para el acceso del cliente.
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
}) {
  return (
    <div className={`detail-field ${wide ? "wide-field" : ""}`}>
      <label>{label}</label>
      {editing ? (
        select ? (
          <select
            className="detail-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            className="detail-input"
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      ) : (
        <div className="detail-control">
          <span>{value || " "}</span>
        </div>
      )}
    </div>
  );
}

function ClientSummaryField({ label, value, editing, onChange }) {
  return (
    <div className="summary-field">
      <label>{label}</label>
      {editing ? (
        <input
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input value={value ?? ""} readOnly />
      )}
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
  };
}
