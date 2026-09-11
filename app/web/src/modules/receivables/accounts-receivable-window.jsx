import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  CreditCard,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { apiClient } from "@/lib/api-client";

const tabs = [
  ["operations", "Operaciones"],
  ["statement", "Estado de cuenta"],
  ["pending", "Pendiente"],
  ["due", "Vencimientos"],
];

const statusLabels = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Abono parcial",
  PAGADA: "Pagada",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
};

export function AccountsReceivableWindow({
  onClose,
  onRequestLogin,
  canAccess,
}) {
  const [clients, setClients] = useState([]);
  const [credits, setCredits] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedCreditId, setSelectedCreditId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("operations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      apiClient.getAllPages("/clientes", { estado: "todos" }),
      apiClient.getAllPages("/creditos"),
      apiClient.getAllPages("/cuentas-bancarias", { estado: "activos" }),
    ])
      .then(([clientsResult, creditsResult, bankAccountsResult]) => {
        if (cancelled) return;
        if (clientsResult.status === "rejected") throw clientsResult.reason;

        const clientItems = clientsResult.value;
        const creditItems =
          creditsResult.status === "fulfilled" ? creditsResult.value : [];
        const bankItems =
          bankAccountsResult.status === "fulfilled"
            ? bankAccountsResult.value
            : [];
        const nextClients = clientItems.map(mapClient);
        setClients(nextClients);
        setCredits(creditItems.map(mapCredit));
        setBankAccounts(bankItems);
        setSelectedClientId(nextClients[0]?.id ?? null);

        if (creditsResult.status === "rejected") {
          setError(
            `Clientes cargados, pero no se pudieron consultar los créditos: ${creditsResult.reason?.message ?? "error desconocido"}`,
          );
          if (isAuthError(creditsResult.reason)) onRequestLogin?.();
        } else if (bankAccountsResult.status === "rejected") {
          setError(
            "Cuentas cargadas. Las cuentas bancarias no están disponibles; podrás registrar pagos sin consignación.",
          );
        }
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError.message);
        if (isAuthError(requestError)) onRequestLogin?.();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onRequestLogin]);

  const filteredClients = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) =>
      `${client.identification} ${clientName(client)}`
        .toLowerCase()
        .includes(query),
    );
  }, [clients, searchTerm]);

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? null;
  const canEdit = canAccess?.("RECEIVABLES_EDIT") ?? true;
  const clientCredits = useMemo(
    () =>
      credits.filter(
        (credit) => !selectedClientId || credit.clientId === selectedClientId,
      ),
    [credits, selectedClientId],
  );
  const openCredits = clientCredits.filter((credit) =>
    ["PENDIENTE", "PARCIAL", "VENCIDA"].includes(
      credit.reportedStatus ?? credit.status,
    ),
  );
  const balance = openCredits.reduce((sum, credit) => sum + credit.balance, 0);
  const advanceBalance = clientCredits
    .filter((credit) => credit.totalAmount < 0)
    .reduce((sum, credit) => sum + Math.abs(credit.balance), 0);

  function selectClient(id) {
    setSelectedClientId(id);
    setSelectedCreditId(null);
    setEditor(null);
    setError("");
  }

  function startCredit() {
    if (!canEdit) return;
    setEditor({
      type: "credit",
      clientId: String(selectedClientId ?? ""),
      totalAmount: "",
      dueDate: todayValue(),
    });
    setError("");
  }

  function startPayment(credit = null) {
    if (!canEdit) return;
    const target = credit ?? clientCredits.find((item) => item.balance > 0);
    if (!target) {
      setError(
        "Selecciona un crédito con saldo pendiente para registrar un pago.",
      );
      return;
    }
    setSelectedCreditId(target.id);
    setEditor({
      type: "payment",
      creditId: String(target.id),
      amount: String(target.balance),
      bankAccountId: "",
      notes: "",
    });
    setError("");
  }

  function updateEditor(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  async function saveEditor() {
    if (!canEdit) return;
    if (!editor) return;
    setSaving(true);
    setError("");
    try {
      if (editor.type === "credit") {
        if (!editor.clientId || Number(editor.totalAmount) <= 0) {
          throw new Error("Selecciona un cliente e ingresa un monto válido.");
        }
        const saved = await apiClient.post("/creditos", {
          clientId: Number(editor.clientId),
          totalAmount: Number(editor.totalAmount),
          dueDate: editor.dueDate,
        });
        const normalized = mapCredit(saved);
        setCredits((current) => [normalized, ...current]);
        setSelectedClientId(normalized.clientId);
        setSelectedCreditId(normalized.id);
      } else {
        if (Number(editor.amount) <= 0) {
          throw new Error("Ingresa un monto de pago válido.");
        }
        const saved = await apiClient.post(
          `/creditos/${editor.creditId}/pagos`,
          {
            amount: Number(editor.amount),
            bankAccountId: editor.bankAccountId
              ? Number(editor.bankAccountId)
              : undefined,
            notes: editor.notes.trim() || undefined,
          },
        );
        const normalized = mapCredit(saved);
        setCredits((current) =>
          current.map((credit) =>
            credit.id === normalized.id ? normalized : credit,
          ),
        );
      }
      setEditor(null);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  function moveClient(offset) {
    const index = filteredClients.findIndex(
      (client) => client.id === selectedClientId,
    );
    const next = filteredClients[index + offset];
    if (next) selectClient(next.id);
  }

  return (
    <section
      className={`provider-window receivable-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Ventana de cuentas por cobrar"
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle receivable-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <CreditCard size={14} />
        </div>
        <strong>CUENTAS POR COBRAR</strong>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar cuentas por cobrar"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content receivable-content">
        <aside className="provider-list-panel">
          <div className="provider-list-toolbar">
            <label htmlFor="receivable-client-search">Buscar</label>
            <div className="provider-search-field">
              <Search size={15} />
              <input
                id="receivable-client-search"
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
            className="provider-table receivable-client-table"
            role="table"
            aria-label="Clientes con cuentas por cobrar"
          >
            <div className="provider-table-head" role="row">
              <span>Código</span>
              <span>Cliente</span>
            </div>
            {filteredClients.map((client) => (
              <button
                className={
                  client.id === selectedClientId
                    ? "provider-table-row is-selected"
                    : "provider-table-row"
                }
                type="button"
                role="row"
                key={client.id}
                onClick={() => selectClient(client.id)}
              >
                <span>{client.identification}</span>
                <span>{clientName(client)}</span>
              </button>
            ))}
            {loading && <div className="window-state">Cargando cuentas…</div>}
            {!loading && !filteredClients.length && (
              <div className="window-state">No hay clientes para mostrar.</div>
            )}
            <div className="provider-empty-rows" aria-hidden="true">
              {Array.from({
                length: Math.max(0, 9 - filteredClients.length),
              }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
        </aside>
        <div className="provider-detail-panel receivable-detail-panel">
          <div className="payable-heading receivable-heading">
            <div>
              <strong>
                {selectedClient
                  ? `${selectedClient.identification} ${clientName(selectedClient)}`
                  : "Sin cliente seleccionado"}
              </strong>
              <span>
                {selectedClient?.address ??
                  "Consulta y administra facturas, créditos y pagos del cliente."}
              </span>
            </div>
            <div className="payable-balance-grid">
              <BalanceField
                label="Saldo anticipos"
                value={advanceBalance}
                muted
              />
              <BalanceField label="Saldo" value={balance} accent />
            </div>
          </div>
          <div className="provider-tabs payable-tabs receivable-tabs">
            {tabs.map(([id, label]) => (
              <button
                className={
                  activeTab === id ? "provider-tab is-active" : "provider-tab"
                }
                type="button"
                key={id}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {activeTab === "operations" && (
            <ReceivableOperations
              credits={clientCredits}
              onNewCredit={startCredit}
              onPayment={() => startPayment()}
              onStatement={() => setActiveTab("statement")}
              canEdit={canEdit}
            />
          )}
          {activeTab === "statement" && (
            <ReceivableStatement
              credits={clientCredits}
              selectedCreditId={selectedCreditId}
              onSelect={setSelectedCreditId}
              onPayment={startPayment}
              canEdit={canEdit}
            />
          )}
          {activeTab === "pending" && (
            <ReceivableStatement
              credits={openCredits}
              selectedCreditId={selectedCreditId}
              onSelect={setSelectedCreditId}
              onPayment={startPayment}
              pending
              canEdit={canEdit}
            />
          )}
          {activeTab === "due" && <ReceivableAging credits={openCredits} />}
          {editor && (
            <ReceivableEditor
              editor={editor}
              clients={clients}
              credits={clientCredits}
              bankAccounts={bankAccounts}
              saving={saving}
              onChange={updateEditor}
              onSave={saveEditor}
              onCancel={() => setEditor(null)}
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
          <button
            type="button"
            onClick={startCredit}
            disabled={!selectedClientId || !canEdit}
          >
            <Plus size={14} /> Nueva cuenta
          </button>
          <button
            type="button"
            onClick={() => startPayment()}
            disabled={!openCredits.length || !canEdit}
          >
            <Banknote size={14} /> Registrar pago
          </button>
        </div>
        <div className="provider-navigation-actions">
          <button
            type="button"
            className="muted-action"
            onClick={() => moveClient(-1)}
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <button
            type="button"
            className="muted-action"
            onClick={() => moveClient(1)}
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

function ReceivableOperations({
  credits,
  onNewCredit,
  onPayment,
  onStatement,
  canEdit,
}) {
  const open = credits.filter((credit) => credit.balance > 0);
  const operations = [
    [
      "Facturas a crédito",
      FileText,
      onStatement,
      "Revisar documentos con saldo pendiente.",
    ],
    [
      "Giros o cuotas",
      CalendarDays,
      onStatement,
      "Consultar fechas de vencimiento.",
    ],
    [
      "Pagos y abonos",
      Banknote,
      onPayment,
      "Registrar un abono del cliente.",
      true,
    ],
    [
      "Nota crédito / Anticipo",
      Plus,
      onNewCredit,
      "Crear un nuevo crédito directo.",
      true,
    ],
  ];
  return (
    <div className="provider-tab-panel payable-operations-panel receivable-operations-panel">
      <div className="payable-section-heading">
        <strong>Operaciones a realizar</strong>
        <span>
          {open.length} cuenta(s) abierta(s) para el cliente seleccionado.
        </span>
      </div>
      <div className="payable-operation-grid">
        {operations.map(
          ([label, Icon, onClick, description, requiresEdit = false]) => (
          <button
            type="button"
            className="payable-operation-card"
            key={label}
            onClick={onClick}
            disabled={requiresEdit && !canEdit}
          >
            <span className="payable-operation-icon">
              <Icon size={15} />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <ChevronRight size={14} />
          </button>
          ),
        )}
      </div>
    </div>
  );
}

function ReceivableStatement({
  credits,
  selectedCreditId,
  onSelect,
  onPayment,
  pending = false,
  canEdit,
}) {
  return (
    <div className="provider-tab-panel data-panel payable-statement-panel">
      <div className="payable-filter-row">
        <label>Movimientos</label>
        <span>
          {pending
            ? "Créditos pendientes de cobro"
            : "Facturas, créditos y pagos del cliente"}
        </span>
      </div>
      <div className="provider-data-table-wrap">
        <div className="provider-table-caption">
          {pending ? "Pendiente" : "Estado de cuenta"} · doble clic para
          registrar un pago{canEdit ? "" : " (solo lectura)"}
        </div>
        {credits.length ? (
          <table className="provider-data-table payable-data-table receivable-data-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Estado</th>
                <th>Emisión</th>
                <th>Vence</th>
                <th>Total</th>
                <th>Abonado</th>
                <th>Saldo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {credits.map((credit) => {
                const status = credit.reportedStatus ?? credit.status;
                return (
                  <tr
                    key={credit.id}
                    className={
                      selectedCreditId === credit.id ? "is-row-selected" : ""
                    }
                    onClick={() => onSelect(credit.id)}
                    onDoubleClick={canEdit ? () => onPayment(credit) : undefined}
                  >
                    <td>
                      {credit.invoice?.consecutive ??
                        `CR-${String(credit.id).padStart(6, "0")}`}
                    </td>
                    <td>
                      <span
                        className={`status-pill status-${status.toLowerCase()}`}
                      >
                        {statusLabels[status] ?? status}
                      </span>
                    </td>
                    <td>{formatDate(credit.createdAt)}</td>
                    <td>{formatDate(credit.dueDate)}</td>
                    <td>{formatCurrency(credit.totalAmount)}</td>
                    <td>{formatCurrency(credit.paidAmount)}</td>
                    <td>{formatCurrency(credit.balance)}</td>
                    <td>
                      {credit.balance > 0 && (
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={(event) => {
                            event.stopPropagation();
                            onPayment(credit);
                          }}
                        >
                          Abonar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="table-empty">
            No hay movimientos para este cliente.
          </div>
        )}
      </div>
    </div>
  );
}

function ReceivableAging({ credits }) {
  const overdue = credits.filter((credit) => dueBucket(credit) === "overdue");
  const upcoming = credits.filter((credit) => dueBucket(credit) === "upcoming");
  const noDate = credits.filter((credit) => dueBucket(credit) === "no-date");
  const groups = [
    ["Vencido", overdue, "is-overdue"],
    ["Por vencer", upcoming, "is-upcoming"],
    ["Sin fecha", noDate, "is-no-date"],
  ];
  const total = credits.reduce((sum, credit) => sum + credit.balance, 0);
  const max = Math.max(...credits.map((credit) => credit.balance), 0);
  return (
    <div className="provider-tab-panel payable-aging-panel receivable-aging-panel">
      <div className="payable-section-heading">
        <strong>Análisis de vencimientos</strong>
        <span>Saldo pendiente agrupado por fecha real de vencimiento.</span>
      </div>
      <div className="payable-aging-grid">
        {groups.map(([label, items, className]) => (
          <AgingSummaryCard
            key={label}
            label={label}
            items={items}
            className={className}
          />
        ))}
      </div>
      <div className="payable-chart">
        <div className="payable-chart-heading">
          <strong>Saldo por crédito</strong>
          <span>{formatCurrency(total)} pendiente</span>
        </div>
        {credits.length ? (
          credits
            .slice()
            .sort((a, b) => b.balance - a.balance)
            .map((credit) => (
              <div className="payable-chart-row" key={credit.id}>
                <div className="payable-chart-label">
                  <strong>
                    {credit.invoice?.consecutive ?? `CR-${credit.id}`}
                  </strong>
                  <span>
                    {formatDate(credit.dueDate)} ·{" "}
                    {statusLabels[credit.reportedStatus ?? credit.status]}
                  </span>
                </div>
                <div className="payable-chart-track">
                  <span
                    className={`is-${dueBucket(credit)}`}
                    style={{
                      width: `${max ? Math.max(8, (credit.balance / max) * 100) : 0}%`,
                    }}
                  />
                </div>
                <strong className="payable-chart-amount">
                  {formatCurrency(credit.balance)}
                </strong>
              </div>
            ))
        ) : (
          <div className="table-empty">No hay saldos pendientes.</div>
        )}
      </div>
    </div>
  );
}

function AgingSummaryCard({ label, items, className }) {
  return (
    <div className={`payable-aging-card ${className}`}>
      <span>{label}</span>
      <strong>
        {formatCurrency(items.reduce((sum, credit) => sum + credit.balance, 0))}
      </strong>
      <small>{items.length} crédito(s)</small>
    </div>
  );
}

function ReceivableEditor({
  editor,
  clients,
  credits,
  bankAccounts,
  saving,
  onChange,
  onSave,
  onCancel,
}) {
  const selectedCredit = credits.find(
    (credit) => String(credit.id) === String(editor.creditId),
  );
  return (
    <div className="payable-editor-backdrop">
      <div
        className="payable-editor receivable-editor"
        role="dialog"
        aria-modal="true"
      >
        <header className="inline-editor-title">
          <strong>
            {editor.type === "credit"
              ? "Nueva cuenta por cobrar"
              : "Registrar pago"}
          </strong>
          <button type="button" onClick={onCancel} aria-label="Cerrar editor">
            <X size={14} />
          </button>
        </header>
        <div className="payable-editor-grid">
          {editor.type === "credit" ? (
            <>
              <EditorSelect
                label="Cliente"
                value={editor.clientId}
                options={clients
                  .filter((client) => client.isActive !== false)
                  .map((client) => ({
                    value: String(client.id),
                    label: `${client.identification} · ${clientName(client)}`,
                  }))}
                onChange={(value) => onChange("clientId", value)}
                wide
              />
              <EditorField
                label="Monto total"
                value={editor.totalAmount}
                type="number"
                onChange={(value) => onChange("totalAmount", value)}
              />
              <EditorField
                label="Vencimiento"
                value={editor.dueDate}
                type="date"
                onChange={(value) => onChange("dueDate", value)}
              />
            </>
          ) : (
            <>
              <EditorSelect
                label="Crédito"
                value={editor.creditId}
                options={credits
                  .filter((credit) => credit.balance > 0)
                  .map((credit) => ({
                    value: String(credit.id),
                    label: `${credit.invoice?.consecutive ?? `CR-${credit.id}`} · saldo ${formatCurrency(credit.balance)}`,
                  }))}
                onChange={(value) => onChange("creditId", value)}
                wide
              />
              <EditorField
                label="Monto del pago"
                value={editor.amount}
                type="number"
                onChange={(value) => onChange("amount", value)}
              />
              <EditorSelect
                label="Cuenta bancaria"
                value={editor.bankAccountId}
                options={bankAccounts.map((account) => ({
                  value: String(account.id),
                  label:
                    account.name ??
                    account.accountNumber ??
                    `Cuenta #${account.id}`,
                }))}
                emptyLabel="Sin consignación"
                onChange={(value) => onChange("bankAccountId", value)}
              />
              <label className="payable-notes-field">
                <span>Comentarios</span>
                <textarea
                  value={editor.notes}
                  onChange={(event) => onChange("notes", event.target.value)}
                />
              </label>
              {selectedCredit && (
                <div className="receivable-payment-hint">
                  Saldo disponible:{" "}
                  <strong>{formatCurrency(selectedCredit.balance)}</strong>
                </div>
              )}
            </>
          )}
        </div>
        <div className="inline-editor-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? (
              "Guardando…"
            ) : (
              <>
                <Check size={13} /> Guardar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorField({ label, value, type = "text", onChange }) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EditorSelect({
  label,
  value,
  options,
  onChange,
  emptyLabel = "Selecciona",
  wide = false,
}) {
  return (
    <label className={`editor-field ${wide ? "editor-field-wide" : ""}`}>
      <span>{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {options.map((item) => (
          <option value={item.value} key={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BalanceField({ label, value, muted }) {
  return (
    <div className={`payable-balance ${muted ? "is-muted" : ""}`}>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}

function mapClient(client) {
  return { ...client, id: Number(client.id) };
}
function mapCredit(credit) {
  return {
    ...credit,
    id: Number(credit.id),
    clientId: Number(credit.clientId),
    totalAmount: Number(credit.totalAmount ?? 0),
    paidAmount: Number(credit.paidAmount ?? 0),
    balance: Number(credit.balance ?? 0),
  };
}
function clientName(client) {
  return (
    client.name ??
    ([client.firstName, client.lastName].filter(Boolean).join(" ") ||
      `Cliente #${client.id}`)
  );
}
function dueBucket(credit) {
  if (!credit.dueDate) return "no-date";
  if (
    (credit.reportedStatus ?? credit.status) === "VENCIDA" ||
    new Date(credit.dueDate) < new Date()
  )
    return "overdue";
  return "upcoming";
}
function todayValue() {
  return new Date().toISOString().slice(0, 10);
}
function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}
function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO").format(new Date(value));
}
function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
