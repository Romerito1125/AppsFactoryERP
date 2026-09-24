import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleX,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { SearchOptionsMenu } from "@/components/desktop/search-options-menu";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

const emptyRetention = {
  id: null,
  code: "",
  description: "",
  subtracting: 0,
  minimumBase: 0,
  operationCode: "",
  operationDescription: "",
  applySales: false,
  applyPurchases: true,
  isActive: true,
  ranges: [],
};

function createEmptyRetentionDraft() {
  return {
    ...emptyRetention,
    ranges: [{ minimum: 0, maximum: 0, percentage: 0 }],
  };
}

export function RetentionsWindow({ onClose, onRequestLogin, canAccess }) {
  const [retentions, setRetentions] = useState([]);
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
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getAllPages("/retenciones", { estado: "todos" })
      .then((items) => {
        if (cancelled) return;
        const next = items.map(mapRetention);
        setRetentions(next);
        setSelectedId(next[0]?.id ?? null);
        if (next[0]) {
          setDraft({
            ...next[0],
            ranges: next[0].ranges.map((range) => ({ ...range })),
          });
        } else {
          setDraft(createEmptyRetentionDraft());
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

  const filteredRetentions = useMemo(
    () =>
      retentions.filter((retention) =>
        (statusFilter === "todos" ||
          (statusFilter === "activos"
            ? retention.isActive
            : !retention.isActive)) &&
        `${retention.code} ${retention.description}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [retentions, searchTerm, statusFilter],
  );
  const selectedRetention =
    retentions.find((retention) => retention.id === selectedId) ?? null;
  const shownRetention = editing ? draft : selectedRetention;
  const canEdit = canAccess?.("RETENTIONS_EDIT") ?? true;
  const hasChanges = useMemo(
    () => hasRetentionDraftChanges(draft, selectedRetention),
    [draft, selectedRetention],
  );
  const selectedIndex = filteredRetentions.findIndex(
    (retention) => retention.id === selectedId,
  );
  const canMovePrevious = selectedIndex > 0;
  const canMoveNext =
    selectedIndex >= 0 && selectedIndex < filteredRetentions.length - 1;

  function selectRetention(id) {
    setSelectedId(id);
    const retention = retentions.find((item) => item.id === id);
    setDraft(
      retention
        ? {
            ...retention,
            ranges: retention.ranges.map((range) => ({ ...range })),
          }
        : null,
    );
    setEditing(Boolean(retention));
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
  function handleAdd() {
    if (!canEdit) return;
    setSelectedId(null);
    setDraft(createEmptyRetentionDraft());
    setEditing(true);
    setActiveTab("main");
    setFieldErrors({});
    setError("");
  }
  async function handleSave() {
    if (!canEdit || !draft || !hasChanges || saving || deleting) return;
    setError("");
    setFieldErrors({});
    const validationErrors = validateRetentionDraft(draft);
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError("Corrige los campos marcados antes de guardar.");
      return;
    }
    setSaving(true);
    const body = {
      code: draft.code.trim(),
      description: draft.description.trim(),
      subtracting: Number(draft.subtracting) || 0,
      minimumBase: Number(draft.minimumBase) || 0,
      operationCode: draft.operationCode.trim() || undefined,
      operationDescription: draft.operationDescription.trim() || undefined,
      applySales: draft.applySales,
      applyPurchases: draft.applyPurchases,
      isActive: draft.isActive,
      ranges: draft.ranges.map((range, index) => ({
        minimum: Number(range.minimum) || 0,
        maximum: Number(range.maximum) || 0,
        percentage: Number(range.percentage) || 0,
        sortOrder: index,
      })),
    };
    try {
      const saved = selectedId
        ? await apiClient.patch(`/retenciones/${selectedId}`, body)
        : await apiClient.post("/retenciones", body);
      const normalized = mapRetention(saved);
      setRetentions((current) =>
        selectedId
          ? current.map((item) => (item.id === selectedId ? normalized : item))
          : [...current, normalized],
      );
      setSelectedId(normalized.id);
      setDraft({
        ...normalized,
        ranges: normalized.ranges.map((range) => ({ ...range })),
      });
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
        "¿Deseas eliminar definitivamente esta retención? Esta acción no se puede deshacer.",
      )
    )
      return;
    setDeleting(true);
    setError("");
    try {
      await apiClient.delete(`/retenciones/${selectedId}`);
      const remaining = retentions.filter((item) => item.id !== selectedId);
      setRetentions(remaining);
      const nextRetention = remaining[0] ?? null;
      setSelectedId(nextRetention?.id ?? null);
      setDraft(
        nextRetention
          ? {
              ...nextRetention,
              ranges: nextRetention.ranges.map((range) => ({ ...range })),
            }
          : createEmptyRetentionDraft(),
      );
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
    const index = filteredRetentions.findIndex(
      (retention) => retention.id === selectedId,
    );
    const next = filteredRetentions[index + offset];
    if (next) selectRetention(next.id);
  }

  return (
    <section
      className={`provider-window retention-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Ventana de retenciones"
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle retention-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <RetentionGlyph />
        </div>
        <strong>RETENCIONES</strong>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar retenciones"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content">
        <aside className="provider-list-panel">
          <div className="provider-list-toolbar">
            <label htmlFor="retention-search">Buscar</label>
            <div className="provider-search-field">
              <Search size={15} />
              <input
                id="retention-search"
                aria-label="Buscar retención"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <SearchOptionsMenu value={statusFilter} onChange={setStatusFilter} />
          </div>
          <div
            className="provider-table retention-list-table"
            role="table"
            aria-label="Listado de retenciones"
          >
            <div className="provider-table-head" role="row">
              <span>Código</span>
              <span>Descripción</span>
            </div>
            {filteredRetentions.map((retention) => (
              <button
                className={
                  retention.id === selectedId
                    ? "provider-table-row is-selected"
                    : "provider-table-row"
                }
                type="button"
                role="row"
                key={retention.id}
                onClick={() => selectRetention(retention.id)}
              >
                <span>{retention.code}</span>
                <span>{retention.description}</span>
              </button>
            ))}
            {loading && (
              <div className="window-state">Cargando retenciones…</div>
            )}
            {!loading && !filteredRetentions.length && (
              <div className="window-state">
                No hay retenciones para mostrar.
              </div>
            )}
            <div className="provider-empty-rows" aria-hidden="true">
              {Array.from({
                length: Math.max(0, 8 - filteredRetentions.length),
              }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
        </aside>
        <div className="provider-detail-panel retention-detail-panel">
          <div className="provider-summary-form retention-summary-form">
            <SummaryField label="Código" value={shownRetention?.code ?? ""} />
            <SummaryField
              label="Descripción"
              value={shownRetention?.description ?? ""}
            />
          </div>
          <div className="provider-tabs primary-tabs retention-tabs">
            <button
              className={
                activeTab === "main" ? "provider-tab is-active" : "provider-tab"
              }
              type="button"
              onClick={() => setActiveTab("main")}
            >
              Datos principales
            </button>
            <button
              className={
                activeTab === "table"
                  ? "provider-tab is-active"
                  : "provider-tab"
              }
              type="button"
              onClick={() => setActiveTab("table")}
            >
              Tabla retención
            </button>
          </div>
          {shownRetention ? (
            activeTab === "table" ? (
              <RetentionTable
                ranges={shownRetention.ranges}
                editing={editing && canEdit}
                onChange={(ranges) => updateDraft("ranges", ranges)}
                fieldErrors={fieldErrors}
              />
            ) : (
              <RetentionMain
                retention={shownRetention}
                editing={editing && canEdit}
                onChange={updateDraft}
                fieldErrors={fieldErrors}
              />
            )
          ) : (
            <div className="provider-tab-panel empty-provider-panel">
              <strong>Agrega una retención para comenzar.</strong>
            </div>
          )}
          {editing && hasChanges && (
            <div className="retention-change-actions" role="group" aria-label="Acciones de cambios">
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
                {saving ? "Guardando…" : selectedId !== null ? "Guardar cambios" : "Crear retención"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFieldErrors({});
                  if (selectedRetention) {
                    setDraft({
                      ...selectedRetention,
                      ranges: selectedRetention.ranges.map((range) => ({ ...range })),
                    });
                  } else {
                    setSelectedId(null);
                    setDraft(createEmptyRetentionDraft());
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
          {selectedRetention && (
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
  );
}

function RetentionMain({ retention, editing, onChange, fieldErrors }) {
  return (
    <div className="provider-tab-panel retention-main-panel">
      <div className="retention-form-grid">
        <RetentionTextField
          label="Código"
          value={retention.code}
          editing={editing}
          onChange={(value) => onChange("code", value)}
          error={fieldErrors?.code}
        />
        <RetentionTextField
          label="Descripción"
          value={retention.description}
          editing={editing}
          onChange={(value) => onChange("description", value)}
          wide
          error={fieldErrors?.description}
        />
        <RetentionField
          label="Sustraendo"
          value={retention.subtracting}
          editing={editing}
          onChange={(value) => onChange("subtracting", value)}
          error={fieldErrors?.subtracting}
        />
        <RetentionField
          label="Base mínima"
          value={retention.minimumBase}
          editing={editing}
          onChange={(value) => onChange("minimumBase", value)}
          error={fieldErrors?.minimumBase}
        />
        <RetentionTextField
          label="Tipo operación"
          value={retention.operationCode}
          editing={editing}
          onChange={(value) => onChange("operationCode", value)}
        />
        <RetentionTextField
          label="Descripción operación"
          value={retention.operationDescription}
          editing={editing}
          onChange={(value) => onChange("operationDescription", value)}
          wide
        />
        <CheckboxField
          label="Aplica ventas / cuentas cobrar"
          checked={retention.applySales}
          editing={editing}
          onChange={(value) => onChange("applySales", value)}
        />
        <CheckboxField
          label="Aplica compras / cuentas pagar"
          checked={retention.applyPurchases}
          editing={editing}
          onChange={(value) => onChange("applyPurchases", value)}
        />
        <CheckboxField
          label="Activo"
          checked={retention.isActive}
          editing={editing}
          onChange={(value) => onChange("isActive", value)}
        />
      </div>
    </div>
  );
}
function RetentionTable({ ranges, editing, onChange, fieldErrors }) {
  function updateRange(index, field, value) {
    onChange(
      ranges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [field]: value } : range,
      ),
    );
  }
  function addRange() {
    onChange([...ranges, { minimum: 0, maximum: 0, percentage: 0 }]);
  }
  return (
    <div className="provider-tab-panel data-panel retention-table-panel">
      <div className="retention-range-heading">
        <span>Rango de retención</span>
        <span>Porcentaje</span>
      </div>
      <table className="provider-data-table retention-data-table">
        <thead>
          <tr>
            <th>Desde</th>
            <th>Hasta</th>
            <th>Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          {ranges.map((range, index) => (
            <tr key={`${range.minimum}-${index}`}>
              <td>
                {editing ? (
                  <input
                    className={`detail-input ${fieldErrors?.[`range-${index}-minimum`] ? "is-invalid" : ""}`}
                    value={range.minimum}
                    aria-invalid={Boolean(fieldErrors?.[`range-${index}-minimum`])}
                    title={fieldErrors?.[`range-${index}-minimum`] || undefined}
                    onChange={(event) =>
                      updateRange(index, "minimum", event.target.value)
                    }
                  />
                ) : (
                  formatNumber(range.minimum)
                )}
              </td>
              <td>
                {editing ? (
                  <input
                    className={`detail-input ${fieldErrors?.[`range-${index}-maximum`] ? "is-invalid" : ""}`}
                    value={range.maximum}
                    aria-invalid={Boolean(fieldErrors?.[`range-${index}-maximum`])}
                    title={fieldErrors?.[`range-${index}-maximum`] || undefined}
                    onChange={(event) =>
                      updateRange(index, "maximum", event.target.value)
                    }
                  />
                ) : (
                  formatNumber(range.maximum)
                )}
              </td>
              <td>
                {editing ? (
                  <input
                    className={`detail-input ${fieldErrors?.[`range-${index}-percentage`] ? "is-invalid" : ""}`}
                    value={range.percentage}
                    aria-invalid={Boolean(fieldErrors?.[`range-${index}-percentage`])}
                    title={fieldErrors?.[`range-${index}-percentage`] || undefined}
                    onChange={(event) =>
                      updateRange(index, "percentage", event.target.value)
                    }
                  />
                ) : (
                  `${formatNumber(range.percentage)}%`
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <button type="button" className="add-range-button" onClick={addRange}>
          <Plus size={13} /> Agregar rango
        </button>
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
function RetentionTextField({
  label,
  value,
  editing,
  onChange,
  wide = false,
  error = "",
}) {
  return (
    <div className={`retention-field ${wide ? "wide-field" : ""} ${error ? "has-error" : ""}`}>
      <label>{label}</label>
      {editing ? (
        <input
          className={`detail-input ${error ? "is-invalid" : ""}`}
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
function RetentionField({ label, value, editing, onChange, error = "" }) {
  return (
    <div className={`retention-field ${error ? "has-error" : ""}`}>
      <label>{label}</label>
      {editing ? (
        <input
          className={`detail-input ${error ? "is-invalid" : ""}`}
          value={value ?? ""}
          aria-invalid={Boolean(error)}
          title={error || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="detail-control">
          <span>{formatNumber(value)}</span>
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
function CheckboxField({ label, checked, editing, onChange }) {
  return (
    <div className="retention-checkbox-field">
      <label>{label}</label>
      {editing ? (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : (
        <span className="checkbox-value">
          <span
            className={checked ? "fake-checkbox" : "fake-checkbox is-empty"}
          >
            {checked && <Check size={12} />}
          </span>
          {checked ? "Sí" : "No"}
        </span>
      )}
    </div>
  );
}
function RetentionGlyph() {
  return (
    <span className="retention-glyph">
      <i />
      <i />
      <i />
    </span>
  );
}
function hasRetentionDraftChanges(draft, retention) {
  if (!draft) return false;
  if (!retention) return true;
  const fields = [
    "code",
    "description",
    "subtracting",
    "minimumBase",
    "operationCode",
    "operationDescription",
    "applySales",
    "applyPurchases",
    "isActive",
  ];
  if (
    fields.some(
      (field) => String(draft[field] ?? "") !== String(retention[field] ?? ""),
    )
  )
    return true;
  return JSON.stringify(draft.ranges ?? []) !== JSON.stringify(retention.ranges ?? []);
}
function validateRetentionDraft(retention) {
  const errors = {};
  if (!retention.code?.trim()) errors.code = "El código es obligatorio.";
  if (!retention.description?.trim())
    errors.description = "La descripción es obligatoria.";
  else if (retention.description.trim().length < 2)
    errors.description = "La descripción debe tener al menos 2 caracteres.";
  for (const [field, label] of [
    ["subtracting", "El sustraendo"],
    ["minimumBase", "La base mínima"],
  ]) {
    const value = Number(retention[field]);
    if (!Number.isFinite(value) || value < 0)
      errors[field] = `${label} debe ser un número mayor o igual a cero.`;
  }
  (retention.ranges ?? []).forEach((range, index) => {
    const minimum = Number(range.minimum);
    const maximum = Number(range.maximum);
    const percentage = Number(range.percentage);
    if (!Number.isFinite(minimum) || minimum < 0)
      errors[`range-${index}-minimum`] = "El mínimo debe ser mayor o igual a cero.";
    if (!Number.isFinite(maximum) || maximum < 0)
      errors[`range-${index}-maximum`] = "El máximo debe ser mayor o igual a cero.";
    else if (maximum < minimum)
      errors[`range-${index}-maximum`] = "El máximo no puede ser menor al mínimo.";
    if (!Number.isFinite(percentage) || percentage < 0)
      errors[`range-${index}-percentage`] = "El porcentaje debe ser mayor o igual a cero.";
  });
  return errors;
}
function mapRetention(retention) {
  return {
    ...emptyRetention,
    ...retention,
    id: retention.id,
    code: retention.code ?? "",
    description: retention.description ?? "",
    subtracting: Number(retention.subtracting ?? 0),
    minimumBase: Number(retention.minimumBase ?? 0),
    ranges: (retention.ranges ?? []).map((range) => ({
      ...range,
      minimum: Number(range.minimum),
      maximum: Number(range.maximum),
      percentage: Number(range.percentage),
    })),
  };
}
function formatNumber(value) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}
