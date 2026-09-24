import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleX,
  FileText,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Truck,
  Warehouse,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

const viewLabels = {
  billing: "Facturación",
  invoices: "Facturas",
  quotes: "Cotizaciones",
  orders: "Pedidos y domicilios",
  reports: "Reportes",
};

const invoiceStatusLabels = {
  ACTIVA: "Activa",
  ANULADA: "Anulada",
};

const invoiceValidationLabels = {
  PENDIENTE: "Pendiente de validar",
  VALIDADA: "Validada",
};

const quoteStatusLabels = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CONVERTIDA: "Convertida",
  EXPIRADA: "Expirada",
};

const deliveryStatusLabels = {
  PENDIENTE: "Pendiente",
  EN_PREPARACION: "En preparación",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

const deliveryStatusSequence = [
  "PENDIENTE",
  "EN_PREPARACION",
  "EN_CAMINO",
  "ENTREGADO",
];

const emptyCart = [];

let criticalSalesDataPromise;
let criticalSalesDataSnapshot;
let secondarySalesDataPromise;
let secondarySalesDataSnapshot;

function loadCriticalSalesData() {
  if (criticalSalesDataSnapshot)
    return Promise.resolve(criticalSalesDataSnapshot);
  if (!criticalSalesDataPromise) {
    criticalSalesDataPromise = Promise.allSettled([
      apiClient.getAllPages("/clientes", { estado: "activos" }),
      apiClient.getAllPages("/productos", { estado: "activos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
      apiClient.getAllPages("/cuentas-bancarias", { estado: "activos" }),
      apiClient.getAllPages("/usuarios", { estado: "activos" }),
    ]).then(
      ([clientsResult, productsResult, warehousesResult, accountsResult, usersResult]) => {
        criticalSalesDataSnapshot = {
          clientsResult,
          productsResult,
          warehousesResult,
          accountsResult,
          usersResult,
        };
        return criticalSalesDataSnapshot;
      },
    );
  }
  return criticalSalesDataPromise;
}

function loadSecondarySalesData() {
  if (secondarySalesDataSnapshot)
    return Promise.resolve(secondarySalesDataSnapshot);
  if (!secondarySalesDataPromise) {
    secondarySalesDataPromise = Promise.allSettled([
      apiClient.getAllPages("/facturas"),
      apiClient.getAllPages("/cotizaciones"),
      apiClient.getAllPages("/domicilios"),
      apiClient.getAllPages("/tienda/pedidos"),
    ]).then(
      ([invoicesResult, quotesResult, deliveriesResult, ordersResult]) => {
        secondarySalesDataSnapshot = {
          invoicesResult,
          quotesResult,
          deliveriesResult,
          ordersResult,
        };
        return secondarySalesDataSnapshot;
      },
    );
  }
  return secondarySalesDataPromise;
}

function invalidateSalesDataCache() {
  criticalSalesDataPromise = undefined;
  criticalSalesDataSnapshot = undefined;
  secondarySalesDataPromise = undefined;
  secondarySalesDataSnapshot = undefined;
}

export function SalesWindow({
  initialView = "billing",
  initialDocumentId = null,
  session,
  onClose,
  onOpenView,
  onRequestLogin,
}) {
  const [view, setView] = useState(
    ["billing", "quotes", "orders", "reports"].includes(initialView)
      ? initialView
      : "billing",
  );
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [warehouseUsers, setWarehouseUsers] = useState([]);
  const [salesUsers, setSalesUsers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [saleMode, setSaleMode] = useState("CONTADO");
  const [creditDueDate, setCreditDueDate] = useState(defaultDueDate());
  const [cart, setCart] = useState(emptyCart);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastDocument, setLastDocument] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [quoteDispatch, setQuoteDispatch] = useState(null);
  const [deliveryEditor, setDeliveryEditor] = useState(null);
  const [lookupType, setLookupType] = useState(null);
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    loadCriticalSalesData().then(
      ({ clientsResult, productsResult, warehousesResult, accountsResult, usersResult }) => {
        if (cancelled) return;
        if (clientsResult.status === "fulfilled") {
          const nextClients = clientsResult.value;
          setClients(nextClients);
          setSelectedClientId(
            String(
              nextClients.find(isConsumerFinal)?.id ?? nextClients[0]?.id ?? "",
            ),
          );
        }
        if (productsResult.status === "fulfilled")
          setProducts(productsResult.value.filter(isActive));
        if (warehousesResult.status === "fulfilled") {
          const nextWarehouses = warehousesResult.value.filter(isActive);
          setWarehouses(nextWarehouses);
          setSelectedWarehouseId(String(nextWarehouses[0]?.id ?? ""));
        }
        if (accountsResult.status === "fulfilled") {
          const nextAccounts = accountsResult.value.filter(isActive);
          setBankAccounts(nextAccounts);
          setSelectedAccountId(String(nextAccounts[0]?.id ?? ""));
        }
        if (usersResult?.status === "fulfilled") {
          const activeSalesUsers = usersResult.value.filter(
            (user) =>
              user.isActive &&
              ["ADMIN", "CAJERO", "VENDEDOR", "CONTADOR"].includes(user.role),
          );
          setSalesUsers(activeSalesUsers);
          setSelectedSellerId(
            String(
              activeSalesUsers.find(
                (user) => String(user.id) === String(session?.sub),
              )?.id ?? activeSalesUsers[0]?.id ?? "",
            ),
          );
          setWarehouseUsers(
            usersResult.value.filter(
              (user) => user.role === "BODEGA" && user.isActive,
            ),
          );
        }
        const requiredFailure = [clientsResult, productsResult].find(
          (result) => result.status === "rejected",
        );
        if (requiredFailure) {
          setError(
            `No se pudo cargar Ventas: ${requiredFailure.reason?.message ?? "verifica la conexión con el sistema"}`,
          );
          if (isAuthError(requiredFailure.reason)) onRequestLogin?.();
        }
        setLoading(false);
      },
    );
    loadSecondarySalesData().then(
      ({ invoicesResult, quotesResult, deliveriesResult, ordersResult }) => {
        if (cancelled) return;
        if (invoicesResult.status === "fulfilled") {
          const nextInvoices = invoicesResult.value;
          setInvoices(nextInvoices);
          if (initialDocumentId) {
            const targetInvoice = nextInvoices.find(
              (invoice) => Number(invoice.id) === Number(initialDocumentId),
            );
            if (targetInvoice) {
              setSelectedDocument({
                ...targetInvoice,
                __salesType: "invoice",
              });
            } else {
              setError(
                "La factura de la notificación ya no está disponible para consultar.",
              );
            }
          }
        }
        if (quotesResult.status === "fulfilled") setQuotes(quotesResult.value);
        if (deliveriesResult.status === "fulfilled")
          setDeliveries(deliveriesResult.value);
        if (ordersResult.status === "fulfilled") setOrders(ordersResult.value);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [initialDocumentId, onRequestLogin]);

  const activeProducts = useMemo(
    () =>
      products.filter(isActive).filter((product) => getDefaultPrice(product)),
    [products],
  );
  const cartTotals = useMemo(() => calculateCartTotals(cart), [cart]);
  const selectedClient = clients.find(
    (client) => String(client.id) === String(selectedClientId),
  );
  const selectedWarehouse = warehouses.find(
    (warehouse) => String(warehouse.id) === String(selectedWarehouseId),
  );
  const selectedSeller = salesUsers.find(
    (user) => String(user.id) === String(selectedSellerId),
  );
  const canManageDocuments = [
    "ADMIN",
    "CAJERO",
    "VENDEDOR",
    "CONTADOR",
  ].includes(session?.role);
  const canManageDeliveries = session?.role === "ADMIN";

  useEffect(() => {
    if (!selectedClient) return;
    setCart((current) => {
      let changed = false;
      const next = current.map((item) => {
        const price = getPriceForClient(item.product, selectedClient);
        if (!price || Number(price.id) === Number(item.productPriceId)) return item;
        changed = true;
        return { ...item, productPriceId: price.id };
      });
      return changed ? next : current;
    });
  }, [selectedClient?.id, selectedClient?.clientType]);
  const salesViews = [
    "billing",
    "quotes",
    "orders",
    "reports",
  ];
  const salesViewIndex = salesViews.indexOf(view);

  function navigate(nextView) {
    if (nextView !== view && onOpenView) {
      onOpenView(nextView);
      return;
    }
    setView(nextView);
    setError("");
    setNotice("");
    setLastDocument(null);
    setLookupType(null);
  }

  function moveSalesView(offset) {
    const nextView = salesViews[salesViewIndex + offset];
    if (nextView) navigate(nextView);
  }

  function openLookup(type) {
    setLookupType(type);
    setError("");
  }

  function handleLookupSelection(item) {
    if (lookupType === "clients") {
      setSelectedClientId(String(item.id));
      setLookupType(null);
      return;
    }
    if (lookupType === "warehouses") {
      setSelectedWarehouseId(String(item.id));
      setLookupType(null);
      return;
    }
    if (lookupType === "products") {
      addProduct(item);
      setLookupType(null);
      return;
    }
    if (lookupType === "invoices") {
      setSelectedDocument({ ...item, __salesType: "invoice" });
      setLookupType(null);
      return;
    }
    if (lookupType === "quotes") loadQuoteIntoBilling(item);
  }

  function loadQuoteIntoBilling(quote) {
    const loadedItems = (quote.items ?? [])
      .map((item) => {
        const product =
          products.find((candidate) => candidate.id === item.productId) ??
          item.product;
        const price = getPriceById(product, item.productPriceId);
        if (!product || !price) return null;
        return {
          product,
          productId: product.id,
          productPriceId: price.id,
          quantity: Number(item.quantity),
        };
      })
      .filter(Boolean);
    if (!loadedItems.length) {
      setError("No se pudieron cargar los productos de esta cotización.");
      return;
    }
    setCart(loadedItems);
    if (quote.clientId ?? quote.client?.id)
      setSelectedClientId(String(quote.clientId ?? quote.client.id));
    setSaleMode("CONTADO");
    setView("billing");
    setLookupType(null);
    setLastDocument(null);
    setError("");
      setNotice(`Cotización ${quote.consecutive} cargada en facturación.`);
  }

  function openQuoteDispatch(quote) {
    setQuoteDispatch(quote);
    setError("");
  }

  async function sendQuoteToWarehouse(userId) {
    if (!quoteDispatch || !userId) return;
    const actionKey = `quote-send-${quoteDispatch.id}`;
    setActionLoading(actionKey);
    setError("");
    try {
      const result = await apiClient.post(
        `/cotizaciones/${quoteDispatch.id}/enviar-bodega`,
        { userId: Number(userId) },
      );
      setQuoteDispatch(null);
      setNotice(
        `Cotización ${quoteDispatch.consecutive} enviada a ${result.recipient.username} · ${result.recipient.warehouse}.`,
      );
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setActionLoading("");
    }
  }

  function handleSalesShortcut(event) {
    if (event.key === "Escape" && lookupType) {
      event.preventDefault();
      event.stopPropagation();
      setLookupType(null);
      return;
    }
    if (
      !event.key.startsWith("F") ||
      !["F1", "F2", "F4", "F5", "F6", "F7"].includes(event.key)
    )
      return;
    if (lookupType) return;
    if (event.key === "F4") return;
    event.preventDefault();
    if (event.key === "F1") openLookup("clients");
    if (event.key === "F2") openLookup("clients");
    if (event.key === "F5") openLookup("products");
    if (event.key === "F6") openLookup("invoices");
    if (event.key === "F7") openLookup("quotes");
  }

  useEffect(() => {
    function handleGlobalSalesShortcut(event) {
      if (event.key !== "F4") return;
      event.preventDefault();
      event.stopPropagation();
      setLookupType(null);
      setError("");
      setNotice("");
      setLastDocument(null);
      setView("billing");
    }

    window.addEventListener("keydown", handleGlobalSalesShortcut);
    return () => window.removeEventListener("keydown", handleGlobalSalesShortcut);
  }, []);

  function addProduct(product) {
    const price = getPriceForClient(product, selectedClient);
    if (!price) {
      setError(`El producto ${product.name} no tiene un precio activo.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...current,
        {
          product,
          productId: product.id,
          productPriceId: price.id,
          quantity: 1,
        },
      ];
    });
    setError("");
  }

  function updateCartQuantity(productId, nextQuantity) {
    if (nextQuantity <= 0) {
      setCart((current) =>
        current.filter((item) => item.productId !== productId),
      );
      return;
    }
    setCart((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: nextQuantity }
          : item,
      ),
    );
  }

  function updateCartPrice(productId, productPriceId) {
    setCart((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, productPriceId: Number(productPriceId) }
          : item,
      ),
    );
  }

  async function addBarcodeToCart(code) {
    const normalized = code.trim();
    if (!normalized) return;
    const localProduct = activeProducts.find((product) =>
      (product.barcodes ?? []).some(
        (barcode) => barcode.code?.toLowerCase() === normalized.toLowerCase(),
      ),
    );
    if (localProduct) {
      addProduct(localProduct);
      return;
    }
    try {
      const product = await apiClient.get(
        `/productos/codigo-barras/${encodeURIComponent(normalized)}`,
      );
      addProduct(product);
    } catch (requestError) {
      setError(requestError.message || "No se encontró el código de barras.");
      if (isAuthError(requestError)) onRequestLogin?.();
    }
  }

  async function saveInvoice() {
    if (!cart.length) {
      setError("Agrega al menos un producto para facturar.");
      return;
    }
    if (saleMode === "CONTADO" && !selectedAccountId) {
      setError("Selecciona una cuenta bancaria para registrar el recaudo.");
      return;
    }
    if (saleMode === "CREDITO" && !creditDueDate) {
      setError("Selecciona la fecha de vencimiento del crédito.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const invoice = await apiClient.post("/facturas", {
        clientId: selectedClientId ? Number(selectedClientId) : undefined,
        warehouseId: selectedWarehouseId
          ? Number(selectedWarehouseId)
          : undefined,
        source: "POS",
        saleMode,
        items: cart.map((item) => ({
          productId: item.productId,
          productPriceId: item.productPriceId,
        warehouseId: selectedWarehouseId
            ? Number(selectedWarehouseId)
            : undefined,
          quantity: item.quantity,
        })),
        createdByUserId: selectedSellerId
          ? Number(selectedSellerId)
          : undefined,
      });

      if (saleMode === "CONTADO") {
        await apiClient.post("/movimientos-bancarios/ingreso", {
          bankAccountId: Number(selectedAccountId),
          amount: Number(invoice.total),
          invoiceId: invoice.id,
          description: `Recaudo venta ${invoice.consecutive}`,
        });
      } else {
        await apiClient.post(`/facturas/${invoice.id}/credito`, {
          dueDate: new Date(`${creditDueDate}T00:00:00`).toISOString(),
        });
      }

      setInvoices((current) => [invoice, ...current]);
      invalidateSalesDataCache();
      setLastDocument(invoice);
      setNotice(`Factura ${invoice.consecutive} creada correctamente.`);
      setCart(emptyCart);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  async function saveQuote() {
    if (!selectedClientId) {
      setError("Selecciona un cliente para crear la cotización.");
      return;
    }
    if (!cart.length) {
      setError("Agrega al menos un producto para crear la cotización.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const quote = await apiClient.post("/cotizaciones", {
        clientId: Number(selectedClientId),
        expiresAt: new Date(`${creditDueDate}T00:00:00`).toISOString(),
        items: cart.map((item) => ({
          productId: item.productId,
          productPriceId: item.productPriceId,
          quantity: item.quantity,
        })),
      });
      setQuotes((current) => [quote, ...current]);
      invalidateSalesDataCache();
      setLastDocument(quote);
      setNotice(`Cotización ${quote.consecutive} creada correctamente.`);
      setCart(emptyCart);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  async function updateInvoiceStatus(invoice) {
    if (invoice.status === "ANULADA") return;
    if (!window.confirm(`¿Deseas anular la factura ${invoice.consecutive}?`))
      return;
    const actionKey = `invoice-annul-${invoice.id}`;
    setActionLoading(actionKey);
    setError("");
    setNotice("");
    try {
      const saved = await apiClient.delete(`/facturas/${invoice.id}`);
      setInvoices((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      invalidateSalesDataCache();
      setSelectedDocument(null);
      setNotice(`Factura ${invoice.consecutive} anulada y existencias devueltas.`);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setActionLoading("");
    }
  }

  async function validateInvoice(invoice) {
    if (invoice.validationStatus !== "PENDIENTE") return;
    const actionKey = `invoice-validate-${invoice.id}`;
    setActionLoading(actionKey);
    setError("");
    setNotice("");
    try {
      const saved = await apiClient.patch(`/facturas/${invoice.id}/validar`);
      setInvoices((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      invalidateSalesDataCache();
      setNotice(`Factura ${invoice.consecutive} validada correctamente.`);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setActionLoading("");
    }
  }

  async function updateQuoteStatus(quote, status) {
    const actionKey = `quote-status-${quote.id}`;
    setActionLoading(actionKey);
    setError("");
    setNotice("");
    try {
      const saved = await apiClient.patch(`/cotizaciones/${quote.id}/estado`, {
        status,
      });
      setQuotes((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      invalidateSalesDataCache();
      setNotice(`Cotización ${quote.consecutive} actualizada.`);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setActionLoading("");
    }
  }

  async function convertQuote(quote) {
    if (
      !window.confirm(
        `¿Convertir la cotización ${quote.consecutive} en una factura?`,
      )
    )
      return;
    const actionKey = `quote-convert-${quote.id}`;
    setActionLoading(actionKey);
    setError("");
    setNotice("");
    try {
      const invoice = await apiClient.post(
        `/cotizaciones/${quote.id}/convertir-factura`,
      );
      setQuotes((current) =>
        current.map((item) =>
          item.id === quote.id ? { ...item, status: "CONVERTIDA" } : item,
        ),
      );
      setInvoices((current) => [invoice, ...current]);
      invalidateSalesDataCache();
      setNotice(`Cotización ${quote.consecutive} convertida en factura.`);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setActionLoading("");
    }
  }

  async function updateDeliveryStatus(delivery, status) {
    if (!canManageDeliveries) return;
    const actionKey = `delivery-status-${delivery.id}`;
    setActionLoading(actionKey);
    setError("");
    setNotice("");
    try {
      const saved = await apiClient.patch(`/domicilios/${delivery.id}/estado`, {
        status,
      });
      setDeliveries((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      invalidateSalesDataCache();
      setNotice(`Entrega ${delivery.id} actualizada.`);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setActionLoading("");
    }
  }

  function startDelivery(invoice = null) {
    const target =
      invoice ??
      invoices.find((item) => item.status === "ACTIVA" && !item.delivery);
    if (!target) {
      setError("No hay una factura activa disponible para crear la entrega.");
      return;
    }
    setDeliveryEditor({
      invoiceId: String(target.id),
      address: target.client?.address ?? "",
      recipientName: clientName(target.client),
      recipientPhone: target.client?.phone ?? "",
      notes: "",
    });
    setError("");
  }

  async function saveDelivery() {
    if (!deliveryEditor) return;
    if (
      !deliveryEditor.invoiceId ||
      deliveryEditor.address.trim().length < 5 ||
      deliveryEditor.recipientName.trim().length < 2 ||
      deliveryEditor.recipientPhone.trim().length < 5
    ) {
      setError("Completa factura, dirección, destinatario y teléfono.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const delivery = await apiClient.post("/domicilios", {
        invoiceId: Number(deliveryEditor.invoiceId),
        address: deliveryEditor.address.trim(),
        recipientName: deliveryEditor.recipientName.trim(),
        recipientPhone: deliveryEditor.recipientPhone.trim(),
        notes: deliveryEditor.notes.trim() || undefined,
      });
      setDeliveries((current) => [delivery, ...current]);
      invalidateSalesDataCache();
      setDeliveryEditor(null);
      setNotice(`Nota de entrega ${delivery.id} creada correctamente.`);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  const windowTitle = viewLabels[view] ?? "Ventas";

  return (
    <section
      className={`provider-window sales-window sales-window-${view} ${isDragging ? "is-dragging" : ""}`}
      aria-label={`Módulo de ventas · ${windowTitle}`}
      style={windowStyle}
      onKeyDownCapture={handleSalesShortcut}
    >
      <header
        className="provider-titlebar drag-handle sales-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <ReceiptText size={14} />
        </div>
        <strong>{windowTitle.toUpperCase()}</strong>
        <span className="sales-title-context">MÓDULO DE VENTAS</span>
        <span className="sales-mode-label">MODO: NORMAL</span>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar ventas"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content sales-content">
        {loading ? (
          <SalesLoadingState />
        ) : view === "billing" ? (
          <BillingPanel
            bankAccounts={bankAccounts}
            selectedClient={selectedClient}
            selectedWarehouse={selectedWarehouse}
            selectedSeller={selectedSeller}
            selectedSellerId={selectedSellerId}
            salesUsers={salesUsers}
            selectedAccountId={selectedAccountId}
            saleMode={saleMode}
            creditDueDate={creditDueDate}
            cart={cart}
            totals={cartTotals}
            documentNumber={lastDocument?.consecutive ?? "000000"}
            saving={saving}
            notice={notice}
            onDismissNotice={() => setNotice("")}
            lastDocument={lastDocument}
            invoices={invoices}
            onSelectInvoice={setSelectedDocument}
            onAnnulInvoice={
              canManageDocuments && session?.role === "ADMIN"
                ? updateInvoiceStatus
                : undefined
            }
            onValidateInvoice={
              ["ADMIN", "CONTADOR"].includes(session?.role)
                ? validateInvoice
                : undefined
            }
            actionLoading={actionLoading}
            onAccountChange={setSelectedAccountId}
            onSellerChange={setSelectedSellerId}
            onSaleModeChange={setSaleMode}
            onDueDateChange={setCreditDueDate}
            onUpdateQuantity={updateCartQuantity}
            onUpdatePrice={updateCartPrice}
            onClearCart={() => setCart(emptyCart)}
            onSubmit={saveInvoice}
            onOpenClientLookup={() => openLookup("clients")}
            onOpenWarehouseLookup={() => openLookup("warehouses")}
            onOpenProductLookup={() => openLookup("products")}
            onReprint={() => openLookup("invoices")}
            onLoadQuote={() => openLookup("quotes")}
            onGoToBilling={() => navigate("billing")}
          />
        ) : view === "quotes" ? (
          <QuotePanel
            clients={clients}
            selectedClientId={selectedClientId}
            creditDueDate={creditDueDate}
            cart={cart}
            totals={cartTotals}
            saving={saving}
            actionLoading={actionLoading}
            quotes={quotes}
            onClientChange={setSelectedClientId}
            onDueDateChange={setCreditDueDate}
            onAddProduct={addProduct}
            onBarcode={addBarcodeToCart}
            onUpdateQuantity={updateCartQuantity}
            onUpdatePrice={updateCartPrice}
            onClearCart={() => setCart(emptyCart)}
            onSubmit={saveQuote}
            onOpenProductLookup={() => openLookup("products")}
            onOpenLoadLookup={() => openLookup("quotes")}
            onLoadQuote={loadQuoteIntoBilling}
            onUpdateStatus={updateQuoteStatus}
            onConvert={convertQuote}
            onSelect={setSelectedDocument}
            onSendToWarehouse={openQuoteDispatch}
            onGoToBilling={() => navigate("billing")}
            onReprint={() => openLookup("invoices")}
          />
        ) : view === "orders" ? (
          <OrdersPanel
            orders={orders}
            deliveries={deliveries}
            actionLoading={actionLoading}
            canManage={canManageDeliveries}
            onSelect={setSelectedDocument}
            onPrepareDelivery={startDelivery}
            onUpdateStatus={updateDeliveryStatus}
            onCreateDelivery={() => startDelivery()}
          />
        ) : view === "reports" ? (
          <ReportsPanel invoices={invoices} quotes={quotes} orders={orders} />
        ) : (
          <div className="module-loading">Selecciona una operación de ventas.</div>
        )}
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
      <footer className="provider-window-footer sales-window-footer">
        <span className="sales-window-footer-caption">
          Módulo de Ventas · {viewLabels[view]}
        </span>
        <div className="provider-navigation-actions">
          <button
            type="button"
            disabled={salesViewIndex <= 0}
            onClick={() => moveSalesView(-1)}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={
              salesViewIndex < 0 || salesViewIndex >= salesViews.length - 1
            }
            onClick={() => moveSalesView(1)}
          >
            Próximo
          </button>
          <button type="button" className="exit-action" onClick={onClose}>
            <CircleX size={14} /> Salir
          </button>
        </div>
      </footer>
      {deliveryEditor && (
        <DeliveryEditor
          editor={deliveryEditor}
          invoices={invoices}
          saving={saving}
          onChange={(field, value) =>
            setDeliveryEditor((current) => ({ ...current, [field]: value }))
          }
          onSave={saveDelivery}
          onCancel={() => setDeliveryEditor(null)}
        />
      )}
      {lookupType && (
        <SalesLookupDialog
          type={lookupType}
          clients={clients}
          products={activeProducts}
          warehouses={warehouses}
          invoices={invoices}
          quotes={quotes}
          onClose={() => setLookupType(null)}
          onSelect={handleLookupSelection}
          onLoadQuote={loadQuoteIntoBilling}
        />
      )}
      {selectedDocument && (
        <SalesDocumentDialog
          document={selectedDocument}
          type={selectedDocument.__salesType}
          onPrint={() => window.print()}
          onAnnul={
            selectedDocument.__salesType === "invoice" &&
            canManageDocuments &&
            session?.role === "ADMIN"
              ? updateInvoiceStatus
              : undefined
          }
          actionLoading={actionLoading}
          onClose={() => setSelectedDocument(null)}
        />
      )}
      {quoteDispatch && (
        <WarehouseDispatchDialog
          quote={quoteDispatch}
          users={warehouseUsers}
          warehouses={warehouses}
          busy={actionLoading === `quote-send-${quoteDispatch.id}`}
          onSend={sendQuoteToWarehouse}
          onClose={() => setQuoteDispatch(null)}
        />
      )}
    </section>
  );
}

function BillingPanel({
  bankAccounts,
  selectedClient,
  selectedWarehouse,
  selectedSeller,
  selectedSellerId,
  salesUsers,
  selectedAccountId,
  saleMode,
  creditDueDate,
  cart,
  totals,
  documentNumber,
  saving,
  notice,
  onDismissNotice,
  lastDocument,
  invoices,
  onSelectInvoice,
  onAnnulInvoice,
  onValidateInvoice,
  actionLoading,
  onAccountChange,
  onSellerChange,
  onSaleModeChange,
  onDueDateChange,
  onUpdateQuantity,
  onUpdatePrice,
  onClearCart,
  onSubmit,
  onOpenClientLookup,
  onOpenWarehouseLookup,
  onOpenProductLookup,
  onReprint,
  onLoadQuote,
  onGoToBilling,
}) {
  const [billingTab, setBillingTab] = useState("new");

  return (
    <div className="sales-billing-panel sales-billing-single">
      <div className="sales-billing-tabs" role="tablist" aria-label="Facturación">
        <button
          type="button"
          className={billingTab === "new" ? "is-active" : ""}
          role="tab"
          aria-selected={billingTab === "new"}
          onClick={() => setBillingTab("new")}
        >
          Emitir factura
        </button>
        <button
          type="button"
          className={billingTab === "history" ? "is-active" : ""}
          role="tab"
          aria-selected={billingTab === "history"}
          onClick={() => setBillingTab("history")}
        >
          Facturas registradas <span>{invoices.length}</span>
        </button>
      </div>
      {billingTab === "new" ? (
        <TicketPanel
          bankAccounts={bankAccounts}
          selectedClient={selectedClient}
          selectedWarehouse={selectedWarehouse}
          selectedSeller={selectedSeller}
          selectedSellerId={selectedSellerId}
          salesUsers={salesUsers}
          selectedAccountId={selectedAccountId}
          saleMode={saleMode}
          creditDueDate={creditDueDate}
          cart={cart}
          totals={totals}
          saving={saving}
          onDismissNotice={onDismissNotice}
          notice={notice}
          lastDocument={lastDocument}
          documentNumber={documentNumber}
          onAccountChange={onAccountChange}
          onSellerChange={onSellerChange}
          onSaleModeChange={onSaleModeChange}
          onDueDateChange={onDueDateChange}
          onUpdateQuantity={onUpdateQuantity}
          onUpdatePrice={onUpdatePrice}
          onClearCart={onClearCart}
          onSubmit={onSubmit}
          submitLabel="Emitir factura"
          onOpenClientLookup={onOpenClientLookup}
          onOpenWarehouseLookup={onOpenWarehouseLookup}
          onOpenProductLookup={onOpenProductLookup}
          onReprint={onReprint}
          onLoadQuote={onLoadQuote}
          onGoToBilling={onGoToBilling}
        />
      ) : (
        <InvoicePanel
          title="Facturas registradas"
          description="Consulta las facturas creadas desde POS, Administrativo y App móvil."
          invoices={invoices}
          actionLabel="Emitir factura"
          onAction={() => setBillingTab("new")}
          onAnnul={onAnnulInvoice}
          onValidateInvoice={onValidateInvoice}
          actionLoading={actionLoading}
          onSelect={onSelectInvoice}
        />
      )}
    </div>
  );
}

function QuotePanel({
  clients,
  selectedClientId,
  creditDueDate,
  cart,
  totals,
  saving,
  actionLoading,
  quotes,
  onClientChange,
  onDueDateChange,
  onUpdateQuantity,
  onUpdatePrice,
  onClearCart,
  onSubmit,
  onOpenProductLookup,
  onOpenLoadLookup,
  onLoadQuote,
  onUpdateStatus,
  onConvert,
  onSelect,
  onSendToWarehouse,
  onGoToBilling,
  onReprint,
}) {
  return (
    <div className="sales-quote-layout sales-quote-single">
      <div className="sales-quote-builder">
        <SalesPanelHeading
          title="Emisión de cotización"
          description="Guarda la cotización para cargarla después en facturación."
          actionLabel="F7 Cargar cotización"
          onAction={onOpenLoadLookup}
        />
        <div className="sales-inline-form">
          <label>
            <span>Cliente</span>
            <select
              value={selectedClientId}
              onChange={(event) => onClientChange(event.target.value)}
            >
              <option value="">Selecciona un cliente</option>
              {clients.map((client) => (
                <option value={client.id} key={client.id}>
                  {clientName(client)} · {client.identification}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Vigente hasta</span>
            <input
              type="date"
              value={creditDueDate}
              onChange={(event) => onDueDateChange(event.target.value)}
            />
          </label>
        </div>
        <SalesShortcutBar
          onSales={onGoToBilling}
          onProducts={onOpenProductLookup}
          onReprint={onReprint}
          onLoad={onOpenLoadLookup}
        />
        <CartTable
          cart={cart}
          totals={totals}
          onUpdateQuantity={onUpdateQuantity}
          onUpdatePrice={onUpdatePrice}
          onClearCart={onClearCart}
          onOpenProductLookup={onOpenProductLookup}
        />
        <div className="sales-submit-row">
          <strong>Total propuesto: {formatCurrency(totals.total)}</strong>
          <button
            type="button"
            className="primary-action"
            onClick={onSubmit}
            disabled={saving}
          >
            <Check size={14} /> {saving ? "Guardando…" : "Guardar cotización"}
          </button>
        </div>
      </div>
      <div className="sales-quote-register-note">
        <FileText size={17} />
        <div>
          <strong>{quotes.length} cotizaciones guardadas</strong>
          <span>
            Usa “F7 Cargar cotización” para buscarlas y pasarlas a facturación.
          </span>
        </div>
      </div>
      <QuoteList
        quotes={quotes}
        actionLoading={actionLoading}
        onUpdateStatus={onUpdateStatus}
        onConvert={onConvert}
        onSelect={onSelect}
        onLoad={onLoadQuote}
        onExport={onSelect}
        onSendToWarehouse={onSendToWarehouse}
      />
    </div>
  );
}

function SalesContextField({
  label,
  code,
  description,
  shortcuts = [],
  onShortcut,
  children,
}) {
  function openLookupFromInput() {
    onShortcut?.();
  }

  return (
    <div className="sales-context-field">
      <div className="sales-context-field-top">
        <span>{label}</span>
        <input
          value={code}
          readOnly
          aria-label={label}
          onFocus={openLookupFromInput}
          onClick={openLookupFromInput}
          onKeyDown={(event) => {
            if (["Enter", "F1", "F2"].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              openLookupFromInput();
            }
          }}
        />
        {shortcuts.map((shortcut) => (
          <button
            type="button"
            key={shortcut}
            onClick={onShortcut}
            aria-label={`${shortcut} ${label}`}
          >
            {shortcut}
          </button>
        ))}
      </div>
      {children ?? <strong title={description}>{description}</strong>}
    </div>
  );
}

function SalesShortcutBar({ onSales, onProducts, onReprint, onLoad }) {
  const shortcuts = [
    ["F4", "Facturación", onSales, ReceiptText],
    ["F5", "Productos", onProducts, Package],
    ["F6", "Reimprime", onReprint, FileText],
    ["F7", "Cargar", onLoad, ShoppingCart],
  ];
  return (
    <div className="sales-shortcut-bar" aria-label="Atajos de facturación">
      {shortcuts.map(([key, label, action, Icon]) => (
        <button type="button" key={key} onClick={action} disabled={!action}>
          <kbd>{key}</kbd>
          <Icon size={13} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function TicketPanel({
  bankAccounts,
  selectedClient,
  selectedWarehouse,
  selectedSeller,
  selectedSellerId,
  salesUsers,
  selectedAccountId,
  saleMode,
  creditDueDate,
  cart,
  totals,
  documentNumber,
  saving,
  notice,
  onDismissNotice,
  lastDocument,
  onAccountChange,
  onSellerChange,
  onSaleModeChange,
  onDueDateChange,
  onUpdateQuantity,
  onUpdatePrice,
  onClearCart,
  onSubmit,
  submitLabel,
  onOpenClientLookup,
  onOpenWarehouseLookup,
  onOpenProductLookup,
  onReprint,
  onLoadQuote,
  onGoToBilling,
}) {
  return (
    <aside className="sales-ticket-panel">
      <div className="sales-billing-top">
        <div className="sales-billing-context">
          <div className="sales-legacy-context">
            <SalesContextField
              label="Cliente"
              code={clientCode(selectedClient)}
              description={clientName(selectedClient)}
              shortcuts={["F1", "F2"]}
              onShortcut={onOpenClientLookup}
            />
            <SalesContextField
              label="Vendedor"
              code={selectedSeller?.id ? `U${selectedSeller.id}` : "—"}
              description={selectedSeller?.username ?? "Seleccionar vendedor"}
            >
              <select
                className="sales-seller-select"
                value={selectedSellerId}
                onChange={(event) => onSellerChange?.(event.target.value)}
                aria-label="Vendedor"
              >
                <option value="">Seleccionar vendedor</option>
                {salesUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username} · {user.role}
                  </option>
                ))}
              </select>
            </SalesContextField>
            <SalesContextField
              label="Depósito"
              code={
                selectedWarehouse
                  ? String(selectedWarehouse.id).padStart(3, "0")
                  : "AUTO"
              }
              description={
                selectedWarehouse?.location ?? "Asignación automática"
              }
              shortcuts={["F1"]}
              onShortcut={onOpenWarehouseLookup}
            />
          </div>
          <SalesShortcutBar
            onSales={onGoToBilling}
            onProducts={onOpenProductLookup}
            onReprint={onReprint}
            onLoad={onLoadQuote}
          />
          <SalesPaymentBox
            bankAccounts={bankAccounts}
            selectedAccountId={selectedAccountId}
            saleMode={saleMode}
            creditDueDate={creditDueDate}
            total={totals.total}
            onAccountChange={onAccountChange}
            onSaleModeChange={onSaleModeChange}
            onDueDateChange={onDueDateChange}
          />
        </div>
        <BillingTotalsPanel
          documentNumber={documentNumber}
          cart={cart}
          totals={totals}
        />
      </div>
      <CartTable
        cart={cart}
        totals={totals}
        onUpdateQuantity={onUpdateQuantity}
        onUpdatePrice={onUpdatePrice}
        onClearCart={onClearCart}
        onOpenProductLookup={onOpenProductLookup}
      />
      <div className="sales-document-footer">
        <button
          type="button"
          className="sales-submit-button sales-submit-footer-button"
          onClick={onSubmit}
          disabled={saving}
        >
          <Check size={13} /> {saving ? "Procesando…" : submitLabel}
        </button>
      </div>
      {notice && (
        <TransientMessage
          className="sales-success-message"
          icon={<Check size={14} />}
          onDismiss={onDismissNotice}
        >
          {notice}
        </TransientMessage>
      )}
      {lastDocument && (
        <div className="sales-last-document">
          <span>Último documento</span>
          <strong>{lastDocument.consecutive}</strong>
          <small>{formatCurrency(lastDocument.total)}</small>
        </div>
      )}
    </aside>
  );
}

function SalesPaymentBox({
  bankAccounts,
  selectedAccountId,
  saleMode,
  creditDueDate,
  total,
  onAccountChange,
  onSaleModeChange,
  onDueDateChange,
}) {
  return (
    <div className="sales-payment-box">
      <div className="sales-payment-heading">
        <span>Forma de pago</span>
        <strong>{formatCurrency(total)}</strong>
      </div>
      <div className="sales-payment-options">
        <label className={saleMode === "CONTADO" ? "is-selected" : ""}>
          <input
            type="radio"
            checked={saleMode === "CONTADO"}
            onChange={() => onSaleModeChange("CONTADO")}
          />
          <span>Contado</span>
        </label>
        <label className={saleMode === "CREDITO" ? "is-selected" : ""}>
          <input
            type="radio"
            checked={saleMode === "CREDITO"}
            onChange={() => onSaleModeChange("CREDITO")}
          />
          <span>Crédito</span>
        </label>
      </div>
      {saleMode === "CONTADO" ? (
        <label>
          <span>Cuenta de recaudo</span>
          <select
            value={selectedAccountId}
            onChange={(event) => onAccountChange(event.target.value)}
          >
            <option value="">Selecciona una cuenta</option>
            {bankAccounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.name} · {account.bankName}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          <span>Vencimiento del crédito</span>
          <input
            type="date"
            value={creditDueDate}
            onChange={(event) => onDueDateChange(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}

function BillingTotalsPanel({ documentNumber, cart, totals }) {
  const quantity = cart.reduce(
    (total, item) => total + Number(item.quantity ?? 0),
    0,
  );
  return (
    <aside className="sales-billing-totals" aria-label="Totales de la factura">
      <strong>Factura N° {documentNumber}</strong>
      <div>
        <span>Total renglones</span>
        <b>{formatCurrency(totals.subtotal)}</b>
      </div>
      <div>
        <span>Impuestos</span>
        <b>{formatCurrency(totals.taxes)}</b>
      </div>
      <div>
        <span>Total</span>
        <b>{formatCurrency(totals.total)}</b>
      </div>
      <div>
        <span>Vuelto</span>
        <b>{formatCurrency(0)}</b>
      </div>
      <footer>
        <span>Total cantidad o piezas</span>
        <b>{quantity}</b>
      </footer>
    </aside>
  );
}

function CartTable({
  cart,
  totals,
  onUpdateQuantity,
  onUpdatePrice,
  onClearCart,
  onOpenProductLookup,
}) {
  const blankRowCount = Math.max(12, 16 - cart.length);

  function handleTableClick(event) {
    if (!onOpenProductLookup) return;
    if (event.target.closest("button, select, input, a")) return;
    onOpenProductLookup();
  }

  function handleTableKeyDown(event) {
    if (!onOpenProductLookup) return;
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    onOpenProductLookup();
  }

  return (
    <div className="sales-cart">
      <div
        className="sales-cart-table-wrap"
        role="button"
        tabIndex="0"
        aria-label="Abrir productos para agregar a la venta"
        onClick={handleTableClick}
        onKeyDown={handleTableKeyDown}
      >
        <table className="sales-cart-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Cantidad</th>
              <th>Und</th>
              <th>Precio</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item) => {
              const price =
                getPriceById(item.product, item.productPriceId) ??
                getDefaultPrice(item.product);
              return (
                <tr key={item.productId}>
                  <td>
                    <strong>
                      {item.product.primaryBarcode ?? item.product.id}
                    </strong>
                  </td>
                  <td className="sales-cart-description-cell">
                    <strong>{item.product.name}</strong>
                  </td>
                  <td>
                    <div className="sales-quantity-control">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateQuantity(item.productId, item.quantity - 1)
                        }
                        aria-label="Disminuir cantidad"
                      >
                        <Minus size={12} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateQuantity(item.productId, item.quantity + 1)
                        }
                        aria-label="Aumentar cantidad"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </td>
                  <td>UND</td>
                  <td>
                    <select
                      value={item.productPriceId}
                      onChange={(event) =>
                        onUpdatePrice(item.productId, event.target.value)
                      }
                      aria-label={`Precio de ${item.product.name}`}
                    >
                      {activePrices(item.product).map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.name} · {formatCurrency(option.price)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="sales-cart-total">
                    {formatCurrency(Number(price?.price ?? 0) * item.quantity)}
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: blankRowCount }, (_, index) => (
              <tr className="sales-cart-empty-row" key={`empty-${index}`}>
                <td colSpan="6" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sales-cart-summary">
        <span>
          Subtotal <strong>{formatCurrency(totals.subtotal)}</strong>
        </span>
        <span>
          IVA <strong>{formatCurrency(totals.taxes)}</strong>
        </span>
        <span className="is-total">
          Total <strong>{formatCurrency(totals.total)}</strong>
        </span>
        {cart.length > 0 && (
          <button
            type="button"
            className="sales-cart-clear-button"
            onClick={onClearCart}
          >
            <Trash2 size={13} /> Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

export function InvoicePanel({
  title,
  description,
  invoices,
  actionLabel,
  onAction,
  onAnnul,
  onValidateInvoice,
  actionLoading,
  onSelect,
}) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const visibleInvoices = filterDocuments(
    invoices,
    search,
    sourceFilter,
    statusFilter,
  );
  return (
    <div className="sales-list-panel">
      <SalesPanelHeading
        title={title}
        description={description}
        actionLabel={actionLabel}
        onAction={onAction}
      />
      <div className="sales-filter-row">
        <SearchRow
          value={search}
          onChange={setSearch}
          placeholder="Buscar por factura o cliente…"
        />
        <label className="sales-source-filter">
          <span>Origen</span>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="">Todos los orígenes</option>
            <option value="POS">POS</option>
            <option value="ADMIN">Administrativo</option>
            <option value="APP_MOVIL">App móvil</option>
          </select>
        </label>
        <label className="sales-source-filter">
          <span>Estado</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos los estados</option>
            <option value="ACTIVA">Activa</option>
            <option value="ANULADA">Anulada</option>
          </select>
        </label>
      </div>
      <div className="sales-table-wrap">
        <table className="provider-data-table sales-data-table">
          <thead>
            <tr>
              <th>Factura</th>
              <th>Cliente</th>
              <th>Origen</th>
              <th>Estado</th>
              <th>Validación</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleInvoices.length ? (
              visibleInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  onDoubleClick={() =>
                    onSelect({ ...invoice, __salesType: "invoice" })
                  }
                >
                  <td>
                    <strong>{invoice.consecutive}</strong>
                  </td>
                  <td>{clientName(invoice.client)}</td>
                  <td>
                    {invoiceSourceLabel(invoice.source)}
                  </td>
                  <td>
                    <StatusPill
                      value={
                        invoiceStatusLabels[invoice.status] ?? invoice.status
                      }
                      tone={invoice.status === "ACTIVA" ? "success" : "muted"}
                    />
                  </td>
                  <td>
                    <StatusPill
                      value={
                        invoiceValidationLabels[invoice.validationStatus] ??
                        invoice.validationStatus ??
                        "Validada"
                      }
                      tone={invoice.validationStatus === "PENDIENTE" ? "warning" : "success"}
                    />
                  </td>
                  <td>{formatDate(invoice.createdAt)}</td>
                  <td>{formatCurrency(invoice.total)}</td>
                  <td>
                    <div className="sales-table-actions">
                      <button
                        type="button"
                        onClick={() =>
                          onSelect({ ...invoice, __salesType: "invoice" })
                        }
                      >
                        Ver
                      </button>
                      {onAnnul && invoice.status !== "ANULADA" && (
                        <button
                          type="button"
                          className="danger-text-button"
                          onClick={() => onAnnul(invoice)}
                        >
                          <RotateCcw size={12} /> Anular y devolver
                        </button>
                      )}
                      {onValidateInvoice && invoice.validationStatus === "PENDIENTE" && (
                        <button
                          type="button"
                          className="primary-action"
                          disabled={Boolean(actionLoading)}
                          onClick={() => onValidateInvoice(invoice)}
                        >
                          {actionLoading === `invoice-validate-${invoice.id}` ? (
                            <LoaderCircle size={12} className="is-spinning" />
                          ) : (
                            <Check size={12} />
                          )}
                          Validar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8">
                  <div className="table-empty">
                    No hay facturas para mostrar.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="table-hint">
        Doble clic sobre una factura para ver su detalle.
      </p>
    </div>
  );
}

function QuoteList({
  quotes,
  actionLoading,
  onUpdateStatus,
  onConvert,
  onSelect,
  onLoad,
  onExport,
  onSendToWarehouse,
}) {
  return (
    <div className="sales-list-panel sales-quote-list">
      <SalesPanelHeading
        title="Cotizaciones registradas"
        description="Aprueba, rechaza o convierte una propuesta en factura."
      />
      <div className="sales-table-wrap">
        <table className="provider-data-table sales-data-table">
          <thead>
            <tr>
              <th>Consecutivo</th>
              <th>Cliente</th>
              <th>Items</th>
              <th>Vigencia</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length ? (
              quotes.map((quote) => (
                <tr
                  key={quote.id}
                  onDoubleClick={() =>
                    onSelect({ ...quote, __salesType: "quote" })
                  }
                >
                  <td>
                    <strong>{quote.consecutive}</strong>
                  </td>
                  <td>{clientName(quote.client)}</td>
                  <td>{quote.items?.length ?? 0}</td>
                  <td>{formatDate(quote.expiresAt)}</td>
                  <td>{formatCurrency(quote.total)}</td>
                  <td>
                    <StatusPill
                      value={quoteStatusLabels[quote.status] ?? quote.status}
                      tone={
                        quote.status === "APROBADA"
                          ? "success"
                          : quote.status === "RECHAZADA"
                            ? "danger"
                            : "info"
                      }
                    />
                  </td>
                  <td>
                    <div className="sales-table-actions">
                      <button
                        type="button"
                        onClick={() =>
                          onSelect({ ...quote, __salesType: "quote" })
                        }
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => onExport?.({ ...quote, __salesType: "quote" })}
                      >
                        <Printer size={12} /> PDF
                      </button>
                      {!["RECHAZADA", "EXPIRADA", "CONVERTIDA"].includes(quote.status) && (
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => onSendToWarehouse?.(quote)}
                        >
                          <Send size={12} /> Enviar a Bodega
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => onLoad(quote)}
                      >
                        <ShoppingCart size={12} /> Cargar
                      </button>
                      {quote.status === "PENDIENTE" && (
                        <>
                          <button
                            type="button"
                            disabled={Boolean(actionLoading)}
                            onClick={() => onUpdateStatus(quote, "APROBADA")}
                          >
                            {actionLoading === "quote-status-" + quote.id ? (
                              <>
                                <LoaderCircle
                                  size={12}
                                  className="is-spinning"
                                />
                                Guardando…
                              </>
                            ) : (
                              "Aprobar"
                            )}
                          </button>
                          <button
                            type="button"
                            className="danger-text-button"
                            disabled={Boolean(actionLoading)}
                            onClick={() => onUpdateStatus(quote, "RECHAZADA")}
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {["PENDIENTE", "APROBADA"].includes(quote.status) && (
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => onConvert(quote)}
                        >
                          {actionLoading === "quote-convert-" + quote.id ? (
                            <>
                              <LoaderCircle size={12} className="is-spinning" />
                              Procesando…
                            </>
                          ) : (
                            "Facturar"
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7">
                  <div className="table-empty">
                    No hay cotizaciones registradas.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeliveryPanel({
  deliveries,
  actionLoading,
  canManage,
  onUpdateStatus,
  onSelect,
  onCreate,
}) {
  const [search, setSearch] = useState("");
  const visible = deliveries.filter((delivery) =>
    `${delivery.id} ${delivery.invoice?.consecutive ?? ""} ${delivery.recipientName} ${delivery.address}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <div className="sales-list-panel">
      <SalesPanelHeading
        title="Notas de entrega"
        description="Da seguimiento a las entregas asociadas a facturas."
        actionLabel="Nueva entrega"
        onAction={onCreate}
      />
      <SearchRow
        value={search}
        onChange={setSearch}
        placeholder="Buscar factura, destinatario o dirección…"
      />
      {!canManage && (
        <div className="sales-info-message">
          <Truck size={14} /> Tu rol puede consultar entregas, pero solo el
          administrador puede cambiar su estado.
        </div>
      )}
      <div className="sales-table-wrap">
        <table className="provider-data-table sales-data-table">
          <thead>
            <tr>
              <th>Factura</th>
              <th>Destinatario</th>
              <th>Dirección</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((delivery) => {
                const nextStatus = nextDeliveryStatus(delivery.status);
                const detail = { ...delivery, __salesType: "delivery" };
                return (
                  <tr key={delivery.id} onDoubleClick={() => onSelect(detail)}>
                    <td>
                      <strong>
                        {delivery.invoice?.consecutive ??
                          `Entrega #${delivery.id}`}
                      </strong>
                    </td>
                    <td>
                      {delivery.recipientName}
                      <small>{delivery.recipientPhone}</small>
                    </td>
                    <td>{delivery.address}</td>
                    <td>
                      <StatusPill
                        value={
                          deliveryStatusLabels[delivery.status] ??
                          delivery.status
                        }
                        tone={
                          delivery.status === "ENTREGADO"
                            ? "success"
                            : delivery.status === "CANCELADO"
                              ? "danger"
                              : "info"
                        }
                      />
                    </td>
                    <td>{formatDate(delivery.createdAt)}</td>
                    <td>
                      {canManage && nextStatus ? (
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => onUpdateStatus(delivery, nextStatus)}
                        >
                          {actionLoading ===
                          "delivery-status-" + delivery.id ? (
                            <>
                              <LoaderCircle size={12} className="is-spinning" />
                              Guardando…
                            </>
                          ) : (
                            deliveryStatusLabels[nextStatus]
                          )}
                        </button>
                      ) : (
                        <button type="button" onClick={() => onSelect(detail)}>
                          Ver
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6">
                  <div className="table-empty">
                    No hay notas de entrega registradas.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersPanel({
  orders,
  deliveries,
  actionLoading,
  canManage,
  onSelect,
  onPrepareDelivery,
  onUpdateStatus,
  onCreateDelivery,
}) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("orders");
  const visible = orders.filter((order) =>
    `${order.consecutive} ${clientName(order.client)} ${order.delivery?.address ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  if (activeTab === "deliveries") {
    return (
      <div className="sales-orders-workspace">
        <div className="sales-billing-tabs" role="tablist" aria-label="Pedidos y domicilios">
          <button
            type="button"
            className=""
            role="tab"
            aria-selected="false"
            onClick={() => setActiveTab("orders")}
          >
            Pedidos <span>{orders.length}</span>
          </button>
          <button
            type="button"
            className="is-active"
            role="tab"
            aria-selected="true"
            onClick={() => setActiveTab("deliveries")}
          >
            Domicilios <span>{deliveries.length}</span>
          </button>
        </div>
        <DeliveryPanel
          deliveries={deliveries}
          actionLoading={actionLoading}
          canManage={canManage}
          onUpdateStatus={onUpdateStatus}
          onSelect={onSelect}
          onCreate={onCreateDelivery}
        />
      </div>
    );
  }

  return (
    <div className="sales-orders-workspace">
      <div className="sales-billing-tabs" role="tablist" aria-label="Pedidos y domicilios">
        <button
          type="button"
          className="is-active"
          role="tab"
          aria-selected="true"
          onClick={() => setActiveTab("orders")}
        >
          Pedidos <span>{orders.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          onClick={() => setActiveTab("deliveries")}
        >
          Domicilios <span>{deliveries.length}</span>
        </button>
      </div>
      <div className="sales-list-panel">
      <SalesPanelHeading
        title="Pedidos recibidos"
        description="Pedidos de la tienda móvil y sus domicilios en una sola vista."
      />
      <SearchRow
        value={search}
        onChange={setSearch}
        placeholder="Buscar por pedido, cliente o dirección…"
      />
      <div className="sales-table-wrap">
        <table className="provider-data-table sales-data-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Entrega</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((order) => {
                const detail = { ...order, __salesType: "order" };
                return (
                  <tr key={order.id} onDoubleClick={() => onSelect(detail)}>
                    <td>
                      <strong>{order.consecutive}</strong>
                      <small>Factura móvil</small>
                    </td>
                    <td>
                      {clientName(order.client)}
                      <small>{order.client?.identification}</small>
                    </td>
                    <td>
                      {order.delivery?.recipientName ?? "Sin destinatario"}
                    </td>
                    <td>
                      <StatusPill
                        value={
                          deliveryStatusLabels[order.delivery?.status] ??
                          "Sin entrega"
                        }
                        tone={
                          order.delivery?.status === "ENTREGADO"
                            ? "success"
                            : "info"
                        }
                      />
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>{formatCurrency(order.total)}</td>
                    <td>
                      <div className="sales-table-actions">
                        <button type="button" onClick={() => onSelect(detail)}>
                          Ver
                        </button>
                        {!order.delivery && (
                          <button
                            type="button"
                            onClick={() => onPrepareDelivery(order)}
                          >
                            <Truck size={12} /> Preparar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7">
                  <div className="table-empty">
                    No hay pedidos recibidos de la tienda móvil.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

function ReportsPanel({ invoices, quotes, orders }) {
  const activeInvoices = invoices.filter(
    (invoice) => invoice.status === "ACTIVA",
  );
  const totalSales = activeInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total ?? 0),
    0,
  );
  const totalQuotes = quotes.reduce(
    (sum, quote) => sum + Number(quote.total ?? 0),
    0,
  );
  const appOrders = orders.length;
  const cards = [
    ["Ventas activas", activeInvoices.length, "Facturas vigentes"],
    ["Valor vendido", formatCurrency(totalSales), "Facturación acumulada"],
    [
      "Cotizaciones",
      formatCurrency(totalQuotes),
      `${quotes.length} propuestas`,
    ],
    ["Pedidos móviles", appOrders, "Pedidos recibidos"],
  ];
  const max = Math.max(
    ...activeInvoices.map((invoice) => Number(invoice.total ?? 0)),
    0,
  );
  return (
    <div className="sales-report-panel">
      <SalesPanelHeading
        title="Reportes de ventas"
        description="Indicadores construidos con los documentos registrados."
      />
      <div className="sales-report-cards">
        {cards.map(([label, value, helper]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{helper}</small>
          </article>
        ))}
      </div>
      <div className="sales-report-chart">
        <div className="sales-section-heading">
          <div>
            <strong>Facturación por documento</strong>
            <span>Comparativo visual de las facturas activas.</span>
          </div>
        </div>
        {activeInvoices.length ? (
          activeInvoices.slice(0, 10).map((invoice) => (
            <div className="sales-report-row" key={invoice.id}>
              <div>
                <strong>{invoice.consecutive}</strong>
                <span>
                  {clientName(invoice.client)} · {formatDate(invoice.createdAt)}
                </span>
              </div>
              <div className="sales-report-track">
                <span
                  style={{
                    width: `${max ? Math.max(6, (Number(invoice.total) / max) * 100) : 0}%`,
                  }}
                />
              </div>
              <b>{formatCurrency(invoice.total)}</b>
            </div>
          ))
        ) : (
          <div className="table-empty">
            No hay facturas activas para graficar.
          </div>
        )}
      </div>
    </div>
  );
}

function SalesLoadingState() {
  return (
    <div className="sales-loading-state">
      <div className="sales-loading-spinner" />
      <strong>Cargando módulo de ventas…</strong>
      <span>Conectando facturación, clientes, productos y documentos.</span>
    </div>
  );
}

function SalesPanelHeading({ title, description, actionLabel, onAction }) {
  return (
    <div className="sales-section-heading sales-panel-heading">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {actionLabel && (
        <button type="button" onClick={onAction}>
          <Plus size={14} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

function DeliveryEditor({
  editor,
  invoices,
  saving,
  onChange,
  onSave,
  onCancel,
}) {
  const availableInvoices = invoices.filter(
    (invoice) =>
      invoice.status === "ACTIVA" &&
      (!invoice.delivery || String(invoice.id) === String(editor.invoiceId)),
  );
  return (
    <div className="sales-dialog-backdrop" role="presentation">
      <div
        className="sales-document-dialog sales-delivery-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-delivery-editor-title"
      >
        <header>
          <strong id="sales-delivery-editor-title">
            Nueva nota de entrega
          </strong>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar nota de entrega"
          >
            <X size={15} />
          </button>
        </header>
        <div className="sales-editor-form">
          <label>
            Factura asociada
            <select
              value={editor.invoiceId}
              onChange={(event) => onChange("invoiceId", event.target.value)}
            >
              <option value="">Selecciona una factura activa</option>
              {availableInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.consecutive} · {clientName(invoice.client)} ·{" "}
                  {formatCurrency(invoice.total)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destinatario
            <input
              value={editor.recipientName}
              onChange={(event) =>
                onChange("recipientName", event.target.value)
              }
              placeholder="Nombre de quien recibe"
            />
          </label>
          <label>
            Teléfono
            <input
              value={editor.recipientPhone}
              onChange={(event) =>
                onChange("recipientPhone", event.target.value)
              }
              placeholder="Teléfono de contacto"
            />
          </label>
          <label>
            Dirección de entrega
            <input
              value={editor.address}
              onChange={(event) => onChange("address", event.target.value)}
              placeholder="Dirección completa"
            />
          </label>
          <label className="sales-editor-wide">
            Observaciones
            <textarea
              value={editor.notes}
              onChange={(event) => onChange("notes", event.target.value)}
              placeholder="Indicaciones para la entrega"
              rows="3"
            />
          </label>
        </div>
        <footer>
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={onSave}
            disabled={saving || !editor.invoiceId || !editor.address.trim()}
          >
            {saving ? "Guardando…" : "Guardar entrega"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SearchRow({ value, onChange, placeholder }) {
  return (
    <div className="sales-list-search">
      <Search size={15} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function StatusPill({ value, tone = "info" }) {
  return <span className={`sales-status-pill is-${tone}`}>{value}</span>;
}

function SalesLookupDialog({
  type,
  clients,
  products,
  warehouses,
  invoices,
  quotes,
  onClose,
  onSelect,
  onLoadQuote,
}) {
  const [search, setSearch] = useState("");
  const records = getLookupRecords(type, {
    clients,
    products,
    warehouses,
    invoices,
    quotes,
  });
  const query = search.trim().toLowerCase();
  const visible = records.filter((record) =>
    getLookupSearchText(record, type).toLowerCase().includes(query),
  );
  const title = getLookupTitle(type);
  return (
    <div className="sales-dialog-backdrop" role="presentation">
      <div
        className={`sales-lookup-dialog sales-lookup-${type}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-lookup-title"
      >
        <header>
          <strong id="sales-lookup-title">{title}</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar búsqueda">
            <X size={15} />
          </button>
        </header>
        <div className="sales-lookup-toolbar">
          <Search size={15} />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por código, nombre o descripción…"
          />
          <span>{visible.length} resultado(s)</span>
        </div>
        <div className="sales-lookup-table-wrap">
          <table className="provider-data-table sales-data-table sales-lookup-table">
            <thead>
              <tr>
                {getLookupHeaders(type).map((header) => (
                  <th key={header}>{header}</th>
                ))}
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((record) => (
                  <tr
                    key={record.id}
                    onDoubleClick={() =>
                      type === "quotes" ? onLoadQuote(record) : onSelect(record)
                    }
                  >
                    {renderLookupCells(record, type)}
                    <td>
                      {type === "quotes" ? (
                        <button
                          type="button"
                          onClick={() => onLoadQuote(record)}
                        >
                          <ShoppingCart size={12} /> Cargar
                        </button>
                      ) : type === "products" ? (
                        <button type="button" onClick={() => onSelect(record)}>
                          <Plus size={12} /> Agregar
                        </button>
                      ) : type === "invoices" ? (
                        <button type="button" onClick={() => onSelect(record)}>
                          <FileText size={12} /> Ver
                        </button>
                      ) : (
                        <button type="button" onClick={() => onSelect(record)}>
                          Seleccionar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={getLookupHeaders(type).length + 1}>
                    <div className="table-empty">
                      No hay registros para mostrar.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer>
          <span>Doble clic para seleccionar rápidamente.</span>
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

function getLookupRecords(type, data) {
  return (
    {
      clients: data.clients,
      products: data.products,
      warehouses: data.warehouses,
      invoices: data.invoices,
      quotes: data.quotes,
    }[type] ?? []
  );
}

function getLookupTitle(type) {
  return (
    {
      clients: "Información de clientes",
      products: "Información de productos",
      warehouses: "Información de depósitos",
      invoices: "Facturas para reimprimir",
      quotes: "Cotizaciones guardadas",
    }[type] ?? "Búsqueda"
  );
}

function getLookupHeaders(type) {
  return (
    {
      clients: ["Código", "Descripción", "Id. Fiscal", "Saldo"],
      products: ["Imagen", "Código", "Descripción", "Existencia", "Precio"],
      warehouses: ["Código", "Descripción", "Estado"],
      invoices: ["Número", "Cliente", "Fecha", "Total", "Estado"],
      quotes: ["Número", "Cliente", "Vigente hasta", "Total", "Estado"],
    }[type] ?? ["Código", "Descripción"]
  );
}

function ProductImageCell({ product }) {
  return (
    <div className="sales-product-image-cell">
      {product?.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={`Imagen de ${product.name}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Package size={18} />
      )}
    </div>
  );
}

function renderLookupCells(record, type) {
  if (type === "clients")
    return (
      <>
        <td>
          <strong>{clientCode(record)}</strong>
        </td>
        <td>{clientName(record)}</td>
        <td>{record.identification}</td>
        <td>{formatCurrency(record.balance ?? 0)}</td>
      </>
    );
  if (type === "products")
    return (
      <>
        <td>
          <ProductImageCell product={record} />
        </td>
        <td>
          <strong>{record.primaryBarcode ?? record.id}</strong>
        </td>
        <td>{record.name}</td>
        <td>{productStock(record)}</td>
        <td>{formatCurrency(getDefaultPrice(record)?.price)}</td>
      </>
    );
  if (type === "warehouses")
    return (
      <>
        <td>
          <strong>{String(record.id).padStart(3, "0")}</strong>
        </td>
        <td>{record.location}</td>
        <td>
          <StatusPill
            value={record.isActive === false ? "Inactivo" : "Activo"}
            tone={record.isActive === false ? "muted" : "success"}
          />
        </td>
      </>
    );
  if (type === "invoices")
    return (
      <>
        <td>
          <strong>{record.consecutive}</strong>
        </td>
        <td>{clientName(record.client)}</td>
        <td>{formatDate(record.createdAt)}</td>
        <td>{formatCurrency(record.total)}</td>
        <td>
          <StatusPill
            value={invoiceStatusLabels[record.status] ?? record.status}
            tone={record.status === "ACTIVA" ? "success" : "muted"}
          />
        </td>
      </>
    );
  return (
    <>
      <td>
        <strong>{record.consecutive}</strong>
      </td>
      <td>{clientName(record.client)}</td>
      <td>{formatDate(record.expiresAt)}</td>
      <td>{formatCurrency(record.total)}</td>
      <td>
        <StatusPill
          value={quoteStatusLabels[record.status] ?? record.status}
          tone={record.status === "APROBADA" ? "success" : "info"}
        />
      </td>
    </>
  );
}

function getLookupSearchText(record, type) {
  if (type === "clients")
    return `${clientCode(record)} ${record.identification} ${clientName(record)}`;
  if (type === "products")
    return `${record.id} ${record.primaryBarcode ?? ""} ${record.name} ${record.brand ?? ""}`;
  if (type === "warehouses") return `${record.id} ${record.location}`;
  return `${record.consecutive ?? ""} ${clientName(record.client)} ${record.status ?? ""}`;
}

function WarehouseDispatchDialog({ quote, users, warehouses, busy, onSend, onClose }) {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const query = search.trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    const warehouse = warehouses.find(
      (item) => Number(item.id) === Number(user.warehouseId),
    );
    const label = `${user.username} ${user.employee?.firstName ?? ""} ${user.employee?.lastName ?? ""} ${warehouse?.location ?? ""}`;
    return label.toLowerCase().includes(query);
  });
  return (
    <div className="sales-dialog-backdrop" role="presentation">
      <div className="sales-document-dialog warehouse-dispatch-dialog" role="dialog" aria-modal="true" aria-label="Enviar cotización a bodega">
        <header>
          <strong>Enviar cotización a Bodega</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar envío">
            <X size={15} />
          </button>
        </header>
        <div className="warehouse-dispatch-summary">
          <FileText size={18} />
          <div>
            <strong>{quote.consecutive}</strong>
            <span>{clientName(quote.client)} · {quote.items?.length ?? 0} productos · {formatCurrency(quote.total)}</span>
          </div>
        </div>
        <label className="warehouse-dispatch-search">
          <Search size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar bodeguero o bodega…" />
        </label>
        <div className="warehouse-dispatch-users">
          {visibleUsers.length ? visibleUsers.map((user) => {
            const warehouse = warehouses.find(
              (item) => Number(item.id) === Number(user.warehouseId),
            );
            const employeeName = [user.employee?.firstName, user.employee?.lastName].filter(Boolean).join(" ");
            const selected = String(selectedUserId) === String(user.id);
            return (
              <button type="button" className={`warehouse-dispatch-user ${selected ? "is-selected" : ""}`} key={user.id} onClick={() => setSelectedUserId(String(user.id))}>
                <span className="warehouse-dispatch-radio" aria-hidden="true" />
                <span><strong>{employeeName || user.username}</strong><small>{user.username}</small></span>
                <b><Warehouse size={13} /> {warehouse?.location ?? `Bodega #${user.warehouseId}`}</b>
              </button>
            );
          }) : <div className="table-empty">No hay bodegueros activos con bodega asignada.</div>}
        </div>
        <footer>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary-action" disabled={!selectedUserId || busy} onClick={() => onSend(selectedUserId)}>
            <Send size={13} /> {busy ? "Enviando…" : "Enviar cotización"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SalesDocumentDialog({
  document,
  type,
  onPrint,
  onAnnul,
  actionLoading,
  onClose,
}) {
  const isInvoice = type === "invoice";
  const isQuote = type === "quote";
  const isDelivery = type === "delivery";
  const relatedInvoice = isDelivery ? document.invoice : null;
  const title =
    document.consecutive ??
    (isInvoice
      ? "Factura"
      : isQuote
        ? "Cotización"
        : `Nota de entrega · ${relatedInvoice?.consecutive ?? `#${document.id}`}`);
  const items = document.items ?? [];
  return (
    <div className="sales-dialog-backdrop" role="presentation">
      <div className="sales-document-dialog" role="dialog" aria-modal="true">
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle">
            <X size={15} />
          </button>
        </header>
        <div className="sales-document-summary">
          <div>
            <span>Cliente</span>
            <strong>{clientName(document.client)}</strong>
          </div>
          <div>
            <span>Fecha</span>
            <strong>{formatDate(document.createdAt)}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>
              {formatCurrency(document.total ?? relatedInvoice?.total)}
            </strong>
          </div>
        </div>
        {document.delivery && (
          <div className="sales-detail-callout">
            <Truck size={14} />
            <span>
              {document.delivery.recipientName} · {document.delivery.address}
            </span>
          </div>
        )}
        <div className="sales-detail-items">
          {items.length ? (
            items.map((item) => (
              <div key={item.id ?? `${item.productId}-${item.quantity}`}>
                <span>
                  {item.product?.name ?? `Producto #${item.productId}`}
                </span>
                <span>
                  {item.quantity} × {formatCurrency(item.unitPrice)}
                </span>
                <strong>{formatCurrency(item.total)}</strong>
              </div>
            ))
          ) : (
            <div className="table-empty">
              Este documento no tiene líneas para mostrar.
            </div>
          )}
        </div>
        <footer>
          {onPrint && (
            <button type="button" className="primary-action" onClick={onPrint}>
              <Printer size={13} /> {isQuote ? "Exportar PDF" : "Imprimir"}
            </button>
          )}
          {onAnnul && document.status === "ACTIVA" && (
            <button
              type="button"
              className="danger-text-button"
              disabled={Boolean(actionLoading)}
              onClick={() => onAnnul(document)}
            >
              {actionLoading === `invoice-annul-${document.id}` ? (
                <LoaderCircle size={13} className="is-spinning" />
              ) : (
                <RotateCcw size={13} />
              )}
              {actionLoading === `invoice-annul-${document.id}`
                ? "Procesando…"
                : "Anular y devolver"}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

function activePrices(product) {
  return (product?.prices ?? []).filter(isActive);
}
function getDefaultPrice(product) {
  return (
    activePrices(product).find((price) => price.isDefault) ??
    activePrices(product)[0] ??
    null
  );
}
function getPriceForClient(product, client) {
  const prices = activePrices(product);
  if (client?.clientType) {
    const keyword = client.clientType === "MAYORISTA"
      ? /mayor|mayoreo|wholesale/i
      : /minorista|detal|retail/i;
    const clientPrice = prices.find((price) => keyword.test(price.name ?? ""));
    if (clientPrice) return clientPrice;
  }
  return getDefaultPrice(product);
}
function getPriceById(product, id) {
  return activePrices(product).find((price) => Number(price.id) === Number(id));
}
function productStock(product) {
  return (product?.warehouses ?? []).reduce(
    (sum, item) => sum + Number(item.quantity ?? 0),
    0,
  );
}
function calculateCartTotals(cart) {
  return cart.reduce(
    (totals, item) => {
      const price =
        getPriceById(item.product, item.productPriceId) ??
        getDefaultPrice(item.product);
      const subtotal = Number(price?.price ?? 0) * item.quantity;
      const taxes = subtotal * (Number(item.product.taxRate ?? 0) / 100);
      totals.subtotal += subtotal;
      totals.taxes += taxes;
      totals.total += subtotal + taxes;
      return totals;
    },
    { subtotal: 0, taxes: 0, total: 0 },
  );
}
function filterDocuments(documents, search, sourceFilter = "", statusFilter = "") {
  const query = search.trim().toLowerCase();
  return documents.filter((document) =>
    (!sourceFilter || document.source === sourceFilter) &&
    (!statusFilter || document.status === statusFilter) &&
    (!query ||
      `${document.consecutive ?? ""} ${clientName(document.client)}`
        .toLowerCase()
        .includes(query)),
  );
}
function invoiceSourceLabel(source) {
  return { POS: "POS", ADMIN: "Administrativo", APP_MOVIL: "App móvil" }[source] ?? source ?? "Sin origen";
}
function clientName(client) {
  if (!client) return "Consumidor final";
  return (
    (client.name ??
      [client.firstName, client.lastName].filter(Boolean).join(" ")) ||
    `Cliente #${client.id}`
  );
}
function clientCode(client) {
  return client?.id ? `C${String(client.id).padStart(5, "0")}` : "C99999";
}
function isConsumerFinal(client) {
  return ["CONSUMIDOR-FINAL", "CONSUMIDOR_FINAL"].includes(
    client.identification,
  );
}
function isActive(item) {
  return item?.isActive !== false && item?.deletedAt == null;
}
function nextDeliveryStatus(status) {
  const index = deliveryStatusSequence.indexOf(status);
  return index >= 0 && index < deliveryStatusSequence.length - 1
    ? deliveryStatusSequence[index + 1]
    : null;
}
function defaultDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + 15);
  return due.toISOString().slice(0, 10);
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
