import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Edit3,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { apiClient } from "@/lib/api-client";

const roleOptions = [
  ["ADMIN", "Administrador"],
  ["CAJERO", "Cajero"],
  ["VENDEDOR", "Vendedor"],
  ["BODEGA", "Bodega"],
  ["CONTADOR", "Contador"],
];

const emptyUser = {
  id: null,
  username: "",
  email: "",
  password: "",
  role: "CAJERO",
  clientId: "",
  warehouseId: "",
  isActive: true,
  employee: null,
};

export function UsersWindow({ onClose, onRequestLogin }) {
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.getAllPages("/usuarios", { estado: "todos" }),
      apiClient.getAllPages("/clientes", { estado: "activos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
    ])
      .then(([userItems, clientItems, warehouseItems]) => {
        if (cancelled) return;
        const nextUsers = userItems.map(mapUser);
        setUsers(nextUsers);
        setClients(clientItems);
        setWarehouses(warehouseItems);
        setSelectedId(nextUsers[0]?.id ?? null);
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

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      `${user.username} ${roleLabel(user.role)} ${user.employee?.firstName ?? ""} ${user.employee?.lastName ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [users, searchTerm]);
  const selectedUser = users.find((user) => user.id === selectedId) ?? null;
  const shownUser = editing ? draft : selectedUser;

  function selectUser(id) {
    setSelectedId(id);
    setEditing(false);
    setDraft(null);
    setError("");
  }

  function startAdd() {
    setSelectedId(null);
    setDraft({ ...emptyUser, password: "" });
    setEditing(true);
    setError("");
  }

  function startEdit() {
    if (!selectedUser) return;
    setDraft({ ...selectedUser, email: selectedUser.username, password: "" });
    setEditing(true);
    setError("");
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleRequestError(requestError) {
    setError(requestError.message);
    if (isAuthError(requestError)) onRequestLogin?.();
  }

  async function saveUser() {
    if (!draft?.email.trim()) {
      setError("Escribe el correo del usuario.");
      return;
    }
    if (!draft.id && draft.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (draft.role === "BODEGA" && !draft.warehouseId) {
      setError("Un usuario Bodega debe tener una bodega asignada.");
      return;
    }
    const body = {
      email: draft.email.trim(),
      role: draft.role,
      clientId: draft.clientId ? Number(draft.clientId) : null,
      warehouseId: draft.warehouseId ? Number(draft.warehouseId) : null,
      isActive: Boolean(draft.isActive),
    };
    if (draft.password) body.password = draft.password;
    try {
      const saved = draft.id
        ? await apiClient.patch(`/usuarios/${draft.id}`, body)
        : await apiClient.post("/usuarios", {
            ...body,
            password: draft.password,
          });
      const normalized = mapUser(saved);
      setUsers((current) =>
        draft.id
          ? current.map((user) =>
              user.id === normalized.id ? normalized : user,
            )
          : [...current, normalized],
      );
      setSelectedId(normalized.id);
      setEditing(false);
      setDraft(null);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }

  async function deactivateUser() {
    if (!selectedId || !window.confirm("¿Deseas desactivar este usuario?"))
      return;
    try {
      await apiClient.delete(`/usuarios/${selectedId}`);
      setUsers((current) =>
        current.map((user) =>
          user.id === selectedId ? { ...user, isActive: false } : user,
        ),
      );
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }

  function moveSelection(offset) {
    const index = filteredUsers.findIndex((user) => user.id === selectedId);
    const next = filteredUsers[index + offset];
    if (next) selectUser(next.id);
  }

  return (
    <section
      className={`provider-window users-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Ventana de usuarios"
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle users-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <UserRound size={14} />
        </div>
        <strong>USUARIOS DEL SISTEMA</strong>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar usuarios"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content">
        <aside className="provider-list-panel">
          <div className="provider-list-toolbar">
            <label htmlFor="user-search">Buscar</label>
            <div className="provider-search-field">
              <Search size={15} />
              <input
                id="user-search"
                aria-label="Buscar usuario"
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
            className="provider-table users-list-table"
            role="table"
            aria-label="Listado de usuarios"
          >
            <div className="provider-table-head" role="row">
              <span>ID</span>
              <span>Usuario</span>
            </div>
            {filteredUsers.map((user) => (
              <button
                className={
                  user.id === selectedId
                    ? "provider-table-row is-selected"
                    : "provider-table-row"
                }
                type="button"
                role="row"
                key={user.id}
                onClick={() => selectUser(user.id)}
              >
                <span>{String(user.id).padStart(6, "0")}</span>
                <span>{user.username}</span>
              </button>
            ))}
            {loading && <div className="window-state">Cargando usuarios…</div>}
            {!loading && !filteredUsers.length && (
              <div className="window-state">No hay usuarios para mostrar.</div>
            )}
            <div className="provider-empty-rows" aria-hidden="true">
              {Array.from({
                length: Math.max(0, 9 - filteredUsers.length),
              }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
        </aside>
        <div className="provider-detail-panel users-detail-panel">
          <div className="provider-summary-form users-summary-form">
            <SummaryField
              label="ID"
              value={shownUser?.id ? String(shownUser.id).padStart(6, "0") : ""}
            />
            <SummaryField
              label="Usuario"
              value={shownUser?.username ?? shownUser?.email ?? ""}
            />
            <div className="summary-field summary-type">
              <label>Rol</label>
              <div className="select-like">
                <span>{roleLabel(shownUser?.role)}</span>
                <ChevronDown size={14} />
              </div>
            </div>
          </div>
          {shownUser ? (
            <UserDetails
              user={shownUser}
              editing={editing}
              clients={clients}
              warehouses={warehouses}
              onChange={updateDraft}
            />
          ) : (
            <div className="provider-tab-panel empty-provider-panel">
              <ShieldCheck size={24} />
              <strong>Agrega un usuario para comenzar.</strong>
              <span>
                Los usuarios controlan el acceso y el rol operativo del sistema.
              </span>
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
          {editing ? (
            <button type="button" onClick={saveUser}>
              <Check size={14} /> Guardar
            </button>
          ) : (
            <button type="button" onClick={startAdd}>
              <Plus size={14} /> Agregar
            </button>
          )}
          {!editing && (
            <button type="button" onClick={startEdit} disabled={!selectedUser}>
              <Edit3 size={14} /> Modificar
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={deactivateUser}
              disabled={!selectedUser}
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
  );
}

function UserDetails({ user, editing, clients, warehouses, onChange }) {
  const clientLabel = clients.find((client) => client.id === user.clientId);
  const warehouseLabel = warehouses.find(
    (warehouse) => warehouse.id === user.warehouseId,
  );
  return (
    <div className="provider-tab-panel user-main-details">
      <div className="users-section-heading">
        <ShieldCheck size={15} />
        <strong>Datos principales y permisos</strong>
        <span>El rol define el tipo de operación permitido.</span>
      </div>
      <div className="users-form-grid">
        <UserField
          label="Correo de acceso"
          value={user.email ?? user.username}
          editing={editing}
          onChange={(value) => onChange("email", value)}
          wide
        />
        {editing && (
          <UserField
            label="Contraseña"
            value={user.password}
            type="password"
            onChange={(value) => onChange("password", value)}
            wide
          />
        )}
        <UserSelect
          label="Tipo de usuario"
          value={user.role}
          editing={editing}
          options={roleOptions}
          onChange={(value) => onChange("role", value)}
        />
        <UserSelect
          label="Bodega asignada"
          value={user.warehouseId}
          editing={editing}
          options={warehouses.map((warehouse) => [
            String(warehouse.id),
            warehouse.location,
          ])}
          emptyLabel="Sin bodega asignada"
          onChange={(value) => onChange("warehouseId", value)}
        />
        <UserSelect
          label="Cliente asociado"
          value={user.clientId}
          editing={editing}
          options={clients.map((client) => [
            String(client.id),
            clientName(client),
          ])}
          emptyLabel="Interno sin cliente"
          onChange={(value) => onChange("clientId", value)}
        />
        <div className="detail-field active-field">
          <label>Activo</label>
          {editing ? (
            <input
              className="detail-checkbox-input"
              type="checkbox"
              checked={Boolean(user.isActive)}
              onChange={(event) => onChange("isActive", event.target.checked)}
            />
          ) : (
            <span className="checkbox-value">
              <span
                className={
                  user.isActive ? "fake-checkbox" : "fake-checkbox is-empty"
                }
              >
                {user.isActive && <Check size={12} />}
              </span>
              {user.isActive ? "Sí" : "No"}
            </span>
          )}
        </div>
      </div>
      <div className="user-profile-card">
        <div>
          <span>Perfil actual</span>
          <strong>{roleLabel(user.role)}</strong>
        </div>
        <div>
          <span>Cliente</span>
          <strong>
            {clientLabel ? clientName(clientLabel) : "Interno sin cliente"}
          </strong>
        </div>
        <div>
          <span>Bodega</span>
          <strong>{warehouseLabel?.location ?? "Sin bodega asignada"}</strong>
        </div>
      </div>
      {user.employee && (
        <div className="user-employee-card">
          <strong>Funcionario relacionado</strong>
          <span>
            {user.employee.firstName} {user.employee.lastName} ·{" "}
            {user.employee.identification}
          </span>
          <small>
            Este vínculo se administra desde el registro de funcionarios del
            API.
          </small>
        </div>
      )}
    </div>
  );
}

function UserField({
  label,
  value,
  editing,
  onChange,
  type = "text",
  wide = false,
}) {
  return (
    <div className={`detail-field ${wide ? "wide-field" : ""}`}>
      <label>{label}</label>
      {editing ? (
        <input
          className="detail-input"
          type={type}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="detail-control">
          <span>{value || " "}</span>
        </div>
      )}
    </div>
  );
}

function UserSelect({ label, value, editing, options, onChange, emptyLabel }) {
  return (
    <div className="detail-field">
      <label>{label}</label>
      {editing ? (
        <select
          className="detail-input"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      ) : (
        <div className="detail-control select-like">
          <span>
            {options.find(
              ([optionValue]) => String(optionValue) === String(value),
            )?.[1] ?? emptyLabel}
          </span>
          <ChevronDown size={13} />
        </div>
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
function mapUser(user) {
  return {
    ...emptyUser,
    ...user,
    id: Number(user.id),
    email: user.username ?? "",
    isActive: user.isActive !== false,
  };
}
function clientName(client) {
  return (
    client.name ??
    [client.firstName, client.lastName].filter(Boolean).join(" ") ??
    `Cliente #${client.id}`
  );
}
function roleLabel(role) {
  return (
    roleOptions.find(([value]) => value === role)?.[1] ?? role ?? "Sin rol"
  );
}
function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
