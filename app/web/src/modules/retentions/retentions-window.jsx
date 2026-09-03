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
  Trash2,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
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
const demoRetentions = [
  {
    ...emptyRetention,
    id: 1,
    code: "C25",
    description: "RETENCIÓN EN COMPRAS DEL 2,5%",
    minimumBase: 764000,
    operationCode: "RC25",
    operationDescription: "RETENCIÓN COMPRAS 2,5% DECLARANTES",
    ranges: [
      { minimum: 0, maximum: 764000, percentage: 0 },
      { minimum: 764000.01, maximum: 999999999.99, percentage: 2.5 },
    ],
  },
  {
    ...emptyRetention,
    id: 2,
    code: "IVA",
    description: "RETENCIÓN DE IVA",
    minimumBase: 1000000,
    operationCode: "RIVA",
    operationDescription: "RETENCIÓN IVA COMPRAS",
    ranges: [
      { minimum: 0, maximum: 1000000, percentage: 0 },
      { minimum: 1000000.01, maximum: 999999999.99, percentage: 15 },
    ],
  },
];

export function RetentionsWindow({ onClose, onRequestLogin }) {
  const [retentions, setRetentions] = useState(demoRetentions);
  const [selectedId, setSelectedId] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("main");
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
    apiClient
      .getAllPages("/retenciones", { estado: "todos" })
      .then((items) => {
        if (!cancelled && items.length) {
          const next = items.map(mapRetention);
          setRetentions(next);
          setSelectedId(next[0].id);
        }
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
        `${retention.code} ${retention.description}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [retentions, searchTerm],
  );
  const selectedRetention =
    retentions.find((retention) => retention.id === selectedId) ?? null;
  const shownRetention = editing ? draft : selectedRetention;

  function selectRetention(id) {
    setSelectedId(id);
    setEditing(false);
    setDraft(null);
    setError("");
  }
  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function handleAdd() {
    setSelectedId(null);
    setDraft({
      ...emptyRetention,
      ranges: [{ minimum: 0, maximum: 0, percentage: 0 }],
    });
    setEditing(true);
    setActiveTab("main");
    setError("");
  }
  function handleEdit() {
    if (selectedRetention) {
      setDraft({
        ...selectedRetention,
        ranges: selectedRetention.ranges.map((range) => ({ ...range })),
      });
      setEditing(true);
      setError("");
    }
  }
  async function handleSave() {
    setError("");
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
      setDraft(null);
      setEditing(false);
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
    }
  }
  async function handleDelete() {
    if (!selectedId || !window.confirm("¿Deseas desactivar esta retención?"))
      return;
    try {
      await apiClient.delete(`/retenciones/${selectedId}`);
      setRetentions((current) =>
        current.map((item) =>
          item.id === selectedId ? { ...item, isActive: false } : item,
        ),
      );
    } catch (requestError) {
      setError(requestError.message);
      if (/sesión|inicia sesión|401|autentic/i.test(requestError.message))
        onRequestLogin();
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
            <button
              type="button"
              className="search-options"
              aria-label="Opciones de búsqueda"
            >
              <ChevronDown size={14} />
            </button>
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
                editing={editing}
                onChange={(ranges) => updateDraft("ranges", ranges)}
              />
            ) : (
              <RetentionMain
                retention={shownRetention}
                editing={editing}
                onChange={updateDraft}
              />
            )
          ) : (
            <div className="provider-tab-panel empty-provider-panel">
              <strong>Agrega una retención para comenzar.</strong>
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
              disabled={!selectedRetention}
            >
              <Edit3 size={14} /> Modificar
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedRetention}
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

function RetentionMain({ retention, editing, onChange }) {
  return (
    <div className="provider-tab-panel retention-main-panel">
      <div className="retention-form-grid">
        <RetentionField
          label="Sustraendo"
          value={retention.subtracting}
          editing={editing}
          onChange={(value) => onChange("subtracting", value)}
        />
        <RetentionField
          label="Base mínima"
          value={retention.minimumBase}
          editing={editing}
          onChange={(value) => onChange("minimumBase", value)}
        />
        <RetentionField
          label="Tipo operación"
          value={retention.operationCode}
          editing={editing}
          onChange={(value) => onChange("operationCode", value)}
        />
        <div className="retention-operation-description">
          {editing ? (
            <input
              className="detail-input"
              value={retention.operationDescription ?? ""}
              onChange={(event) =>
                onChange("operationDescription", event.target.value)
              }
            />
          ) : (
            retention.operationDescription
          )}
        </div>
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
function RetentionTable({ ranges, editing, onChange }) {
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
                    className="detail-input"
                    value={range.minimum}
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
                    className="detail-input"
                    value={range.maximum}
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
                    className="detail-input"
                    value={range.percentage}
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
function RetentionField({ label, value, editing, onChange }) {
  return (
    <div className="retention-field">
      <label>{label}</label>
      {editing ? (
        <input
          className="detail-input"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="detail-control">
          <span>{formatNumber(value)}</span>
        </div>
      )}
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
