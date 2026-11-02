import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, ChevronDown, CircleX, CreditCard, Search, X } from "lucide-react";

import {
  AccountOperations,
  AgingAnalysis,
  LedgerPanel,
  money,
  PendingList,
} from "@/components/accounts/account-panels";
import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { NotesCenter } from "@/components/accounts/notes-center";
import { printReceipt } from "@/components/payments/print-receipt";
import { apiClient } from "@/lib/api-client";
import { AdvancesPanel } from "./advances-panel";
import { ReceiptEditDialog, VoidReceiptDialog } from "@/components/payments/receipt-dialogs";
import { viewReceiptSupport } from "@/components/payments/support-file";
import { CollectionFlow } from "./cobrar-panels";
import { clientDisplayName } from "./receivable-utils";

const tabs = [
  ["operations", "Operaciones"],
  ["statement", "Estado de cuenta"],
  ["pending", "Pendiente"],
  ["due", "Vencimientos"],
];

export function AccountsReceivableWindow({
  onClose,
  onRequestLogin,
  canAccess,
}) {
  const [clients, setClients] = useState([]);
  const [credits, setCredits] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("operations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [collection, setCollection] = useState(null);
  const [receiptEdit, setReceiptEdit] = useState(null);
  const [receiptVoid, setReceiptVoid] = useState(null);
  const [statementKey, setStatementKey] = useState(0);
  const [advancesOpen, setAdvancesOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [notesMode, setNotesMode] = useState(null);
  const [listMode, setListMode] = useState("name");
  const [saving, setSaving] = useState(false);
  const [advances, setAdvances] = useState([]);
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
      .then(
        ([
          clientsResult,
          creditsResult,
          bankAccountsResult,
        ]) => {
        if (cancelled) return;
        if (clientsResult.status === "rejected") throw clientsResult.reason;

        const clientItems = clientsResult.value;
        const creditItems =
          creditsResult.status === "fulfilled" ? creditsResult.value : [];
        const bankItems =
          bankAccountsResult.status === "fulfilled"
            ? bankAccountsResult.value
            : [];
        const mappedClients = clientItems.map(mapClient);
        const nextCredits = creditItems.map(mapCredit);
        const nextClients = mappedClients.filter(
          (client) =>
            client.hasCredit ||
            nextCredits.some(
              (credit) => credit.clientId === client.id && credit.balance > 0,
            ),
        );
        setClients(nextClients);
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
            "Las cuentas bancarias no están disponibles: no se podrán registrar cobros hasta que carguen.",
          );
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

  const loadAdvances = useCallback(async () => {
    try {
      const rows = await apiClient.get("/anticipos");
      setAdvances(Array.isArray(rows) ? rows : []);
    } catch {
      setAdvances([]);
    }
  }, []);

  async function reloadCredits() {
    try {
      setCredits((await apiClient.getAllPages("/creditos")).map(mapCredit));
    } catch {
      // Se conservan los créditos ya cargados.
    }
  }

  useEffect(() => {
    void loadAdvances();
  }, [loadAdvances]);

  const filteredClients = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => {
      const haystack =
        listMode === "id"
          ? client.identification
          : listMode === "key"
            ? `${client.referralCode ?? ""} ${client.phone ?? ""}`
            : clientName(client);
      return String(haystack).toLowerCase().includes(query);
    });
  }, [clients, searchTerm, listMode]);

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
  const clientAdvances = advances.filter(
    (advance) => !selectedClientId || advance.clientId === selectedClientId,
  );
  const advanceBalance =
    clientAdvances
      .filter((advance) => advance.status === "DISPONIBLE")
      .reduce((sum, advance) => sum + Number(advance.balance), 0) +
    clientCredits
      .filter((credit) => credit.totalAmount < 0)
      .reduce((sum, credit) => sum + Math.abs(credit.balance), 0);

  const loadStatement = useCallback(
    (params) =>
      selectedClient
        ? apiClient.get(`/recibos/estado-cuenta/cliente/${selectedClient.id}`, params)
        : Promise.resolve(null),
    [selectedClient],
  );
  const pendingRows = openCredits.map((credit) => ({
    id: credit.id,
    number: credit.invoice?.consecutive ?? `CR-${String(credit.id).padStart(6, "0")}`,
    detail: credit.invoice?.consecutive
      ? `FAC ${credit.invoice.consecutive}`
      : "Crédito directo",
    dueAt: credit.dueDate,
    issuedAt: credit.createdAt,
    amount: credit.totalAmount,
    balance: credit.balance,
  }));
  const agingRows = openCredits.map((credit) => ({
    balance: credit.balance,
    dueAt: credit.dueDate,
  }));

  function selectClient(id) {
    setSelectedClientId(id);
    setCollection(null);
    setError("");
    setNotice("");
  }

  function startPayment(credit = null) {
    if (!selectedClient) return;
    if (!canEdit) {
      setError("Tu usuario no tiene permiso para registrar pagos y abonos.");
      return;
    }
    if (!openCredits.length) {
      setError("El cliente no tiene saldos pendientes para abonar.");
      return;
    }
    setCollection({ creditId: credit?.id ?? null });
    setError("");
  }

  async function afterReceiptChange(message) {
    await Promise.all([loadAdvances(), reloadCredits()]);
    setStatementKey((key) => key + 1);
    if (message) setNotice(message);
  }

  async function openReceipt(receiptId, mode) {
    try {
      const receipt = await apiClient.get(`/recibos/${receiptId}`);
      if (mode === "print") {
        printReceipt(receipt, {
          party: clientDisplayName(selectedClient),
          copies: 1,
        });
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
      await afterReceiptChange("Recibo actualizado; el cambio quedó en la auditoría.");
    } catch (requestError) {
      setReceiptEdit((current) => ({ ...current, error: requestError.message }));
    } finally {
      setSaving(false);
    }
  }

  async function askVoid(receiptId) {
    try {
      const receipt = await apiClient.get(`/recibos/${receiptId}`);
      setReceiptVoid({ id: receiptId, number: receipt.receiptNumber, error: "" });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function confirmVoid(reason) {
    setSaving(true);
    try {
      await apiClient.post(`/recibos/${receiptVoid.id}/anular`, { reason });
      setReceiptVoid(null);
      await afterReceiptChange("Recibo anulado: saldos y banco revertidos.");
    } catch (requestError) {
      setReceiptVoid((current) => ({ ...current, error: requestError.message }));
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
          <div className="saint-list-tabs" role="tablist">
            {[["id", "ID Fiscal"], ["name", "Descripción"], ["key", "Clave"]].map(([id, label]) => (
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
              <div
                className={
                  client.id === selectedClientId
                    ? "provider-table-row is-selected"
                    : "provider-table-row"
                }
                role="row"
                tabIndex={0}
                key={client.id}
                onClick={() => selectClient(client.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectClient(client.id);
                  }
                }}
              >
                <span>{client.identification}</span>
                <span>{clientName(client)}</span>
              </div>
            ))}
            {loading && <div className="window-state">Cargando cuentas…</div>}
            {!loading && !filteredClients.length && (
              <div className="window-state">No hay clientes con crédito configurado.</div>
            )}
            <div className="provider-empty-rows" aria-hidden="true">
              {Array.from({
                length: Math.max(0, 9 - filteredClients.length),
              }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
          <div className="saint-list-buttons">
            <button type="button" onClick={() => moveClient(-1)} disabled={!canMovePrevious}>Anterior</button>
            <button type="button" onClick={() => moveClient(1)} disabled={!canMoveNext}>Próximo</button>
            <button type="button" onClick={() => setInfoOpen(true)} disabled={!selectedClient}>Información</button>
          </div>
        </aside>
        <div className="provider-detail-panel receivable-detail-panel">
          <div className="payable-heading receivable-heading saint-heading">
            <div>
              <strong>
                {selectedClient
                  ? `${selectedClient.identification} ${clientName(selectedClient)}`
                  : "Sin cliente seleccionado"}
              </strong>
              <span>{selectedClient?.address ?? ""}</span>
              <span>{selectedClient?.phone ?? ""}</span>
              <span className="saint-credit-limit">
                Límite de crédito: <b>{money(selectedClient?.maxCredit ?? 0)}</b>
              </span>
            </div>
            <div className="payable-balance-grid">
              <BalanceField label="Saldo anticipos" value={advanceBalance} muted />
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
            <AccountOperations
              kind="cobrar"
              onInvoices={() => setActiveTab("statement")}
              onSchedule={() => setActiveTab("pending")}
              onPayment={() => startPayment()}
              onAdvances={() => setAdvancesOpen(true)}
              onDebitNotes={() => setNotesMode("debito")}
              onCreditNotes={() => setNotesMode("credito")}
              onVoidNotes={() => setNotesMode("anular")}
            />
          )}
          {activeTab === "statement" && (
            <LedgerPanel
              key={selectedClient?.id ?? "none"}
              load={loadStatement}
              refreshKey={statementKey}
              canEdit={canEdit}
              canVoid={canEdit}
              onPrint={(receiptId) => openReceipt(receiptId, "print")}
              onEdit={(receiptId) => openReceipt(receiptId, "edit")}
              onVoid={askVoid}
              onSupport={(receiptId) =>
                viewReceiptSupport(receiptId).catch((requestError) =>
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
              onPay={(row) => startPayment(openCredits.find((credit) => credit.id === row.id))}
            />
          )}
          {activeTab === "due" && <AgingAnalysis rows={agingRows} />}
          {advancesOpen && (
            <div className="module-dialog-backdrop totalize-backdrop">
              <section className="module-dialog saint-advances-dialog" role="dialog" aria-modal="true">
                <header className="module-dialog-titlebar">
                  <strong>NOTAS CRÉDITO / ANTICIPOS · {selectedClient ? clientName(selectedClient) : ""}</strong>
                  <button type="button" aria-label="Cerrar" onClick={() => setAdvancesOpen(false)}>
                    <X size={17} />
                  </button>
                </header>
                <AdvancesPanel
                  client={selectedClient}
                  advances={clientAdvances}
                  openCredits={openCredits}
                  bankAccounts={bankAccounts}
                  canEdit={canEdit}
                  onChanged={async () => {
                    await afterReceiptChange();
                  }}
                  onNotice={setNotice}
                  onError={setError}
                />
              </section>
            </div>
          )}
          {notesMode && selectedClient && (
            <NotesCenter
              side="cobrar"
              mode={notesMode}
              party={{ id: selectedClient.id, name: clientName(selectedClient) }}
              documents={pendingRows.map((row) => ({
                id: row.id,
                label: row.detail,
                balance: row.balance,
              }))}
              bankAccounts={bankAccounts}
              canEdit={canEdit}
              onClose={() => setNotesMode(null)}
              onChanged={async (message) => {
                await afterReceiptChange(message);
              }}
            />
          )}
          {infoOpen && selectedClient && (
            <div className="module-dialog-backdrop totalize-backdrop">
              <section className="module-dialog saint-info-dialog" role="dialog" aria-modal="true">
                <header className="module-dialog-titlebar">
                  <strong>INFORMACIÓN · {clientName(selectedClient)}</strong>
                  <button type="button" aria-label="Cerrar" onClick={() => setInfoOpen(false)}>
                    <X size={17} />
                  </button>
                </header>
                <dl className="saint-info-list">
                  <dt>ID fiscal</dt><dd>{selectedClient.identification}</dd>
                  <dt>Teléfono</dt><dd>{selectedClient.phone ?? "—"}</dd>
                  <dt>Dirección</dt><dd>{selectedClient.address ?? "—"}</dd>
                  <dt>Límite de crédito</dt><dd>{money(selectedClient.maxCredit ?? 0)}</dd>
                  <dt>Nivel de precio</dt><dd>Precio {selectedClient.priceLevel ?? 0}</dd>
                </dl>
              </section>
            </div>
          )}
          {collection && selectedClient && (
            <CollectionFlow
              client={selectedClient}
              credits={openCredits}
              initialCreditId={collection.creditId}
              bankAccounts={bankAccounts}
              onClose={() => setCollection(null)}
              onDone={async (receipt) => {
                setCollection(null);
                setActiveTab("statement");
                await afterReceiptChange(
                  `Recibo ${receipt.documentNumber} registrado por ${formatCurrency(receipt.totalAmount)}; el banco y la cartera quedaron actualizados.`,
                );
              }}
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
          {receiptVoid && (
            <VoidReceiptDialog
              receiptNumber={receiptVoid.number}
              error={receiptVoid.error}
              saving={saving}
              onConfirm={confirmVoid}
              onCancel={() => setReceiptVoid(null)}
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
      {notice && (
        <TransientMessage
          className="window-notice"
          role="status"
          onDismiss={() => setNotice("")}
        >
          {notice}
        </TransientMessage>
      )}
      <footer className="provider-window-footer">
        <div className="provider-crud-actions">
          <button
            type="button"
            onClick={() => startPayment()}
          >
            <Banknote size={14} /> Registrar pago
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

function BalanceField({ label, value, muted, accent }) {
  return (
    <div className={`payable-balance ${muted ? "is-muted" : ""} ${accent ? "is-accent" : ""}`}>
      <span>{label}</span>
      <strong>{money(value)}</strong>
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
function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}
function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
