import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Check, CircleX, FileText, Search, X } from "lucide-react";

import {
  AccountOperations,
  AgingAnalysis,
  LedgerPanel,
  PendingList,
} from "@/components/accounts/account-panels";
import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { AllocationFlow } from "@/components/payments/allocation-flow";
import { NotesCenter } from "@/components/accounts/notes-center";
import { printReceipt } from "@/components/payments/print-receipt";
import { ReceiptEditDialog } from "@/components/payments/receipt-dialogs";
import { openSupportData } from "@/components/payments/support-file";
import { apiClient } from "@/lib/api-client";
import { formatCop } from "@/lib/cop";

// Mismas pestañas y pantallas que Cuentas por cobrar (captura 34 del PDF).
const tabs = [
  ["operations", "Operaciones"],
  ["statement", "Estado de cuenta"],
  ["pending", "Pendiente"],
  ["due", "Vencimientos"],
];

export function AccountsPayableWindow({ onClose, onRequestLogin, canAccess }) {
  const [providers, setProviders] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [listMode, setListMode] = useState("name");
  const [activeTab, setActiveTab] = useState("operations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentFlow, setPaymentFlow] = useState(null);
  const [receiptEdit, setReceiptEdit] = useState(null);
  const [statementKey, setStatementKey] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [notesMode, setNotesMode] = useState(null);
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [saving, setSaving] = useState(false);
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      apiClient.getAllPages("/proveedores", { estado: "todos" }),
      apiClient.getAllPages("/compras"),
      apiClient.getAllPages("/cuentas-bancarias", { estado: "activos" }),
    ])
      .then(([providersResult, ordersResult, bankAccountsResult]) => {
        if (cancelled) return;
        if (providersResult.status === "rejected") throw providersResult.reason;
        const nextProviders = providersResult.value.map(mapProvider);
        setProviders(nextProviders);
        setOrders(ordersResult.status === "fulfilled" ? ordersResult.value : []);
        setBankAccounts(
          bankAccountsResult.status === "fulfilled" ? bankAccountsResult.value : [],
        );
        setSelectedProviderId(nextProviders[0]?.id ?? null);
        const unavailable = [
          ordersResult.status === "rejected" ? "compras" : null,
          bankAccountsResult.status === "rejected" ? "cuentas bancarias" : null,
        ].filter(Boolean);
        if (unavailable.length) {
          setError(
            `Proveedores cargados, pero no se pudieron consultar: ${unavailable.join(", ")}.`,
          );
          const failed = [ordersResult, bankAccountsResult].find(
            (result) => result.status === "rejected",
          );
          if (isAuthError(failed?.reason)) onRequestLogin?.();
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

  const filteredProviders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return providers;
    return providers.filter((provider) => {
      const haystack =
        listMode === "id"
          ? provider.taxId
          : listMode === "key"
            ? `${provider.phone} ${provider.code}`
            : provider.name;
      return String(haystack).toLowerCase().includes(query);
    });
  }, [providers, searchTerm, listMode]);

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const selectedProviderIndex = filteredProviders.findIndex(
    (provider) => provider.id === selectedProviderId,
  );
  const canMovePrevious = selectedProviderIndex > 0;
  const canMoveNext =
    selectedProviderIndex >= 0 &&
    selectedProviderIndex < filteredProviders.length - 1;
  const canEdit = canAccess?.("PAYABLES_EDIT") ?? true;
  const providerOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          !selectedProviderId || Number(order.providerId) === selectedProviderId,
      ),
    [orders, selectedProviderId],
  );
  const payableOrders = providerOrders.filter(
    (order) => order.status === "RECIBIDA" && orderBalance(order) > 0,
  );
  const providerTotal = payableOrders.reduce(
    (sum, order) => sum + orderBalance(order),
    0,
  );
  const pendingRows = payableOrders.map((order) => ({
    id: order.id,
    number: order.consecutive ?? `OC-${order.id}`,
    detail: order.externalReference
      ? `FAC ${order.externalReference}`
      : `Compra ${order.consecutive ?? order.id}`,
    dueAt: order.expectedAt,
    issuedAt: order.receivedAt ?? order.orderedAt ?? order.createdAt,
    amount: Number(order.payableTotal ?? 0) || Number(order.total ?? 0),
    balance: orderBalance(order),
  }));
  const agingRows = payableOrders.map((order) => ({
    balance: orderBalance(order),
    dueAt: order.expectedAt,
  }));
  // «Saldo anticipos» del proveedor: anticipos vigentes sin aplicar.
  useEffect(() => {
    let cancelled = false;
    if (!selectedProviderId) return undefined;
    apiClient
      .get("/notas", { side: "PAGAR", providerId: selectedProviderId })
      .then((rows) => {
        if (cancelled) return;
        setAdvanceBalance(
          (Array.isArray(rows) ? rows : [])
            .filter((note) => note.kind === "ANTICIPO" && note.status === "VIGENTE")
            .reduce((sum, note) => sum + Number(note.balance), 0),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedProviderId, statementKey, notesMode]);

  const loadStatement = useCallback(
    (params) =>
      selectedProvider
        ? apiClient.get(`/recibos/estado-cuenta/proveedor/${selectedProvider.id}`, params)
        : Promise.resolve(null),
    [selectedProvider],
  );

  function selectProvider(id) {
    setSelectedProviderId(id);
    setPaymentFlow(null);
    setError("");
  }

  function startPayment(order = null) {
    if (!selectedProvider) return;
    if (!canEdit) {
      setError("Tu usuario no tiene permiso para registrar pagos.");
      return;
    }
    if (!payableOrders.length) {
      setError("El proveedor no tiene compras recibidas con saldo pendiente.");
      return;
    }
    if (!bankAccounts.length) {
      setError("Crea una cuenta bancaria activa antes de registrar un pago.");
      return;
    }
    setPaymentFlow({
      orderId: order?.id ?? null,
      documentNumber: `PG-${selectedProvider.id}-${Date.now()}`,
    });
    setError("");
  }

  async function finishPayment(receipt) {
    setPaymentFlow(null);
    try {
      setOrders(await apiClient.getAllPages("/compras"));
    } catch (requestError) {
      setError(requestError.message);
    }
    setStatementKey((key) => key + 1);
    setActiveTab("statement");
    setNotice(
      `Pago ${receipt.documentNumber} registrado por ${formatCop(receipt.totalAmount)}; el banco quedó actualizado.`,
    );
  }

  async function openReceipt(receiptId, mode) {
    try {
      const receipt = await apiClient.get(`/recibos/${receiptId}`);
      if (mode === "print") {
        printReceipt(receipt, { party: selectedProvider?.name ?? "", copies: 1 });
      } else if (mode === "support") {
        if (receipt.supportData) {
          await openSupportData(receipt.supportData);
        } else {
          setReceiptEdit({ receipt, error: "Este recibo no tiene soporte. Puedes adjuntarlo y guardar." });
        }
      } else {
        setReceiptEdit({ receipt, error: "" });
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function saveReceiptEdit(changes) {
    setSaving(true);
    try {
      await apiClient.patch(`/recibos/${receiptEdit.receipt.id}`, changes);
      setReceiptEdit(null);
      setStatementKey((key) => key + 1);
      setNotice("Pago actualizado; el cambio quedó en la auditoría.");
    } catch (requestError) {
      setReceiptEdit((current) => ({ ...current, error: requestError.message }));
    } finally {
      setSaving(false);
    }
  }

  function moveProvider(offset) {
    const next = filteredProviders[selectedProviderIndex + offset];
    if (next) selectProvider(next.id);
  }

  return (
    <section
      className={`provider-window payable-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Ventana de cuentas por pagar"
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle payable-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <FileText size={14} />
        </div>
        <strong>CUENTAS POR PAGAR</strong>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar cuentas por pagar"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content payable-content">
        <aside className="provider-list-panel">
          <div className="saint-list-tabs" role="tablist">
            {[
              ["id", "ID Fiscal"],
              ["name", "Descripción"],
              ["key", "Clave"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={listMode === id}
                className={listMode === id ? "is-active" : ""}
                onClick={() => setListMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="provider-list-toolbar">
            <label htmlFor="payable-provider-search">Buscar</label>
            <div className="provider-search-field">
              <Search size={15} />
              <input
                id="payable-provider-search"
                aria-label="Buscar proveedor"
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
            className="provider-table payable-provider-table"
            role="table"
            aria-label="Proveedores con cuentas por pagar"
          >
            <div className="provider-table-head" role="row">
              <span>Código</span>
              <span>Descripción</span>
            </div>
            {filteredProviders.map((provider) => (
              <div
                className={
                  provider.id === selectedProviderId
                    ? "provider-table-row is-selected"
                    : "provider-table-row"
                }
                role="row"
                tabIndex={0}
                key={provider.id}
                onClick={() => selectProvider(provider.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectProvider(provider.id);
                  }
                }}
              >
                <span>{provider.code}</span>
                <span>{provider.name}</span>
              </div>
            ))}
            {loading && <div className="window-state">Cargando cuentas…</div>}
            {!loading && !filteredProviders.length && (
              <div className="window-state">No hay proveedores para mostrar.</div>
            )}
            <div className="provider-empty-rows" aria-hidden="true">
              {Array.from({
                length: Math.max(0, 9 - filteredProviders.length),
              }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
          <div className="saint-list-buttons">
            <button type="button" onClick={() => moveProvider(-1)} disabled={!canMovePrevious}>
              Anterior
            </button>
            <button type="button" onClick={() => moveProvider(1)} disabled={!canMoveNext}>
              Próximo
            </button>
            <button type="button" onClick={() => setInfoOpen(true)} disabled={!selectedProvider}>
              Información
            </button>
          </div>
        </aside>
        <div className="provider-detail-panel payable-detail-panel">
          <div className="payable-heading saint-heading">
            <div>
              <strong>
                {selectedProvider
                  ? `${selectedProvider.taxId || selectedProvider.id} ${selectedProvider.name}`
                  : "Sin proveedor seleccionado"}
              </strong>
              <span>{selectedProvider?.address ?? ""}</span>
              <span>{selectedProvider?.phone ?? ""}</span>
            </div>
            <div className="payable-balance-grid">
              <BalanceField label="Saldo anticipos" value={advanceBalance} muted />
              <BalanceField label="Saldo" value={providerTotal} accent />
            </div>
          </div>
          <div className="provider-tabs payable-tabs">
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
            <AccountOperations
              kind="pagar"
              onInvoices={() => setActiveTab("statement")}
              onSchedule={() => setActiveTab("pending")}
              onPayment={() => startPayment()}
              onDebitNotes={() => setNotesMode("debito")}
              onCreditNotes={() => setNotesMode("credito")}
              onAdvances={() => setNotesMode("anticipo")}
              onVoidNotes={() => setNotesMode("anular")}
            />
          )}
          {notesMode && selectedProvider && (
            <NotesCenter
              side="pagar"
              mode={notesMode}
              party={{ id: selectedProvider.id, name: selectedProvider.name }}
              documents={payableOrders.map((order) => ({
                id: order.id,
                label: order.consecutive ?? `OC-${order.id}`,
                balance: orderBalance(order),
              }))}
              bankAccounts={bankAccounts}
              canEdit={canEdit}
              onClose={() => setNotesMode(null)}
              onChanged={async (message) => {
                try {
                  setOrders(await apiClient.getAllPages("/compras"));
                } catch (requestError) {
                  setError(requestError.message);
                }
                setStatementKey((key) => key + 1);
                setNotice(message);
              }}
            />
          )}
          {activeTab === "statement" && (
            <LedgerPanel
              key={selectedProvider?.id ?? "none"}
              load={loadStatement}
              refreshKey={statementKey}
              canEdit={canEdit}
              onPrint={(receiptId) => openReceipt(receiptId, "print")}
              onEdit={(receiptId) => openReceipt(receiptId, "edit")}
              onSupport={(receiptId) =>
                openReceipt(receiptId, "support").catch((requestError) =>
                  setError(requestError.message),
                )
              }
              onError={setError}
            />
          )}
          {activeTab === "pending" && (
            <PendingList
              rows={pendingRows}
              canEdit={canEdit}
              onPay={(row) => startPayment(payableOrders.find((order) => order.id === row.id))}
            />
          )}
          {activeTab === "due" && <AgingAnalysis rows={agingRows} />}
          {paymentFlow && selectedProvider && (
            <AllocationFlow
              title="PAGOS O ABONOS A CUENTAS"
              party={selectedProvider.name}
              rows={payableOrders.map((order) => ({
                id: order.id,
                number: order.consecutive ?? `OC-${order.id}`,
                issuedAt: order.receivedAt ?? order.orderedAt ?? order.createdAt,
                dueAt: order.expectedAt,
                balance: orderBalance(order),
              }))}
              initialId={paymentFlow.orderId}
              bankAccounts={bankAccounts}
              initialDocumentNumber={paymentFlow.documentNumber}
              initialDetail={`Pago de cuenta · ${selectedProvider.name}${payableOrders.length === 1 ? ` · ${payableOrders[0].consecutive ?? ""}` : ""}`}
              initialOperationType="Pago a proveedor"
              totalLabel="Total debitado"
              mode="payment"
              onClose={() => {
                setPaymentFlow(null);
                setError("");
              }}
              onDone={finishPayment}
              submit={(allocations, result) =>
                apiClient.post("/recibos/pago", {
                  providerId: selectedProvider.id,
                  documentNumber: result.documentNumber,
                  detail: result.detail,
                  paidAt: result.paidAt
                    ? new Date(`${result.paidAt}T12:00:00`).toISOString()
                    : undefined,
                  allocations: allocations.map((line) => ({
                    purchaseOrderId: line.id,
                    amount: line.amount,
                  })),
                  cashAmount: result.cashAmount || undefined,
                  cashAccountId: result.cashAccountId,
                  instruments: result.instruments,
                  comments: result.comments || undefined,
                  operationType: result.operationType || undefined,
                  ...(result.support ?? {}),
                })
              }
            />
          )}
          {receiptEdit && (
            <ReceiptEditDialog
              receipt={receiptEdit.receipt}
              error={receiptEdit.error}
              saving={saving}
              onSave={saveReceiptEdit}
              onCancel={() => setReceiptEdit(null)}
            />
          )}
          {infoOpen && selectedProvider && (
            <div className="module-dialog-backdrop totalize-backdrop">
              <section className="module-dialog saint-info-dialog" role="dialog" aria-modal="true">
                <header className="module-dialog-titlebar">
                  <strong>INFORMACIÓN · {selectedProvider.name}</strong>
                  <button type="button" aria-label="Cerrar" onClick={() => setInfoOpen(false)}>
                    <X size={17} />
                  </button>
                </header>
                <dl className="saint-info-list">
                  <dt>ID fiscal</dt><dd>{selectedProvider.taxId || "—"}</dd>
                  <dt>Teléfono</dt><dd>{selectedProvider.phone || "—"}</dd>
                  <dt>Dirección</dt><dd>{selectedProvider.address || "—"}</dd>
                  <dt>Compras pendientes</dt><dd>{payableOrders.length}</dd>
                </dl>
              </section>
            </div>
          )}
        </div>
      </div>
      {notice && (
        <TransientMessage
          className="window-notice"
          role="status"
          onDismiss={() => setNotice("")}
        >
          {notice}
        </TransientMessage>
      )}
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
            onClick={() => startPayment()}
          >
            <Check size={14} /> Registrar pago
          </button>
        </div>
        <div className="provider-navigation-actions">
          <button type="button" className="exit-action" onClick={onClose}>
            <CircleX size={14} /> Salir
          </button>
        </div>
      </footer>
    </section>
  );
}

function BalanceField({ label, value, accent = false, muted = false }) {
  return (
    <div
      className={`payable-balance ${accent ? "is-accent" : ""} ${muted ? "is-muted" : ""}`}
    >
      <span>{label}</span>
      <strong>{formatCop(value)}</strong>
    </div>
  );
}

function mapProvider(provider) {
  return {
    ...provider,
    id: Number(provider.id),
    code: String(provider.taxId ?? provider.id).padStart(
      provider.taxId ? 0 : 6,
      "0",
    ),
    name: provider.name ?? "Proveedor sin nombre",
    taxId: provider.taxId ?? "",
    phone: provider.phonePrimary ?? "",
    address: provider.address ?? "",
  };
}

function orderBalance(order) {
  if (order.status === "ANULADA") return 0;
  if (order.balance !== undefined) return Math.max(0, Number(order.balance));
  return order.status === "RECIBIDA" ? 0 : Number(order.total ?? 0);
}

function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
