import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  CreditCard,
  Download,
  FileSpreadsheet,
  Filter,
  Landmark,
  LoaderCircle,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./banks-reports.css";
import { formatCop, readCopInput } from "@/lib/cop";
import { CopInput } from "@/components/money/cop-input";

const viewLabels = {
  home: "Finanzas",
  accounts: "Cuentas",
  transactions: "Movimientos bancarios",
  receivables: "Cuentas por cobrar",
  payables: "Cuentas por pagar",
  reports: "Reportes",
};

const emptyAccount = {
  id: "",
  name: "",
  bankName: "",
  accountNumber: "",
  accountType: "CORRIENTE",
  currentBalance: "0",
  gmfRate: "0.4",
  autoGmf: false,
};

let bankDataPromise;
let bankDataSnapshot;

function participantName(item) {
  const fullName = [item?.firstName, item?.lastName].filter(Boolean).join(" ");
  return item?.name || fullName || item?.description || "—";
}

function loadBankData() {
  if (bankDataSnapshot) return Promise.resolve(bankDataSnapshot);
  if (!bankDataPromise) {
    bankDataPromise = Promise.allSettled([
      apiClient.getAllPages("/cuentas-bancarias", { estado: "todos" }),
      apiClient.getAllPages("/movimientos-bancarios"),
      apiClient.getAllPages("/creditos"),
      apiClient.getAllPages("/compras"),
    ]).then(
      ([accountsResult, movementsResult, creditsResult, purchasesResult]) => {
        bankDataSnapshot = {
          accountsResult,
          movementsResult,
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
  const [view, setView] = useState(
    ["home", "accounts", "transactions", "receivables", "payables", "reports"].includes(
      initialView,
    )
      ? initialView
      : "home",
  );
  const [accounts, setAccounts] = useState([]);
  const [movements, setMovements] = useState([]);
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
          `No se pudo cargar Finanzas: ${data.accountsResult.reason?.message ?? "verifica la conexión con el sistema"}`,
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

  async function refreshAccounts() {
    try {
      const nextAccounts = (await apiClient.getAllPages(
        "/cuentas-bancarias",
        { estado: "todos" },
      )).filter(isActive);
      setAccounts(nextAccounts);
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
    onAccountsChanged: refreshAccounts,
  };

  return (
    <section
      className={`provider-window banks-window banks-window-${view} ${isDragging ? "is-dragging" : ""}`}
      aria-label={`Ventana de ${viewLabels[view] ?? "Finanzas"}`}
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle bank-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <Landmark size={14} />
        </div>
        <span>MÓDULO DE FINANZAS</span>
        <strong>{(viewLabels[view] ?? "Finanzas").toUpperCase()}</strong>
        <span className="bank-mode-label">MODO: NORMAL</span>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar Finanzas"
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
        ) : view === "transactions" ? (
          <BankTransactionsPanel
            {...commonProps}
            movements={movements}
            onMovementsChanged={refreshMovements}
            onAccountsChanged={refreshAccounts}
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
          <BankHomePanel onOpenView={navigate} />
        )}
      </div>
      {(error || notice) && (
        <TransientMessage
          className={`module-message ${error ? "is-error" : ""}`}
          role={error ? "alert" : "status"}
          onDismiss={() => (error ? setError("") : setNotice(""))}
        >
          {error || notice}
        </TransientMessage>
      )}
      <footer className="provider-window-footer bank-window-footer">
        <span className="bank-footer-caption">
          Módulo de Finanzas · {viewLabels[view]} · {accounts.length} cuenta(s)
        </span>
        <div className="provider-navigation-actions">
          <button type="button" className="exit-action" onClick={onClose}>
            Salir
          </button>
        </div>
      </footer>
    </section>
  );
}

function BankHomePanel({ onOpenView }) {
  return (
    <div className="bank-home-panel">
      <Landmark size={62} strokeWidth={1.1} />
      <strong>Mundo Tienda</strong>
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
  onNotice,
  onAccountsChanged,
  session,
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyAccount);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
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
    // La selección de la grilla hidrata el formulario editable de la cuenta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected) setDraft(toAccountDraft(selected));
  }, [accounts, selectedAccountId]);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startNew() {
    setDraft(emptyAccount);
    setEditing(false);
    onSelectAccount("");
  }

  async function save() {
    if (!draft.name.trim() || !draft.bankName.trim()) {
      onError("Escribe el nombre de la cuenta y el banco.");
      return;
    }
    if (Number(draft.currentBalance) < 0) {
      onError("El saldo actual no puede ser negativo.");
      return;
    }
    setSaving(true);
    onError("");
    try {
      const body = {
        name: draft.name,
        bankName: draft.bankName,
        accountNumber: draft.accountNumber,
        accountType: draft.accountType,
        gmfRate: Number(draft.gmfRate || 0),
        autoGmf: Boolean(draft.autoGmf),
        // El saldo solo cambia con movimientos; al crear se envía como saldo inicial.
        ...(draft.id ? {} : { currentBalance: Number(draft.currentBalance || 0) }),
      };
      const saved = draft.id
        ? await apiClient.patch(`/cuentas-bancarias/${draft.id}`, body)
        : await apiClient.post("/cuentas-bancarias", body);
      onSaved(saved);
      setEditing(true);
      onNotice?.(
        "Cuenta " +
          saved.name +
          (draft.id ? " actualizada" : " creada") +
          " correctamente.",
      );
      await onAccountsChanged?.();
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft.id || !window.confirm("¿Desactivar esta cuenta bancaria?"))
      return;
    setSaving(true);
    onError("");
    try {
      await apiClient.delete("/cuentas-bancarias/" + draft.id);
      onSaved(draft, true);
      onNotice?.("Cuenta bancaria desactivada correctamente.");
      startNew();
      await onAccountsChanged?.();
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bank-child-window bank-accounts-panel">
      <div className="bank-child-titlebar">
        <strong>CUENTAS</strong>
      </div>
      <div className="bank-accounts-layout">
        <section className="bank-account-list">
          <div className="bank-tabs">
            <span className="is-active">Código</span>
            <span>Nombre</span>
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
              placeholder="Código o nombre"
            />
          </div>
          <div className="bank-table-scroll">
            <table className="bank-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
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
              Nombre
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
              4x1000 automático
              <input
                type="checkbox"
                checked={Boolean(draft.autoGmf)}
                onChange={(event) => updateDraft("autoGmf", event.target.checked)}
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
              GMF / 4×1000 (%)
              <input
                type="number"
                min="0"
                step="0.001"
                value={draft.gmfRate}
                onChange={(event) => updateDraft("gmfRate", event.target.value)}
              />
            </label>
            <label>
              Saldo actual
              <CopInput value={readCopInput(draft.currentBalance).value} readOnly />
            </label>
          </div>
          <small className="bank-editor-hint">
            Para cuadrar el saldo utiliza Transacciones → Ajuste.
          </small>
          <div className="bank-editor-actions">
            <button type="button" onClick={startNew}>
              <Plus size={14} /> Agregar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={
                saving ||
                session?.role && !["ADMIN", "CONTADOR"].includes(session.role)
              }
            >
              {saving ? (
                <LoaderCircle size={14} className="is-spinning" />
              ) : (
                <WalletCards size={14} />
              )}{" "}
              {saving ? "Guardando…" : editing ? "Modificar" : "Guardar"}
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={remove}
              disabled={!draft.id || saving}
            >
              {saving ? (
                <LoaderCircle size={14} className="is-spinning" />
              ) : (
                <Trash2 size={14} />
              )}{" "}
              {saving ? "Guardando…" : "Desactivar"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function BankTransactionsPanel({
  accounts,
  selectedAccountId,
  onSelectAccount,
  movements,
  onMovementsChanged,
  onAccountsChanged,
  onError,
  onNotice,
  onRequestLogin,
}) {
  const [transactionType, setTransactionType] = useState("EGRESO");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    document: "",
    date: todayValue(),
    beneficiary: "",
    amount: "",
    description: "",
    toAccountId: "",
    appliesGmf: false,
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
    const description = [
      draft.document.trim() ? "Dcto. " + draft.document.trim() : "",
      draft.beneficiary.trim()
        ? "Beneficiario: " + draft.beneficiary.trim()
        : "",
      draft.description.trim(),
      draft.date ? "Fecha: " + draft.date : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const isAdjustment = transactionType === "AJUSTE";
    const isTransfer = transactionType === "TRANSFERENCIA";
    if (!selectedAccountId || Number(draft.amount) <= 0 || !description) {
      onError(
        isAdjustment
          ? "Selecciona una cuenta, saldo real y descripción para registrar el ajuste."
          : "Selecciona una cuenta, monto y descripción para registrar el movimiento.",
      );
      return;
    }
    if (isTransfer && !draft.toAccountId) {
      onError("Selecciona la cuenta destino de la transferencia.");
      return;
    }
    if (
      isTransfer &&
      String(draft.toAccountId) === String(selectedAccountId)
    ) {
      onError("La cuenta origen y destino deben ser diferentes.");
      return;
    }
    setSaving(true);
    onError("");
    try {
      if (isAdjustment) {
        await apiClient.post("/movimientos-bancarios/ajuste", {
          bankAccountId: numberOrValue(selectedAccountId),
          balance: Number(draft.amount),
          description,
        });
      } else if (isTransfer) {
        await apiClient.post("/movimientos-bancarios/transferencia", {
          fromBankAccountId: numberOrValue(selectedAccountId),
          toBankAccountId: numberOrValue(draft.toAccountId),
          amount: Number(draft.amount),
          description,
          appliesGmf: Boolean(draft.appliesGmf),
        });
      } else {
        const endpoint = ["INGRESO", "N.CREDITO"].includes(transactionType)
          ? "ingreso"
          : "egreso";
        await apiClient.post("/movimientos-bancarios/" + endpoint, {
          bankAccountId: numberOrValue(selectedAccountId),
          amount: Number(draft.amount),
          description,
          appliesGmf: Boolean(draft.appliesGmf),
        });
      }
      setDraft({
        document: "",
        date: todayValue(),
        beneficiary: "",
        amount: "",
        description: "",
        toAccountId: "",
        appliesGmf: false,
      });
      await onMovementsChanged();
      await onAccountsChanged?.();
      onNotice?.("Movimiento bancario registrado correctamente.");
    } catch (requestError) {
      onError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bank-child-window bank-transactions-panel">
      <div className="bank-child-titlebar">
        <strong>TRANSACCIONES</strong>
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
                    {isIncome ? "" : formatCop(amount)}
                  </td>
                  <td className="number-cell">
                    {isIncome ? formatCop(amount) : ""}
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
            ["TRANSFERENCIA", "Transferencia", ArrowLeftRight],
            ["AJUSTE", "Ajuste", WalletCards],
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
            {transactionType === "AJUSTE" ? "Saldo real" : "Monto"}
            <CopInput
              value={readCopInput(draft.amount).value}
              onChange={(amount) =>
                setDraft((current) => ({
                  ...current,
                  amount: String(amount),
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
          {transactionType === "TRANSFERENCIA" && (
            <label>
              Cuenta destino
              <select
                value={draft.toAccountId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    toAccountId: event.target.value,
                  }))
                }
              >
                <option value="">Selecciona una cuenta</option>
                {accounts
                  .filter(
                    (account) =>
                      String(account.id) !== String(selectedAccountId),
                  )
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
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
            disabled={saving}
          >
            {saving ? (
              <LoaderCircle size={13} className="is-spinning" />
            ) : null}
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
        {["EGRESO", "TRANSFERENCIA"].includes(transactionType) && (
          <label className="bank-gmf-option">
            <input
              type="checkbox"
              checked={draft.appliesGmf}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  appliesGmf: event.target.checked,
                }))
              }
            />
            Aplicar 4×1000
          </label>
        )}
      </div>
    </div>
  );
}

function BankReceivablesPanel({ credits }) {
  const pendingCredits = credits.filter(
    (credit) => Number(credit.balance ?? 0) > 0,
  );
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
          {pendingCredits.map((credit) => (
            <tr key={credit.id}>
              <td>{credit.invoice?.consecutive ?? credit.id}</td>
              <td>
                {credit.client
                  ? participantName(credit.client)
                  : credit.clientName || "—"}
              </td>
              <td>{formatDate(credit.dueDate)}</td>
              <td className="number-cell">
                {formatCop(credit.totalAmount)}
              </td>
              <td className="number-cell">{formatCop(credit.balance)}</td>
            </tr>
          ))}
          {!pendingCredits.length && (
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
  const pendingPurchases = purchases.filter(
    (purchase) =>
      purchase.status === "RECIBIDA" &&
      Number(purchase.balance ?? purchase.total ?? 0) > 0,
  );
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
          {pendingPurchases.map((purchase) => (
            <tr key={purchase.id}>
              <td>{purchase.consecutive ?? purchase.number ?? purchase.id}</td>
              <td>{purchase.provider?.name ?? "—"}</td>
              <td>{formatDate(purchase.orderedAt ?? purchase.createdAt)}</td>
              <td>{purchase.status ?? "Borrador"}</td>
              <td className="number-cell">
                {formatCop(purchase.balance ?? purchase.total)}
              </td>
            </tr>
          ))}
          {!pendingPurchases.length && (
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
  const [accountFilter, setAccountFilter] = useState("TODOS");
  const [period, setPeriod] = useState("30D");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const range = useMemo(() => financeRange(period, from, to), [from, period, to]);
  const visibleMovements = useMemo(() => movements.filter((movement) => {
    const accountMatches = accountFilter === "TODOS" || String(movement.bankAccountId ?? movement.bankAccount?.id ?? "") === String(accountFilter);
    const typeMatches = typeFilter === "TODOS" || movementTypeGroup(movement) === typeFilter;
    const searchMatches = !query.trim() || `${movement.description ?? ""} ${movement.reference ?? ""} ${movementTypeLabel(movement)}`.toLowerCase().includes(query.trim().toLowerCase());
    return accountMatches && typeMatches && searchMatches && inFinanceRange(movement.createdAt ?? movement.date ?? movement.movementDate, range);
  }).slice().sort((left, right) => new Date(right.createdAt ?? right.date ?? 0).getTime() - new Date(left.createdAt ?? left.date ?? 0).getTime()), [accountFilter, movements, query, range, typeFilter]);
  const visibleAccounts =
    accountFilter === "TODOS"
      ? accounts
      : accounts.filter((account) => String(account.id) === String(accountFilter));
  const balance = visibleAccounts.reduce(
    (sum, account) => sum + Number(account.currentBalance ?? 0),
    0,
  );
  const income = visibleMovements
    .filter(isIncomeMovement)
    .reduce(
      (sum, movement) =>
        sum + Number(movement.totalAmount ?? movement.amount ?? 0),
      0,
    );
  const expenses = visibleMovements
    .filter(isExpenseMovement)
    .reduce(
      (sum, movement) =>
        sum + Number(movement.totalAmount ?? movement.amount ?? 0),
      0,
    );
  const net = income - expenses;
  const totalPages = Math.max(1, Math.ceil(visibleMovements.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedMovements = visibleMovements.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const dailyRows = buildFinanceDailyRows(visibleMovements);
  const typeRows = buildFinanceTypeRows(visibleMovements);

  function updateFilter(setter, value) { setter(value); setPage(1); }
  function exportCsv() { if (!visibleMovements.length) return; const rows = visibleMovements.map((movement) => [formatDate(movement.createdAt ?? movement.date), movementTypeLabel(movement), movement.description ?? "—", accounts.find((account) => account.id === movement.bankAccountId)?.name ?? movement.bankAccount?.name ?? "—", Number(movement.totalAmount ?? movement.amount ?? 0)]); downloadFinanceBlob([['Fecha', 'Tipo', 'Descripción', 'Cuenta', 'Monto'], ...rows], `reporte-finanzas-${period}.csv`, "csv"); }
  async function exportExcel() { const XLSX = await import("xlsx"); const workbook = XLSX.utils.book_new(); const appendSheet = (name, rows, widths) => { const sheet = XLSX.utils.json_to_sheet(rows); sheet["!cols"] = widths.map((wch) => ({ wch })); if (rows.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(sheet["!ref"])) }; XLSX.utils.book_append_sheet(workbook, sheet, name); }; appendSheet("Resumen", [{ Indicador: "Periodo", Valor: range.label }, { Indicador: "Saldo", Valor: balance }, { Indicador: "Ingresos", Valor: income }, { Indicador: "Egresos", Valor: expenses }, { Indicador: "Movimiento neto", Valor: net }, { Indicador: "Movimientos", Valor: visibleMovements.length }], [28, 24]); appendSheet("Movimientos", visibleMovements.map((movement) => ({ Fecha: formatDate(movement.createdAt ?? movement.date), Tipo: movementTypeLabel(movement), Grupo: movementTypeGroup(movement), Descripción: movement.description ?? "—", Cuenta: accounts.find((account) => account.id === movement.bankAccountId)?.name ?? movement.bankAccount?.name ?? "—", Monto: Number(movement.totalAmount ?? movement.amount ?? 0) })), [16, 22, 16, 38, 28, 18]); appendSheet("Por cuenta", visibleAccounts.map((account) => ({ Cuenta: account.name, Banco: account.bankName ?? "—", Tipo: account.accountType ?? "—", Saldo: Number(account.currentBalance ?? 0) })), [28, 24, 16, 18]); appendSheet("Por día", dailyRows, [16, 18, 18, 18]); XLSX.writeFile(workbook, `reporte-finanzas-${period}.xlsx`); }
  async function exportPdf() { const { jsPDF } = await import("jspdf"); const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }); const pageWidth = doc.internal.pageSize.getWidth(); const margin = 34; doc.setFillColor(31, 51, 77); doc.rect(0, 0, pageWidth, 76, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("MUNDO TIENDA", margin, 32); doc.setFontSize(10); doc.text("REPORTE DE FINANZAS", margin, 51); doc.setFont("helvetica", "normal"); doc.text(`Periodo: ${range.label}`, pageWidth - margin, 32, { align: "right" }); let y = 108; const cards = [["Saldo", balance], ["Ingresos", income], ["Egresos", expenses], ["Movimiento neto", net]]; const gap = 10; const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4; cards.forEach(([label, value], index) => { const x = margin + index * (cardWidth + gap); doc.setFillColor(246, 249, 252); doc.roundedRect(x, y, cardWidth, 52, 5, 5, "F"); doc.setTextColor(100, 118, 140); doc.setFontSize(9); doc.text(label, x + 10, y + 19); doc.setTextColor(31, 51, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(formatCop(value), x + 10, y + 39); doc.setFont("helvetica", "normal"); }); y += 82; doc.setTextColor(31, 51, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Detalle de movimientos", margin, y); y += 19; doc.setFillColor(43, 108, 176); doc.rect(margin, y - 12, pageWidth - margin * 2, 22, "F"); doc.setTextColor(255, 255, 255); doc.setFontSize(8); ["Fecha", "Tipo", "Descripción", "Cuenta", "Monto"].forEach((header, index) => doc.text(header, [margin + 7, margin + 80, margin + 175, margin + 440, pageWidth - margin - 7][index], y + 2, { align: index === 4 ? "right" : "left" })); y += 22; doc.setTextColor(31, 51, 77); doc.setFont("helvetica", "normal"); doc.setFontSize(8); visibleMovements.slice(0, 70).forEach((movement, index) => { if (y > 555) { doc.addPage(); y = 50; } if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 11, pageWidth - margin * 2, 19, "F"); } const values = [formatDate(movement.createdAt ?? movement.date), movementTypeLabel(movement), String(movement.description ?? "—").slice(0, 42), accounts.find((account) => account.id === movement.bankAccountId)?.name ?? movement.bankAccount?.name ?? "—", formatCop(movement.totalAmount ?? movement.amount)]; doc.text(values[0], margin + 7, y); doc.text(values[1], margin + 80, y); doc.text(values[2], margin + 175, y); doc.text(values[3], margin + 440, y); doc.text(values[4], pageWidth - margin - 7, y, { align: "right" }); y += 19; }); doc.save(`reporte-finanzas-${period}.pdf`); }
  return (
    <div className="bank-report-shell bank-report-dashboard">
      <div className="bank-section-heading">
        <div>
          <span className="bank-report-kicker">FINANZAS · CONTROL DE CAJA</span>
          <h2>Reportes financieros</h2>
          <p>Saldo, recaudos, egresos y movimientos con filtros por cuenta y periodo.</p>
        </div>
        <BarChart3 size={28} />
      </div>
      <div className="bank-report-cards">
        <div>
          <span>Saldo en cuentas</span>
          <strong>{formatCop(balance)}</strong>
        </div>
        <div>
          <span>Total ingresos</span>
          <strong>{formatCop(income)}</strong>
        </div>
        <div>
          <span>Total egresos</span>
          <strong>{formatCop(expenses)}</strong>
        </div>
        <div>
          <span>Movimiento neto</span>
          <strong>{formatCop(net)}</strong>
        </div>
      </div>
      <div className="bank-report-quick-filters"><button type="button" className={period === "TODAY" ? "is-active" : ""} onClick={() => { updateFilter(setPeriod, "TODAY"); }}>Hoy</button><button type="button" className={period === "7D" ? "is-active" : ""} onClick={() => { updateFilter(setPeriod, "7D"); }}>7 días</button><button type="button" className={period === "30D" ? "is-active" : ""} onClick={() => { updateFilter(setPeriod, "30D"); }}>30 días</button><button type="button" className={period === "90D" ? "is-active" : ""} onClick={() => { updateFilter(setPeriod, "90D"); }}>90 días</button><button type="button" className={period === "ALL" ? "is-active" : ""} onClick={() => { updateFilter(setPeriod, "ALL"); }}>Historial</button><button type="button" className={period === "CUSTOM" ? "is-active" : ""} onClick={() => { updateFilter(setPeriod, "CUSTOM"); }}><CalendarDays size={13} /> Fechas</button></div>
      <div className="bank-report-toolbar">
        <label htmlFor="bank-report-account-filter">Cuenta</label>
        <select
          id="bank-report-account-filter"
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
        >
          <option value="TODOS">Todas las cuentas</option>
          {accounts.map((account) => (
            <option value={account.id} key={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {period === "CUSTOM" && <><label>Desde<input type="date" value={from} onChange={(event) => updateFilter(setFrom, event.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={(event) => updateFilter(setTo, event.target.value)} /></label></>}
        <label>Tipo<select value={typeFilter} onChange={(event) => updateFilter(setTypeFilter, event.target.value)}><option value="TODOS">Todos</option><option value="INGRESO">Ingresos</option><option value="EGRESO">Egresos</option><option value="TRANSFERENCIA">Transferencias</option></select></label>
        <label className="bank-report-search"><Search size={14} /><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Buscar movimiento…" /></label>
        <button type="button" className="bank-report-export blue" onClick={exportPdf}><Printer size={14} /> PDF</button><button type="button" className="bank-report-export green" onClick={exportExcel}><FileSpreadsheet size={14} /> Excel</button><button type="button" className="bank-report-export amber" onClick={exportCsv}><Download size={14} /> CSV</button>
      </div>
      <div className="bank-report-note"><Filter size={13} /> {visibleMovements.length} movimiento(s) · {range.label}</div>
      <div className="bank-report-chart-grid"><section className="bank-report-chart-card"><div className="bank-report-card-title"><strong>Flujo diario</strong><span>Ingresos y egresos</span></div><ResponsiveContainer width="100%" height={235}><LineChart data={dailyRows} margin={{ top: 10, right: 10, left: -12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e9eef4" /><XAxis dataKey="date" tick={{ fill: "#7c8b9e", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#8a98aa", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={financeShortMoney} /><Tooltip content={<FinanceTooltip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /><Line type="monotone" dataKey="income" name="Ingresos" stroke="#31a56d" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="expenses" name="Egresos" stroke="#c45454" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></section><section className="bank-report-chart-card"><div className="bank-report-card-title"><strong>Distribución</strong><span>Por tipo de movimiento</span></div><ResponsiveContainer width="100%" height={235}><PieChart><Pie data={typeRows} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="78%" paddingAngle={3} stroke="none">{typeRows.map((row) => <Cell key={row.label} fill={row.color} />)}</Pie><Tooltip content={<FinanceTooltip currency />} /></PieChart></ResponsiveContainer></section></div>
      <div className="bank-report-detail">
        <div className="bank-report-detail-heading">
          <strong>Detalle de movimientos</strong>
        </div>
        <div className="bank-report-table-scroll">
          <table className="bank-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Cuenta</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {paginatedMovements.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDate(movement.createdAt ?? movement.date)}</td>
                  <td>{movementTypeLabel(movement)}</td>
                  <td>{movement.description ?? "—"}</td>
                  <td>
                    {movement.bankAccount?.name ??
                      accounts.find(
                        (account) => account.id === movement.bankAccountId,
                      )?.name ??
                      "—"}
                  </td>
                  <td className="number-cell">
                    {formatCop(movement.totalAmount ?? movement.amount)}
                  </td>
                </tr>
              ))}
              {!visibleMovements.length && (
                <tr>
                  <td colSpan="5">No hay movimientos para este filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {visibleMovements.length > 0 && <div className="bank-report-pagination"><span>Página {currentPage} de {totalPages}</span><label>Filas<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="15">15</option><option value="30">30</option><option value="50">50</option></select></label><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Siguiente</button></div>}
      </div>
    </div>
  );
}

function financeRange(period, from, to) {
  const end = period === "CUSTOM" && to ? new Date(`${to}T23:59:59`) : new Date();
  end.setHours(23, 59, 59, 999);
  if (period === "ALL") return { start: new Date(0), end, label: "Todo el historial" };
  if (period === "CUSTOM") return { start: from ? new Date(`${from}T00:00:00`) : new Date(0), end, label: `${from || "inicio"} · ${to || "hoy"}` };
  const days = { TODAY: 0, "7D": 6, "30D": 29, "90D": 89 }[period] ?? 29;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days);
  return { start, end, label: { TODAY: "Hoy", "7D": "Últimos 7 días", "30D": "Últimos 30 días", "90D": "Últimos 90 días" }[period] ?? "Periodo seleccionado" };
}

function inFinanceRange(value, range) { if (!value) return false; const dateValue = new Date(value); return dateValue >= range.start && dateValue <= range.end; }

function movementTypeGroup(movement) { const type = String(movement?.movementType ?? ""); if (type.includes("INGRESO") || type.includes("ENTRANTE")) return "INGRESO"; if (type.includes("EGRESO") || type.includes("SALIENTE")) return "EGRESO"; if (type.includes("TRANSFERENCIA")) return "TRANSFERENCIA"; return "OTROS"; }

function buildFinanceDailyRows(movements) { const rows = new Map(); movements.forEach((movement) => { const value = Number(movement.totalAmount ?? movement.amount ?? 0); const key = financeDateKey(movement.createdAt ?? movement.date ?? movement.movementDate); const row = rows.get(key) ?? { date: financeDayLabel(movement.createdAt ?? movement.date ?? movement.movementDate), income: 0, expenses: 0 }; if (isIncomeMovement(movement)) row.income += value; else if (isExpenseMovement(movement)) row.expenses += value; rows.set(key, row); }); return [...rows.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-14).map(([, row]) => row); }

function buildFinanceTypeRows(movements) { const groups = [{ label: "Ingresos", key: "INGRESO", color: "#31a56d" }, { label: "Egresos", key: "EGRESO", color: "#c45454" }, { label: "Transferencias", key: "TRANSFERENCIA", color: "#2b6cb0" }, { label: "Otros", key: "OTROS", color: "#d28a25" }]; return groups.map((group) => ({ ...group, value: movements.filter((movement) => movementTypeGroup(movement) === group.key).reduce((sum, movement) => sum + Number(movement.totalAmount ?? movement.amount ?? 0), 0) })).filter((row) => row.value > 0); }

function financeDateKey(value) { const dateValue = new Date(value); return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}-${String(dateValue.getDate()).padStart(2, "0")}`; }
function financeDayLabel(value) { return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(new Date(value)).replace(".", ""); }
function financeShortMoney(value) { const amount = Number(value ?? 0); return amount >= 1000000 ? `$${(amount / 1000000).toFixed(1)}M` : amount >= 1000 ? `$${Math.round(amount / 1000)}k` : `$${Math.round(amount)}`; }
function FinanceTooltip({ active, payload, label, currency = false }) { if (!active || !payload?.length) return null; return <div className="bank-report-tooltip"><strong>{label}</strong>{payload.map((row) => <div key={row.dataKey ?? row.name}><span>{row.name ?? row.dataKey}</span><b>{currency ? formatCop(row.value) : financeShortMoney(row.value)}</b></div>)}</div>; }
function downloadFinanceBlob(rows, filename, type) { const content = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([content], { type: type === "csv" ? "text/csv;charset=utf-8" : type })); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

function movementTypeLabel(movement) {
  const type = String(movement?.movementType ?? "");
  if (type.includes("AJUSTE")) return "Ajuste";
  if (type.includes("TRANSFERENCIA_ENTRANTE")) return "Transferencia entrante";
  if (type.includes("TRANSFERENCIA_SALIENTE")) return "Transferencia saliente";
  if (type.includes("INGRESO")) return "Ingreso";
  if (type.includes("EGRESO")) return "Egreso";
  return type || "Movimiento";
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
    gmfRate: String(account.gmfRate ?? 0.4),
    autoGmf: Boolean(account.autoGmf),
  };
}

function isActive(item) {
  return item?.isActive !== false && item?.active !== false;
}

function isIncomeMovement(movement) {
  const type = String(movement?.movementType ?? "");
  return type.includes("INGRESO") || type.includes("ENTRANTE");
}

function isExpenseMovement(movement) {
  const type = String(movement?.movementType ?? "");
  return type.includes("EGRESO") || type.includes("SALIENTE");
}

function numberOrValue(value) {
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
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
