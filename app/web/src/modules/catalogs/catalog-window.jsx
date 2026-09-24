import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleX,
  LoaderCircle,
  Plus,
  Search,
  Tag,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";

import { SearchOptionsMenu } from "@/components/desktop/search-options-menu";
import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

const catalogConfigs = {
  "product-types": {
    path: "/tipos-producto",
    title: "TIPOS DE PRODUCTO",
    singular: "tipo de producto",
    field: "name",
    fieldLabel: "Nombre",
    emptyMessage: "No hay tipos de producto para mostrar.",
    Icon: Tag,
  },
  warehouses: {
    path: "/bodegas",
    title: "BODEGAS",
    singular: "bodega",
    field: "location",
    fieldLabel: "Nombre o ubicación",
    emptyMessage: "No hay bodegas para mostrar.",
    Icon: Warehouse,
  },
};

export function CatalogWindow({
  catalog,
  onClose,
  onRequestLogin,
  canAccess,
}) {
  const config = catalogConfigs[catalog] ?? catalogConfigs["product-types"];
  const Icon = config.Icon;
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  const canEdit = canAccess?.("PRODUCTS_EDIT") ?? true;

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getAllPages(config.path, { estado: "todos" })
      .then((nextItems) => {
        if (cancelled) return;
        setItems(nextItems);
        const first = nextItems[0];
        setSelectedId(first?.id ?? null);
        setDraft(first ? { ...first } : createEmptyDraft(config));
      })
      .catch((requestError) => {
        if (!cancelled) handleRequestError(requestError, setError, onRequestLogin);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config, onRequestLogin]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const isActive = item.isActive !== false;
        const matchesStatus =
          statusFilter === "todos" ||
          (statusFilter === "activos" ? isActive : !isActive);
        return (
          matchesStatus &&
          String(item[config.field] ?? "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        );
      }),
    [config.field, items, searchTerm, statusFilter],
  );
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const hasChanges =
    Boolean(draft) &&
    (selectedItem === null ||
      String(draft[config.field] ?? "") !== String(selectedItem[config.field] ?? ""));
  const selectedIndex = filteredItems.findIndex((item) => item.id === selectedId);
  const canMovePrevious = selectedIndex > 0;
  const canMoveNext =
    selectedIndex >= 0 && selectedIndex < filteredItems.length - 1;

  function selectItem(id) {
    const item = items.find((current) => current.id === id);
    setSelectedId(id);
    setDraft(item ? { ...item } : null);
    setFieldError("");
    setError("");
  }

  function handleAdd() {
    if (!canEdit) return;
    setSelectedId(null);
    setDraft(createEmptyDraft(config));
    setFieldError("");
    setError("");
  }

  function updateDraft(value) {
    setDraft((current) => ({ ...current, [config.field]: value }));
    setFieldError("");
  }

  async function handleSave() {
    if (!canEdit || !draft || !hasChanges || saving || deleting) return;
    const value = String(draft[config.field] ?? "").trim();
    if (value.length < 2) {
      setFieldError(`El ${config.singular} debe tener al menos 2 caracteres.`);
      setError("Corrige el campo marcado antes de guardar.");
      return;
    }
    setSaving(true);
    setError("");
    setFieldError("");
    try {
      const saved = selectedId
        ? await apiClient.patch(`${config.path}/${selectedId}`, {
            [config.field]: value,
          })
        : await apiClient.post(config.path, { [config.field]: value });
      setItems((current) =>
        selectedId
          ? current.map((item) => (item.id === selectedId ? saved : item))
          : [...current, saved],
      );
      setSelectedId(saved.id);
      setDraft({ ...saved });
    } catch (requestError) {
      handleRequestError(requestError, setError, onRequestLogin);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!canEdit || !selectedItem || deleting || saving) return;
    setDeleting(true);
    setError("");
    try {
      const saved = selectedItem.isActive === false
        ? await apiClient.patch(`${config.path}/${selectedItem.id}/reactivar`, {})
        : await apiClient.delete(`${config.path}/${selectedItem.id}`);
      setItems((current) =>
        current.map((item) => (item.id === selectedItem.id ? saved : item)),
      );
      setDraft({ ...saved });
    } catch (requestError) {
      handleRequestError(requestError, setError, onRequestLogin);
    } finally {
      setDeleting(false);
    }
  }

  function moveSelection(offset) {
    const next = filteredItems[selectedIndex + offset];
    if (next) selectItem(next.id);
  }

  function cancelChanges() {
    setFieldError("");
    setError("");
    if (selectedItem) setDraft({ ...selectedItem });
    else setDraft(createEmptyDraft(config));
  }

  return (
    <div className="provider-window-host" style={windowStyle}>
      <section
        className={`provider-window catalog-window ${isDragging ? "is-dragging" : ""}`}
        aria-label={`Ventana de ${config.title.toLowerCase()}`}
      >
        <header
          className="provider-titlebar drag-handle"
          onPointerDown={handlePointerDown}
          title="Arrastre para mover la ventana"
        >
          <div className="provider-title-mark">
            <Icon size={14} />
          </div>
          <strong>{config.title}</strong>
          <button
            type="button"
            className="provider-close"
            aria-label={`Cerrar ${config.title.toLowerCase()}`}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="provider-content">
          <aside className="provider-list-panel">
            <div className="provider-list-toolbar">
              <label htmlFor={`${catalog}-search`}>Buscar</label>
              <div className="provider-search-field">
                <Search size={15} />
                <input
                  id={`${catalog}-search`}
                  aria-label={`Buscar ${config.singular}`}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <SearchOptionsMenu
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
            <div className="provider-table catalog-table" role="table">
              <div className="provider-table-head" role="row">
                <span>{config.fieldLabel}</span>
              </div>
              {filteredItems.map((item) => (
                <button
                  className={
                    item.id === selectedId
                      ? "provider-table-row is-selected"
                      : "provider-table-row"
                  }
                  type="button"
                  role="row"
                  key={item.id}
                  onClick={() => selectItem(item.id)}
                >
                  <span>{item[config.field]}</span>
                </button>
              ))}
              {loading && (
                <div className="window-state">Cargando catálogo…</div>
              )}
              {!loading && !filteredItems.length && (
                <div className="window-state">{config.emptyMessage}</div>
              )}
              <div className="provider-empty-rows" aria-hidden="true">
                {Array.from({
                  length: Math.max(0, 10 - filteredItems.length),
                }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
            </div>
          </aside>

          <div className="provider-detail-panel catalog-detail-panel">
            <div className="catalog-form-heading">
              <strong>
                {selectedItem ? `Editar ${config.singular}` : `Nuevo ${config.singular}`}
              </strong>
              <span>
                Administra este catálogo aquí o créalo rápidamente desde Productos.
              </span>
            </div>
            <div className="provider-main-details catalog-main-details">
              <div className={`detail-field ${fieldError ? "has-error" : ""}`}>
                <label htmlFor={`${catalog}-value`}>{config.fieldLabel}</label>
                <input
                  id={`${catalog}-value`}
                  className={`detail-input ${fieldError ? "is-invalid" : ""}`}
                  value={draft?.[config.field] ?? ""}
                  readOnly={!canEdit}
                  aria-invalid={Boolean(fieldError)}
                  title={fieldError || undefined}
                  onChange={(event) => updateDraft(event.target.value)}
                />
                {fieldError && <span className="field-error">{fieldError}</span>}
              </div>
              <div className="catalog-status-note">
                Estado: {selectedItem?.isActive === false ? "Inactivo" : "Activo"}
              </div>
            </div>
            {hasChanges && (
              <div
                className="provider-change-actions"
                role="group"
                aria-label="Acciones de cambios"
              >
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
                  {saving
                    ? "Guardando…"
                    : selectedItem
                      ? "Guardar cambios"
                      : `Crear ${config.singular}`}
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
            {selectedItem && (
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={!canEdit || saving || deleting || hasChanges}
              >
                {deleting ? (
                  <LoaderCircle className="button-spinner" size={14} />
                ) : (
                  <Trash2 size={14} />
                )}
                {deleting
                  ? "Procesando…"
                  : selectedItem.isActive === false
                    ? "Reactivar"
                    : "Desactivar"}
              </button>
            )}
          </div>
          <div className="provider-navigation-actions">
            <button
              type="button"
              className="muted-action"
              disabled={!canMovePrevious || hasChanges || saving || deleting}
              onClick={() => moveSelection(-1)}
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              type="button"
              className="muted-action"
              disabled={!canMoveNext || hasChanges || saving || deleting}
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
    </div>
  );
}

function createEmptyDraft(config) {
  return { [config.field]: "" };
}

function handleRequestError(error, setError, onRequestLogin) {
  setError(error.message);
  if (/sesión|inicia sesión|401|autentic/i.test(error.message))
    onRequestLogin?.();
}
