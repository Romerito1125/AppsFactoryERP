import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  CreditCard,
  Landmark,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { apiClient } from "@/lib/api-client";

const viewLabels = {
  home: "Bancos",
  accounts: "Cuentas",
  beneficiaries: "Beneficiarios",
  banks: "Bancos",
  transactions: "Transacciones",
  receivables: "Cuentas por cobrar",
  payables: "Cuentas por pagar",
  reports: "Reportes",
  various: "Varios",
};

const emptyAccount = {
  id: "",
  name: "",
  bankName: "",
  accountNumber: "",
  accountType: "CORRIENTE",
  currentBalance: "0",
};

let bankDataPromise;
let bankDataSnapshot;

function loadBankData() {
  if (bankDataSnapshot) return Promise.resolve(bankDataSnapshot);
  if (!bankDataPromise) {
    bankDataPromise = Promise.allSettled([
      apiClient.getAllPages("/cuentas-bancarias", { estado: "todos" }),
      apiClient.getAllPages("/movimientos-bancarios"),
      apiClient.getAllPages("/clientes", { estado: "activos" }),
      apiClient.getAllPages("/proveedores", { estado: "activos" }),
      apiClient.getAllPages("/creditos"),
      apiClient.getAllPages("/compras"),
    ]).then(
      ([
        accountsResult,
        movementsResult,
        clientsResult,
        providersResult,
        creditsResult,
        purchasesResult,
      ]) => {
        bankDataSnapshot = {
          accountsResult,
          movementsResult,
          clientsResult,
          providersResult,
          creditsResult,
          purchasesResult,
        };
        return bankDataSnapshot;
      },
    );
  }
  return bankDataPromise;
}

export function BanksWindow({
  initialView = "home",
  session,
  onClose,
  onOpenView,
  onRequestLogin,
}) {
  const [view, setView] = useState(initialView);
  const [accounts, setAccounts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [clients, setClients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [credits, setCredits] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => setView(initialView), [initialView]);

  useEffect(() => {
    let cancelled = false;
    loadBankData().then((data) => {
      if (cancelled) return;
      const nextAccounts =
        data.accountsResult.status === "fulfilled"
          ? data.accountsResult.value.filter(isActive)
          : [];
      setAccounts(nextAccounts);
      setMovements(
        data.movementsResult.status === "fulfilled"
          ? data.movementsResult.value
          : [],
      );
      setClients(
        data.clientsResult.status === "fulfilled"
          ? data.clientsResult.value
          : [],
      );
      setProviders(
        data.providersResult.status === "fulfilled"
          ? data.providersResult.value
          : [],
      );
      setCredits(
        data.creditsResult.status === "fulfilled"
          ? data.creditsResult.value
          : [],
      );
      setPurchases(
        data.purchasesResult.status === "fulfilled"
          ? data.purchasesResult.value
          : [],
      );
      setSelectedAccountId(String(nextAccounts[0]?.id ?? ""));
      if (data.accountsResult.status === "rejected") {
        setError(
          `No se pudo cargar Bancos: ${data.accountsResult.reason?.message ?? "verifica la conexión con el API"}`,
        );
        if (isAuthError(data.accountsResult.reason)) onRequestLogin?.();
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [onRequestLogin]);

  function navigate(nextView) {
    setError("");
    setNotice("");
    if (nextView !== view) {
      onOpenView?.(nextView);
      return;
    }
    setView(nextView);
  }

  function updateAccount(saved, removed = false) {
    setAccounts((current) =>
      removed
        ? current.filter((account) => account.id !== saved.id)
        : current.some((account) => account.id === saved.id)
          ? current.map((account) =>
              account.id === saved.id ? saved : account,
            )
          : [saved, ...current],
    );
    if (!removed) setSelectedAccountId(String(saved.id));
  }

  async function refreshMovements() {
    try {
      setMovements(await apiClient.getAllPages("/movimientos-bancarios"));
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    }
  }

  const commonProps = {
    accounts,
    selectedAccountId,
    onSelectAccount: setSelectedAccountId,
    onOpenView: navigate,
    onNotice: setNotice,
  };

  return (
    <section
      className={`provider-window banks-window banks-window-${view} ${isDragging ? "is-dragging" : ""}`}
      aria-label={`Ventana de ${viewLabels[view] ?? "Bancos"}`}
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle bank-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <span>MÓDULO DE BANCOS</span>
        <strong>{(viewLabels[view] ?? "Bancos").toUpperCase()}</strong>
        <span className="bank-mode-label">MODO: NORMAL</span>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar Bancos"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content bank-content">
        {loading ? (
          <div className="module-loading">Cargando información bancaria…</div>
        ) : view === "home" ? (
          <BankHomePanel onOpenView={navigate} />
        ) : view === "accounts" ? (
          <BankAccountsPanel
            {...commonProps}
            onSaved={updateAccount}
            onError={setError}
            session={session}
          />
        ) : view === "beneficiaries" ? (
          <BankBeneficiariesPanel clients={clients} providers={providers} />
        ) : view === "banks" ? (
          <BankBanksPanel accounts={accounts} />
        ) : view === "transactions" ? (
          <BankTransactionsPanel
            {...commonProps}
            movements={movements}
            onMovementsChanged={refreshMovements}
            onError={setError}
            onRequestLogin={onRequestLogin}
          />
        ) : view === "receivables" ? (
          <BankReceivablesPanel credits={credits} />
        ) : view === "payables" ? (
          <BankPayablesPanel purchases={purchases} />
        ) : view === "reports" ? (
          <BankReportsPanel accounts={accounts} movements={movements} />
        ) : (
          <BankVariousPanel onOpenView={navigate} />
        )}
      </div>
      {(error || notice) && (
        <div
          className={`module-message ${error ? "is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      )}
    </section>
  );
}

function BankHomePanel({ onOpenView }) {
  return (
    <div className="bank-home-panel">
      <Landmark size={62} strokeWidth={1.1} />
      <strong>Mundo Tienda</strong>
      <span>Administración de bancos y movimientos</span>
      <div>
        <button type="button" onClick={() => onOpenView("accounts")}>
          <Landmark size={15} /> Cuentas
        </button>
        <button type="button" onClick={() => onOpenView("transactions")}>
          <ArrowLeftRight size={15} /> Transacciones
        </button>
      </div>
    </div>
  );
}

function BankAccountsPanel({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onSaved,
  onError,
  session,
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyAccount);
  const [editing, setEditing] = useState(false);
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      `${account.id} ${account.name} ${account.bankName} ${account.accountNumber}`
        .toLowerCase()
        .includes(query),
    );
  }, [accounts, search]);

  useEffect(() => {
    const selected = accounts.find(
      (account) => String(account.id) === String(selectedAccountId),
    );
    if (selected) setDraft(toAccountDraft(selected));
  }, [accounts, selectedAccountId]);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startNew() {
    setDraft(emptyAccount);
    setEditing(false);
  }

  async function save() {
    if (!draft.name.trim() || !draft.bankName.trim()) {
      onError("Escribe el nombre de la cuenta y el banco.");
      return;
    }
    try {
      const body = {
        name: draft.name,
        bankName: draft.bankName,
        accountNumber: draft.accountNumber,
        accountType: draft.accountType,
        currentBalance: Number(draft.currentBalance || 0),
      };
      const saved = draft.id
        ? await apiClient.patch(`/cuentas-bancarias/${draft.id}`, body)
        : await apiClient.post("/cuentas-bancarias", body);
      onSaved(saved);
      setEditing(true);
    } catch (requestError) {
      onError(requestError.message);
    }
  }

  async function remove() {
    if (!draft.id || !window.confirm("¿Desactivar esta cuenta bancaria?"))
      return;
    try {
      await apiClient.delete(`/cuentas-bancarias/${draft.id}`);
      onSaved(draft, true);
      startNew();
    } catch (requestError) {
      onError(requestError.message);
    }
  }

  return (
    <div className="bank-child-window bank-accounts-panel">
      <div className="bank-child-titlebar">
        <strong>CUENTAS</strong>
        <span>Archivo de cuentas de clasificación o categorías</span>
      </div>
      <div className="bank-accounts-layout">
        <section className="bank-account-list">
          <div className="bank-tabs">
            <span className="is-active">Código</span>
            <span>Descripción</span>
          </div>
          <label className="bank-search-label" htmlFor="bank-account-search">
            Buscar
          </label>
          <div className="bank-search-field">
            <Search size={14} />
            <input
              id="bank-account-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Código o descripción"
            />
          </div>
          <div className="bank-table-scroll">
            <table className="bank-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <tr
                    key={account.id}
                    className={
                      String(account.id) === String(selectedAccountId)
                        ? "is-selected"
                        : ""
                    }
                    onClick={() => onSelectAccount(String(account.id))}
                  >
                    <td>{account.code ?? account.id}</td>
                    <td>{account.name}</td>
                  </tr>
                ))}
                {!filteredAccounts.length && (
                  <tr>
                    <td colSpan="2">No hay cuentas registradas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="bank-account-editor">
          <div className="bank-editor-code">
            <label>
              Código
              <input value={draft.id} readOnly />
            </label>
          </div>
          <div className="bank-editor-tabs">
            <span className="is-active">Generales</span>
          </div>
          <div className="bank-form-grid">
            <label>
              Descripción
              <input
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
              />
            </label>
            <label>
              Banco
              <input
                value={draft.bankName}
                onChange={(event) =>
                  updateDraft("bankName", event.target.value)
                }
              />
            </label>
            <label>
              Número de cuenta
              <input
                value={draft.accountNumber}
                onChange={(event) =>
                  updateDraft("accountNumber", event.target.value)
                }
              />
            </label>
            <label>
              Tipo
              <select
                value={draft.accountType}
                onChange={(event) =>
                  updateDraft("accountType", event.target.value)
                }
              >
                <option value="CORRIENTE">Corriente</option>
                <option value="AHORROS">Ahorros</option>
                <option value="CAJA">Caja</option>
              </select>
            </label>
            <label>
              Saldo actual
              <input
                type="number"
                step="0.01"
                value={draft.currentBalance}
                onChange={(event) =>
                  updateDraft("currentBalance", event.target.value)
                }
              />
            </label>
          </div>
          <div className="bank-editor-actions">
            <button type="button" onClick={startNew}>
              <Plus size={14} /> Agregar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={
                session?.role && !["ADMIN", "CONTADOR"].includes(session.role)
              }
            >
              <WalletCards size={14} /> {editing ? "Modificar" : "Guardar"}
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={remove}
              disabled={!draft.id}
            >
              <Trash2 size={14} /> Borrar
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function BankBeneficiariesPanel({ clients, providers }) {
  const [search, setSearch] = useState("");
  const items = useMemo(
    () =>
      [
        ...clients.map((item) => ({ ...item, kind: "Cliente" })),
        ...providers.map((item) => ({ ...item, kind: "Proveedor" })),
      ].filter((item) =>
        `${item.name ?? item.description} ${item.taxId ?? item.id}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [clients, providers, search],
  );
  return (
    <BankTablePanel
      title="BENEFICIARIOS"
      subtitle="Clientes y proveedores disponibles para las transacciones bancarias."
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Nombre o identificación"
    >
      <table className="bank-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descripción</th>
            <th>Tipo</th>
            <th>Id. Fiscal</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.kind}-${item.id}`}>
              <td>{item.code ?? item.id}</td>
              <td>{item.name ?? item.description}</td>
              <td>{item.kind}</td>
              <td>{item.taxId ?? "—"}</td>
              <td className="number-cell">
                {formatCurrency(item.pendingBalance ?? 0)}
              </td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan="5">No hay beneficiarios para mostrar.</td>
            </tr>
          )}
        </tbody>
      </table>
    </BankTablePanel>
  );
}

function BankBanksPanel({ accounts }) {
  const grouped = useMemo(
    () =>
      Object.values(
        accounts.reduce((result, account) => {
          const key = account.bankName || "Sin banco";
          if (!result[key])
            result[key] = { bankName: key, accounts: 0, balance: 0 };
          result[key].accounts += 1;
          result[key].balance += Number(account.currentBalance ?? 0);
          return result;
        }, {}),
      ),
    [accounts],
  );
  return (
    <BankTablePanel
      title="BANCOS"
      subtitle="Resumen de cuentas agrupadas por entidad bancaria."
    >
      <table className="bank-table">
        <thead>
          <tr>
            <th>Banco</th>
            <th>Cuentas</th>
            <th>Saldo disponible</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((item) => (
            <tr key={item.bankName}>
              <td>{item.bankName}</td>
              <td>{item.accounts}</td>
              <td className="number-cell">{formatCurrency(item.balance)}</td>
            </tr>
          ))}
          {!grouped.length && (
            <tr>
              <td colSpan="3">No hay cuentas para resumir.</td>
            </tr>
          )}
        </tbody>
      </table>
    </BankTablePanel>
  );
}

function BankTransactionsPanel({
  accounts,
  selectedAccountId,
  onSelectAccount,
  movements,
  onMovementsChanged,
  onError,
  onRequestLogin,
}) {
  const [transactionType, setTransactionType] = useState("EGRESO");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({
    document: "",
    date: todayValue(),
    beneficiary: "",
    amount: "",
    description: "",
  });
  const filteredMovements = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return movements;
    return movements.filter((movement) =>
      `${movement.document ?? movement.reference ?? ""} ${movement.description ?? ""} ${movement.bankAccount?.name ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [movements, search]);

  async function saveMovement() {
    if (
      !selectedAccountId ||
      Number(draft.amount) <= 0 ||
      !draft.description.trim()
    ) {
      onError(
        "Selecciona una cuenta, monto y descripción para registrar el movimiento.",
      );
      return;
    }
    const endpoint = ["INGRESO", "N.CREDITO"].includes(transactionType)
      ? "ingreso"
      : "egreso";
    try {
      await apiClient.post(`/movimientos-bancarios/${endpoint}`, {
        bankAccountId: numberOrValue(selectedAccountId),
        amount: Number(draft.amount),
        description: draft.description,
        invoiceId: undefined,
      });
      setDraft({
        document: "",
        date: todayValue(),
        beneficiary: "",
        amount: "",
        description: "",
      });
      await onMovementsChanged();
    } catch (requestError) {
      onError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    }
  }

  return (
    <div className="bank-child-window bank-transactions-panel">
      <div className="bank-child-titlebar">
        <strong>TRANSACCIONES</strong>
        <span>Movimientos de cuentas bancarias</span>
      </div>
      <div className="bank-transaction-top">
        <div className="bank-pill">
          <Banknote size={14} /> Bancos
        </div>
        <div className="bank-search-field">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Documento o descripción"
          />
        </div>
        <span>{filteredMovements.length} movimientos</span>
      </div>
      <div className="bank-table-scroll bank-movement-scroll">
        <table className="bank-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Documento</th>
              <th>Beneficiario / Descripción</th>
              <th>Cuenta(s)</th>
              <th>Debe</th>
              <th>Haber</th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.map((movement) => {
              const isIncome =
                String(movement.movementType ?? "").includes("INGRESO") ||
                String(movement.movementType ?? "").includes("ENTRANTE");
              const amount = Number(
                movement.totalAmount ?? movement.amount ?? 0,
              );
              return (
                <tr key={movement.id}>
                  <td>{formatDate(movement.createdAt ?? movement.date)}</td>
                  <td>{movement.document ?? movement.reference ?? "—"}</td>
                  <td>{movement.description ?? "—"}</td>
                  <td>
                    {movement.bankAccount?.name ??
                      accounts.find(
                        (account) => account.id === movement.bankAccountId,
                      )?.name ??
                      "—"}
                  </td>
                  <td className="number-cell">
                    {isIncome ? "" : formatCurrency(amount)}
                  </td>
                  <td className="number-cell">
                    {isIncome ? formatCurrency(amount) : ""}
                  </td>
                </tr>
              );
            })}
            {!filteredMovements.length && (
              <tr>
                <td colSpan="6">No hay movimientos bancarios para mostrar.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="bank-entry-area">
        <div className="bank-entry-tabs">
          {[
            ["EGRESO", "Egreso", ArrowUpRight],
            ["INGRESO", "Ingreso", ArrowDownLeft],
            ["N.CREDITO", "N.Crédito", CreditCard],
            ["N.DEBITO", "N.Débito", ReceiptText],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              className={transactionType === value ? "is-active" : ""}
              onClick={() => setTransactionType(value)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="bank-entry-form">
          <label>
            Dcto. No.
            <input
              value={draft.document}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  document: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Fecha
            <input
              type="date"
              value={draft.date}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  date: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Beneficiario
            <input
              value={draft.beneficiary}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  beneficiary: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Monto
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Cuenta
            <select
              value={selectedAccountId}
              onChange={(event) => onSelectAccount(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bank-entry-description">
            Comentarios
            <input
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            className="bank-save-entry"
            onClick={saveMovement}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function BankReceivablesPanel({ credits }) {
  return (
    <BankTablePanel
      title="CUENTAS POR COBRAR"
      subtitle="Documentos y saldos pendientes que pueden convertirse en ingresos bancarios."
    >
      <table className="bank-table">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Cliente</th>
            <th>Vencimiento</th>
            <th>Total</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {credits.map((credit) => (
            <tr key={credit.id}>
              <td>{credit.invoice?.consecutive ?? credit.id}</td>
              <td>{credit.client?.name ?? credit.clientName ?? "—"}</td>
              <td>{formatDate(credit.dueDate)}</td>
              <td className="number-cell">
                {formatCurrency(credit.totalAmount)}
              </td>
              <td className="number-cell">{formatCurrency(credit.balance)}</td>
            </tr>
          ))}
          {!credits.length && (
            <tr>
              <td colSpan="5">No hay cuentas por cobrar para mostrar.</td>
            </tr>
          )}
        </tbody>
      </table>
    </BankTablePanel>
  );
}

function BankPayablesPanel({ purchases }) {
  return (
    <BankTablePanel
      title="CUENTAS POR PAGAR"
      subtitle="Compras y compromisos pendientes con proveedores."
    >
      <table className="bank-table">
        <thead>
          <tr>
            <th>Compra</th>
            <th>Proveedor</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((purchase) => (
            <tr key={purchase.id}>
              <td>{purchase.consecutive ?? purchase.number ?? purchase.id}</td>
              <td>{purchase.provider?.name ?? "—"}</td>
              <td>{formatDate(purchase.orderedAt ?? purchase.createdAt)}</td>
              <td>{purchase.status ?? "Borrador"}</td>
              <td className="number-cell">{formatCurrency(purchase.total)}</td>
            </tr>
          ))}
          {!purchases.length && (
            <tr>
              <td colSpan="5">No hay cuentas por pagar para mostrar.</td>
            </tr>
          )}
        </tbody>
      </table>
    </BankTablePanel>
  );
}

function BankReportsPanel({ accounts, movements }) {
  const balance = accounts.reduce(
    (sum, account) => sum + Number(account.currentBalance ?? 0),
    0,
  );
  const income = movements
    .filter((movement) =>
      String(movement.movementType ?? "").includes("INGRESO"),
    )
    .reduce(
      (sum, movement) =>
        sum + Number(movement.totalAmount ?? movement.amount ?? 0),
      0,
    );
  const expenses = movements
    .filter((movement) =>
      String(movement.movementType ?? "").includes("EGRESO"),
    )
    .reduce(
      (sum, movement) =>
        sum + Number(movement.totalAmount ?? movement.amount ?? 0),
      0,
    );
  return (
    <div className="bank-report-shell">
      <div className="bank-section-heading">
        <div>
          <span>SAINT Enterprise módulo de Bancos.</span>
          <h2>REPORTES</h2>
        </div>
        <BarChart3 size={28} />
      </div>
      <div className="bank-report-cards">
        <div>
          <span>Saldo en cuentas</span>
          <strong>{formatCurrency(balance)}</strong>
        </div>
        <div>
          <span>Total ingresos</span>
          <strong>{formatCurrency(income)}</strong>
        </div>
        <div>
          <span>Total egresos</span>
          <strong>{formatCurrency(expenses)}</strong>
        </div>
      </div>
      <div className="bank-report-note">
        Seleccione una cuenta o consulte Transacciones para revisar el detalle
        de cada movimiento.
      </div>
    </div>
  );
}

function BankVariousPanel({ onOpenView }) {
  return (
    <div className="bank-various-shell">
      <div className="bank-section-heading">
        <div>
          <span>MÓDULO DE BANCOS</span>
          <h2>VARIOS</h2>
        </div>
      </div>
      <div className="bank-various-grid">
        <button type="button" onClick={() => onOpenView("beneficiaries")}>
          <UsersRound size={22} /> Beneficiarios
        </button>
        <button type="button" onClick={() => onOpenView("banks")}>
          <Banknote size={22} /> Bancos
        </button>
        <button type="button" onClick={() => onOpenView("reports")}>
          <BarChart3 size={22} /> Reportes
        </button>
      </div>
    </div>
  );
}

function BankTablePanel({
  title,
  subtitle,
  search,
  onSearch,
  searchPlaceholder = "Buscar",
  children,
}) {
  return (
    <div className="bank-child-window bank-table-panel">
      <div className="bank-child-titlebar">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {onSearch && (
        <div className="bank-list-toolbar">
          <label>Buscar</label>
          <div className="bank-search-field">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
        </div>
      )}
      <div className="bank-table-scroll">{children}</div>
    </div>
  );
}

function toAccountDraft(account) {
  return {
    id: account.id ?? "",
    name: account.name ?? "",
    bankName: account.bankName ?? "",
    accountNumber: account.accountNumber ?? "",
    accountType: account.accountType ?? "CORRIENTE",
    currentBalance: String(account.currentBalance ?? 0),
  };
}

function isActive(item) {
  return item?.isActive !== false && item?.active !== false;
}

function numberOrValue(value) {
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO").format(new Date(value));
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function isAuthError(error) {
  return /sesión|inicia sesión|autentic|401/i.test(error?.message ?? "");
}
