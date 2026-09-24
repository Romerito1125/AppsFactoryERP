import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { SearchOptionsMenu } from "@/components/desktop/search-options-menu";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";
import {
  buildPermissionDraft,
  permissionCatalog,
  permissionSelections,
} from "@/app/permissions";

const roleOptions = [
  ["ADMIN", "Administrador"],
  ["CAJERO", "Cajero"],
  ["VENDEDOR", "Vendedor"],
  ["BODEGA", "Bodega"],
  ["CONTADOR", "Contador"],
  ["DOMICILIARIO", "Domiciliario"],
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
  const [statusFilter, setStatusFilter] = useState("todos");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [permissionDraft, setPermissionDraft] = useState(null);
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
        if (nextUsers[0]) {
          setDraft({ ...nextUsers[0], password: "" });
          setPermissionDraft(
            buildPermissionDraft(nextUsers[0].role, nextUsers[0].permissions),
          );
        } else {
          setDraft({ ...emptyUser, password: "" });
          setPermissionDraft(buildPermissionDraft(emptyUser.role));
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

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return users.filter((user) =>
      (statusFilter === "todos" ||
        (statusFilter === "activos" ? user.isActive : !user.isActive)) &&
      (!query ||
        `${user.username} ${roleLabel(user.role)} ${user.employee?.firstName ?? ""} ${user.employee?.lastName ?? ""}`
          .toLowerCase()
          .includes(query)),
    );
  }, [users, searchTerm, statusFilter]);
  const selectedUser = users.find((user) => user.id === selectedId) ?? null;
  const shownUser = editing ? draft : selectedUser;
  const hasChanges = useMemo(
    () => hasUserDraftChanges(draft, selectedUser, permissionDraft),
    [draft, permissionDraft, selectedUser],
  );
  const selectedIndex = filteredUsers.findIndex(
    (user) => user.id === selectedId,
  );
  const canMovePrevious = selectedIndex > 0;
  const canMoveNext =
    selectedIndex >= 0 && selectedIndex < filteredUsers.length - 1;

  function selectUser(id) {
    setSelectedId(id);
    const user = users.find((item) => item.id === id);
    setDraft(user ? { ...user, email: user.username, password: "" } : null);
    setPermissionDraft(
      user ? buildPermissionDraft(user.role, user.permissions) : null,
    );
    setEditing(Boolean(user));
    setError("");
    setFieldErrors({});
  }

  function startAdd() {
    setSelectedId(null);
    setDraft({ ...emptyUser, password: "" });
    setPermissionDraft(buildPermissionDraft(emptyUser.role));
    setEditing(true);
    setError("");
    setFieldErrors({});
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

  function updateRole(role) {
    updateDraft("role", role);
    setPermissionDraft(buildPermissionDraft(role));
  }

  function updatePermission(code, isAllowed) {
    setPermissionDraft((current) => ({ ...current, [code]: isAllowed }));
  }

  function handleRequestError(requestError) {
    setError(requestError.message);
    setFieldErrors(getUserFieldErrors(requestError));
    if (isAuthError(requestError)) onRequestLogin?.();
  }

  async function saveUser() {
    if (!hasChanges || saving || deleting) return;
    setError("");
    setFieldErrors({});
    const validationErrors = validateUserDraft(draft);
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError("Corrige los campos marcados antes de guardar.");
      return;
    }
    const body = {
      email: draft.email.trim(),
      role: draft.role,
      clientId: draft.clientId ? Number(draft.clientId) : null,
      warehouseId: draft.warehouseId ? Number(draft.warehouseId) : null,
      isActive: Boolean(draft.isActive),
    };
    if (
      selectedId !== null &&
      draft.id !== null &&
      draft.id !== undefined &&
      draft.id !== ""
    ) {
      body.id = Number(draft.id);
    }
    if (draft.password) body.password = draft.password;
    setSaving(true);
    try {
      const saved = selectedId !== null
        ? await apiClient.patch(`/usuarios/${selectedId}`, body)
        : await apiClient.post("/usuarios", {
            ...body,
            password: draft.password,
          });
      const normalized = mapUser(saved);
      const permissionResult = await apiClient.put(
        `/usuarios/${normalized.id}/permisos`,
        {
          permissions: permissionSelections(permissionDraft ?? {}),
        },
      );
      normalized.permissions = permissionResult.permissions;
      setUsers((current) =>
        selectedId !== null
          ? current.map((user) =>
              user.id === selectedId ? normalized : user,
            )
          : [...current, normalized],
      );
      setSelectedId(normalized.id);
      setDraft({ ...normalized, email: normalized.username, password: "" });
      setPermissionDraft(
        buildPermissionDraft(normalized.role, normalized.permissions),
      );
      setEditing(true);
      setFieldErrors({});
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setSaving(false);
    }
  }

  function cancelChanges() {
    if (selectedUser) {
      setDraft({ ...selectedUser, email: selectedUser.username, password: "" });
      setPermissionDraft(
        buildPermissionDraft(selectedUser.role, selectedUser.permissions),
      );
      setEditing(true);
    } else {
      setDraft({ ...emptyUser, password: "" });
      setPermissionDraft(buildPermissionDraft(emptyUser.role));
      setEditing(true);
    }
    setError("");
    setFieldErrors({});
  }

  async function deleteUser() {
    if (
      !selectedId ||
      deleting ||
      !window.confirm(
        "¿Deseas eliminar definitivamente este usuario? Esta acción no se puede deshacer.",
      )
    )
      return;
    setDeleting(true);
    try {
      await apiClient.delete(`/usuarios/${selectedId}`);
      const remainingUsers = users.filter((user) => user.id !== selectedId);
      const nextUser = remainingUsers[0] ?? null;
      setUsers(remainingUsers);
      setSelectedId(nextUser?.id ?? null);
      setDraft(
        nextUser
          ? { ...nextUser, email: nextUser.username, password: "" }
          : { ...emptyUser, password: "" },
      );
      setPermissionDraft(
        nextUser
          ? buildPermissionDraft(nextUser.role, nextUser.permissions)
          : buildPermissionDraft(emptyUser.role),
      );
      setEditing(true);
      setFieldErrors({});
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setDeleting(false);
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
            <SearchOptionsMenu value={statusFilter} onChange={setStatusFilter} />
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
            <EditableSummaryField
              label="ID"
              value={shownUser?.id ?? ""}
              editing={Boolean(editing && shownUser?.id !== null)}
              onChange={(value) => updateDraft("id", value)}
              error={fieldErrors.id}
            />
            <SummaryField
              label="Usuario"
              value={shownUser?.email ?? shownUser?.username ?? ""}
            />
            <div className="summary-field summary-type">
              <label>Rol</label>
              {editing ? (
                <select
                  className="detail-input"
                  value={shownUser?.role ?? ""}
                  onChange={(event) => updateRole(event.target.value)}
                >
                  {roleOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={roleLabel(shownUser?.role)} readOnly />
              )}
            </div>
          </div>
           {shownUser ? (
            <UserDetails
              user={shownUser}
              editing={editing}
              clients={clients}
              warehouses={warehouses}
              onChange={updateDraft}
              onRoleChange={updateRole}
              fieldErrors={fieldErrors}
              permissions={
                editing
                  ? (permissionDraft ??
                    buildPermissionDraft(shownUser.role, shownUser.permissions))
                  : buildPermissionDraft(shownUser.role, shownUser.permissions)
              }
              onPermissionChange={updatePermission}
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
          {shownUser && hasChanges && (
            <div className="user-change-actions" role="group" aria-label="Acciones de cambios">
              <button type="button" onClick={saveUser} disabled={saving || deleting}>
                {saving ? <LoaderCircle className="button-spinner" size={14} /> : <Check size={14} />}
                {saving
                  ? "Guardando…"
                  : selectedId !== null
                    ? "Guardar cambios"
                    : "Crear usuario"}
              </button>
              <button type="button" onClick={cancelChanges} disabled={saving || deleting}>
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
            onClick={startAdd}
            disabled={saving || deleting}
          >
            <Plus size={14} /> Agregar
          </button>
          {selectedUser && (
            <button
              type="button"
              onClick={deleteUser}
              disabled={!selectedUser || deleting || saving}
            >
              {deleting ? <LoaderCircle className="button-spinner" size={14} /> : <Trash2 size={14} />}
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

function UserDetails({
  user,
  editing,
  clients,
  warehouses,
  onChange,
  onRoleChange,
  fieldErrors,
  permissions,
  onPermissionChange,
}) {
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
          error={fieldErrors.email}
          wide
        />
        <UserField
          label="Contraseña"
          value={user.password}
          editing={editing}
          type="password"
          placeholder="Escribe una nueva contraseña"
          autoComplete="new-password"
          onChange={(value) => onChange("password", value)}
          error={fieldErrors.password}
          wide
        />
        <UserSelect
          label="Tipo de usuario"
          value={user.role}
          editing={editing}
          options={roleOptions}
          onChange={onRoleChange}
          error={fieldErrors.role}
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
          error={fieldErrors.warehouseId}
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
            sistema.
          </small>
        </div>
      )}
      <PermissionMatrix
        permissions={permissions}
        editing={editing}
        onChange={onPermissionChange}
      />
    </div>
  );
}

function PermissionMatrix({ permissions, editing, onChange }) {
  const groups = permissionCatalog.reduce((result, item) => {
    (result[item.group] ??= []).push(item);
    return result;
  }, {});

  return (
    <section
      className="users-permissions-card"
      aria-label="Permisos del usuario"
    >
      <div className="users-permissions-heading">
        <div>
          <strong>Accesos por módulo</strong>
          <span>
            {editing
              ? "Activa solo las opciones que este usuario podrá utilizar."
              : "Permisos efectivos para el rol seleccionado."}
          </span>
        </div>
        <ShieldCheck size={16} />
      </div>
      <div className="users-permissions-grid">
        {Object.entries(groups).map(([group, items]) => (
          <div className="users-permission-group" key={group}>
            <strong>{group}</strong>
            {items.map((item) => (
              <label className="permission-option" key={item.code}>
                <input
                  type="checkbox"
                  checked={Boolean(permissions?.[item.code])}
                  disabled={!editing}
                  onChange={(event) =>
                    onChange?.(item.code, event.target.checked)
                  }
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function UserField({
  label,
  value,
  editing,
  onChange,
  type = "text",
  wide = false,
  error = "",
  placeholder,
  autoComplete,
}) {
  return (
    <div
      className={["detail-field", wide && "wide-field", error && "has-error"]
        .filter(Boolean)
        .join(" ")}
    >
      <label>{label}</label>
      {editing ? (
        <input
          className={error ? "detail-input is-invalid" : "detail-input"}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value ?? ""}
          aria-invalid={Boolean(error)}
          title={error || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="detail-control">
          <span>{value || " "}</span>
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function UserSelect({
  label,
  value,
  editing,
  options,
  onChange,
  emptyLabel,
  error = "",
}) {
  return (
    <div className={error ? "detail-field has-error" : "detail-field"}>
      <label>{label}</label>
      {editing ? (
        <select
          className={error ? "detail-input is-invalid" : "detail-input"}
          value={value ?? ""}
          aria-invalid={Boolean(error)}
          title={error || undefined}
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

function EditableSummaryField({ label, value, editing, onChange, error = "" }) {
  return (
    <div className={error ? "summary-field has-error" : "summary-field"}>
      <label>{label}</label>
      {editing ? (
        <input
          className={error ? "is-invalid" : ""}
          value={value ?? ""}
          inputMode="numeric"
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

function hasUserDraftChanges(draft, selectedUser, permissionDraft) {
  if (!draft) return false;

  const baseline = selectedUser ?? emptyUser;
  const fieldsChanged = [
    [String(draft.id ?? ""), String(baseline.id ?? "")],
    [draft.email?.trim().toLowerCase(), baseline.username ?? ""],
    [draft.role, baseline.role],
    [String(draft.clientId ?? ""), String(baseline.clientId ?? "")],
    [String(draft.warehouseId ?? ""), String(baseline.warehouseId ?? "")],
    [Boolean(draft.isActive), Boolean(baseline.isActive)],
  ].some(([current, previous]) => current !== previous);

  if (fieldsChanged || draft.password) return true;

  const baselinePermissions = buildPermissionDraft(
    baseline.role,
    baseline.permissions,
  );
  return permissionCatalog.some(
    (item) =>
      Boolean(permissionDraft?.[item.code]) !==
      Boolean(baselinePermissions[item.code]),
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

function validateUserDraft(user) {
  const errors = {};
  const email = user?.email?.trim() ?? "";
  const password = user?.password ?? "";

  if (
    user?.id !== null &&
    user?.id !== undefined &&
    (Number.isNaN(Number(user.id)) ||
      !Number.isInteger(Number(user.id)) ||
      Number(user.id) <= 0)
  ) {
    errors.id = "El ID debe ser un número entero positivo.";
  }
  if (!email) {
    errors.email = "El correo es obligatorio.";
  } else if (!/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "Escribe un correo válido.";
  }
  if (!user?.id && password.length < 6) {
    errors.password = "La contraseña debe tener al menos 6 caracteres.";
  } else if (user?.id && password && password.length < 6) {
    errors.password = "La contraseña debe tener al menos 6 caracteres.";
  }
  if (!user?.role) errors.role = "Selecciona un rol.";
  if (user?.role === "BODEGA" && !user.warehouseId) {
    errors.warehouseId = "Asigna una bodega a los usuarios Bodega.";
  }

  return errors;
}

function getUserFieldErrors(requestError) {
  const message = requestError?.message ?? "";
  const errors = {};
  if (/correo|email/i.test(message)) errors.email = message;
  if (/contrase[nñ]a|password/i.test(message)) errors.password = message;
  if (/rol|role/i.test(message)) errors.role = message;
  if (/bodega|warehouse/i.test(message)) errors.warehouseId = message;
  if (/cliente|client/i.test(message)) errors.clientId = message;
  return errors;
}
