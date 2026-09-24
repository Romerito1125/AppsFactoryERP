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
import { TransientMessage } from "@/components/desktop/transient-message";
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
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
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
      apiClient.getAllPages("/productos", { estado: "activos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
      apiClient.getAllPages("/creditos"),
      apiClient.getAllPages("/cuentas-bancarias", { estado: "activos" }),
    ])
      .then(
        ([
          clientsResult,
          productsResult,
          warehousesResult,
          creditsResult,
          bankAccountsResult,
        ]) => {
        if (cancelled) return;
        if (clientsResult.status === "rejected") throw clientsResult.reason;

        const clientItems = clientsResult.value;
        const productItems =
          productsResult.status === "fulfilled" ? productsResult.value : [];
        const warehouseItems =
          warehousesResult.status === "fulfilled"
            ? warehousesResult.value
            : [];
        const creditItems =
          creditsResult.status === "fulfilled" ? creditsResult.value : [];
        const bankItems =
          bankAccountsResult.status === "fulfilled"
            ? bankAccountsResult.value
            : [];
        const nextClients = clientItems.map(mapClient);
        setClients(nextClients);
        setProducts(productItems.filter(isActiveProduct));
        setWarehouses(warehouseItems.filter(isActive));
        const nextCredits = creditItems.map(mapCredit);
        setCredits(nextCredits);
        setBankAccounts(bankItems);
        const firstClientWithBalance = nextClients.find((client) =>
          nextCredits.some(
            (credit) =>
              credit.clientId === client.id &&
              credit.balance > 0,
          ),
        );
        setSelectedClientId(
          firstClientWithBalance?.id ?? nextClients[0]?.id ?? null,
        );

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
        const unavailable = [
          productsResult.status === "rejected" ? "productos" : null,
          warehousesResult.status === "rejected" ? "bodegas" : null,
        ].filter(Boolean);
        if (unavailable.length && creditsResult.status === "fulfilled") {
          setError(
            `Cuentas cargadas, pero no se pudieron consultar: ${unavailable.join(", ")}.`,
          );
          const failedResult = [productsResult, warehousesResult].find(
            (result) => result.status === "rejected",
          );
          if (isAuthError(failedResult?.reason)) onRequestLogin?.();
        }
      },
      )
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
  const selectedClientIndex = filteredClients.findIndex(
    (client) => client.id === selectedClientId,
  );
  const canMovePrevious = selectedClientIndex > 0;
  const canMoveNext =
    selectedClientIndex >= 0 &&
    selectedClientIndex < filteredClients.length - 1;
  const canEdit = canAccess?.("RECEIVABLES_EDIT") ?? true;
  const clientCredits = useMemo(
    () =>
      credits.filter(
        (credit) => !selectedClientId || credit.clientId === selectedClientId,
      ),
    [credits, selectedClientId],
  );
  const openCredits = clientCredits.filter((credit) =>
    credit.balance > 0 &&
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
    const firstProduct = products.find((product) => getDefaultPrice(product));
    setEditor({
      type: "credit",
      clientId: String(selectedClientId ?? ""),
      warehouseId: String(warehouses[0]?.id ?? ""),
      items: [createReceivableItem(firstProduct)],
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

  function updateCreditProduct(index, value) {
    const product = products.find(
      (item) => Number(item.id) === Number(value),
    );
    const price = getDefaultPrice(product);
    setEditor((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              productId: value,
              productPriceId: String(price?.id ?? ""),
            }
          : item,
      ),
    }));
  }

  function updateCreditItem(index, field, value) {
    setEditor((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function addCreditItem() {
    setEditor((current) => ({
      ...current,
      items: [...current.items, createReceivableItem()],
    }));
  }

  function removeCreditItem(index) {
    setEditor((current) => ({
      ...current,
      items:
        current.items.length > 1
          ? current.items.filter((_, itemIndex) => itemIndex !== index)
          : current.items,
    }));
  }

  async function saveEditor() {
    if (!canEdit) return;
    if (!editor) return;
    setSaving(true);
    setError("");
    try {
      if (editor.type === "credit") {
        if (!editor.clientId || !editor.warehouseId || !editor.dueDate) {
          throw new Error(
            "Selecciona cliente, bodega y fecha de vencimiento para crear la cuenta.",
          );
        }
        if (
          !editor.items?.length ||
          editor.items.some(
            (item) =>
              !item.productId ||
              !item.productPriceId ||
              !Number.isFinite(Number(item.quantity)) ||
              Number(item.quantity) <= 0,
          )
        ) {
          throw new Error(
            "Agrega al menos un producto con precio y cantidad válida.",
          );
        }
        const invoice = await apiClient.post("/facturas", {
          clientId: Number(editor.clientId),
          warehouseId: Number(editor.warehouseId),
          source: "ADMIN",
          saleMode: "CREDITO",
          items: editor.items.map((item) => ({
            productId: Number(item.productId),
            productPriceId: Number(item.productPriceId),
            warehouseId: Number(editor.warehouseId),
            quantity: Number(item.quantity),
          })),
        });
        const saved = await apiClient.post(`/facturas/${invoice.id}/credito`, {
          dueDate: new Date(`${editor.dueDate}T00:00:00`).toISOString(),
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
                onClick={() => {
                  setActiveTab(id);
                  setError("");
                }}
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
              products={products}
              warehouses={warehouses}
              saving={saving}
              onChange={updateEditor}
              onProductChange={updateCreditProduct}
              onItemChange={updateCreditItem}
              onAddItem={addCreditItem}
              onRemoveItem={removeCreditItem}
              onSave={saveEditor}
              onCancel={() => {
                setEditor(null);
                setError("");
              }}
            />
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
            onClick={startCredit}
            disabled={!canEdit}
          >
            <Plus size={14} /> Nueva venta a crédito
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
            disabled={!canMovePrevious}
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <button
            type="button"
            className="muted-action"
            onClick={() => moveClient(1)}
            disabled={!canMoveNext}
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
      "Nueva venta a crédito",
      Plus,
      onNewCredit,
      "Crear una factura con uno o varios productos.",
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
              disabled={
                (requiresEdit && !canEdit) ||
                (label === "Pagos y abonos" && !open.length)
              }
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
          {pending ? "Pendiente" : "Estado de cuenta"} · selecciona una fila y
          usa “Abonar”; también puedes hacer doble clic{canEdit ? "" : " (solo lectura)"}
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
                        {credit.totalAmount < 0
                          ? "Anticipo"
                          : statusLabels[status] ?? status}
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
  products,
  warehouses,
  saving,
  onChange,
  onProductChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
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
              <EditorSelect
                label="Bodega"
                value={editor.warehouseId}
                options={warehouses
                  .filter((warehouse) => warehouse.isActive !== false)
                  .map((warehouse) => ({
                    value: String(warehouse.id),
                    label:
                      warehouse.location ??
                      warehouse.name ??
                      `Bodega #${warehouse.id}`,
                  }))}
                onChange={(value) => onChange("warehouseId", value)}
              />
              <div className="purchase-items-editor editor-field-wide receivable-items-editor">
                <div className="purchase-items-heading">
                  <span>Productos de la cuenta</span>
                  <button type="button" onClick={onAddItem}>
                    <Plus size={13} /> Agregar producto
                  </button>
                </div>
                <div className="purchase-items-list">
                  {editor.items.map((item, index) => {
                    const product = products.find(
                      (candidate) =>
                        Number(candidate.id) === Number(item.productId),
                    );
                    const productPrices = activeProductPrices(product);
                    return (
                      <div
                        className="purchase-item-row"
                        key={`receivable-item-${index}`}
                      >
                        <EditorSelect
                          label={`Producto ${index + 1}`}
                          value={item.productId}
                          options={products
                            .filter((candidate) =>
                              activeProductPrices(candidate).length,
                            )
                            .map((candidate) => ({
                              value: String(candidate.id),
                              label: `${candidate.code ?? candidate.id} · ${candidate.name}`,
                            }))}
                          onChange={(value) => onProductChange(index, value)}
                        />
                        <EditorSelect
                          label="Precio"
                          value={item.productPriceId}
                          options={productPrices.map((price) => ({
                            value: String(price.id),
                            label: `${price.name ?? "Precio"} · ${formatCurrency(price.price)}`,
                          }))}
                          onChange={(value) =>
                            onItemChange(index, "productPriceId", value)
                          }
                        />
                        <EditorField
                          label="Cantidad"
                          value={item.quantity}
                          type="number"
                          onChange={(value) =>
                            onItemChange(index, "quantity", value)
                          }
                        />
                        <button
                          type="button"
                          className="purchase-item-remove"
                          onClick={() => onRemoveItem(index)}
                          disabled={editor.items.length === 1}
                          aria-label={`Quitar producto ${index + 1}`}
                          title="Quitar producto"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
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
        {editor.type === "credit" && (
          <div className="payable-editor-total">
            <span>Total de la cuenta</span>
            <strong>{formatCurrency(receivableEditorTotal(editor, products))}</strong>
          </div>
        )}
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

function isActive(item) {
  return item?.isActive !== false && item?.deletedAt == null;
}

function isActiveProduct(product) {
  return isActive(product) && activeProductPrices(product).length > 0;
}

function activeProductPrices(product) {
  return (product?.prices ?? []).filter(isActive);
}

function getDefaultPrice(product) {
  return (
    activeProductPrices(product).find((price) => price.isDefault) ??
    activeProductPrices(product)[0] ??
    null
  );
}

function createReceivableItem(product) {
  const price = getDefaultPrice(product);
  return {
    productId: String(product?.id ?? ""),
    productPriceId: String(price?.id ?? ""),
    quantity: "1",
  };
}

function receivableEditorTotal(editor, products) {
  return (editor.items ?? []).reduce((sum, item) => {
    const product = products.find(
      (candidate) => Number(candidate.id) === Number(item.productId),
    );
    const price = activeProductPrices(product).find(
      (candidate) => Number(candidate.id) === Number(item.productPriceId),
    );
    const subtotal = Number(price?.price ?? 0) * Number(item.quantity ?? 0);
    const taxRate = Number(product?.taxRate ?? 0);
    return sum + subtotal * (1 + taxRate / 100);
  }, 0);
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
