import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Check,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CircleX,
  CircleDollarSign,
  Clock,
  CreditCard,
  Download,
  Filter,
  FileSpreadsheet,
  FolderOpen,
  Eye,
  FileText,
  Lightbulb,
  LoaderCircle,
  Package,
  Percent,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Truck,
  TrendingUp,
  Users,
  Warehouse,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";
import {
  activeSalePrices,
  calculateLineTotals,
  defaultSalePrice,
  getPriceLevel as getCommercialPriceLevel,
  grossFromNet,
  netFromGross,
  roundMoney,
  salePriceById,
  salePriceForLevel,
} from "@/lib/commercial-pricing";
import { handleEnterAdvance } from "@/lib/enter-advance";
import { printInvoiceTicket } from "@/lib/invoice-ticket";
import { DraftsDialog, saveDraft } from "@/components/drafts/drafts-dialog";
import { focusSalesScanner } from "./sales-scanner-input";
import { TotalizeDialog } from "@/components/payments/totalize-dialog";
import { ReturnsPanel } from "./returns-panel";
import "./sales-reports.css";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCop, readCopInput } from "@/lib/cop";
import { CopInput } from "@/components/money/cop-input";

// Acciones compartidas con los componentes de la grilla (documentos en espera, bodega por línea, ticket).
const SalesExtrasContext = createContext({});

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
const PRICE_LEVELS = [0, 1, 2, 3];

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
  const [selectedPriceLevel, setSelectedPriceLevel] = useState("0");
  const [creditDueDate, setCreditDueDate] = useState(defaultDueDate());
  const [clientAdvances, setClientAdvances] = useState([]);
  const [bonusAvailable, setBonusAvailable] = useState(0);
  const [clientDebt, setClientDebt] = useState(0);
  const [totalizeOpen, setTotalizeOpen] = useState(false);
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [quoteKind, setQuoteKind] = useState("COTIZACION");
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [totalizeError, setTotalizeError] = useState("");
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
          const initialClient = nextClients.find(isConsumerFinal) ?? nextClients[0];
          setSelectedClientId(String(initialClient?.id ?? ""));
          setSelectedPriceLevel(String(initialClient?.priceLevel ?? 0));
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
  }, [initialDocumentId, onRequestLogin, session?.sub]);

  useEffect(() => {
    const refreshInvoices = async () => {
      invalidateSalesDataCache();
      const result = await apiClient.getAllPages("/facturas");
      setInvoices(result);
    };
    window.addEventListener("sales:invoice-created", refreshInvoices);
    return () => window.removeEventListener("sales:invoice-created", refreshInvoices);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handleCatalogChanged = async () => {
      invalidateSalesDataCache();
      try {
        const { productsResult } = await loadCriticalSalesData();
        if (cancelled || productsResult.status !== "fulfilled") return;
        const nextProducts = productsResult.value.filter(isActive);
        const productsById = new Map(
          nextProducts.map((product) => [String(product.id), product]),
        );
        setProducts(nextProducts);
        setCart((current) =>
          current
            .map((item) => {
              const product = productsById.get(String(item.productId));
              return product ? { ...item, product } : null;
            })
            .filter(Boolean),
        );
      } catch (requestError) {
        if (!cancelled && isAuthError(requestError)) onRequestLogin?.();
      }
    };
    window.addEventListener("catalog:changed", handleCatalogChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("catalog:changed", handleCatalogChanged);
    };
  }, [onRequestLogin]);

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
  const canOverridePrice = canEditSalePrice(session);
  const canManageDeliveries = session?.role === "ADMIN";

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

  function applyPriceSelection(nextClient, nextPriceLevel = selectedPriceLevel) {
    setCart((current) => {
      let changed = false;
      const next = current.map((item) => {
        const price = getPriceForClient(item.product, nextClient, nextPriceLevel);
        if (!price || Number(price.id) === Number(item.productPriceId)) return item;
        changed = true;
        return {
          ...item,
          productPriceId: price.id,
          unitPriceGrossOverride: null,
        };
      });
      return changed ? next : current;
    });
  }

  function handleClientSelection(nextClientId) {
    const nextClient = clients.find(
      (client) => String(client.id) === String(nextClientId),
    );
    const nextPriceLevel = String(nextClient?.priceLevel ?? 0);
    setSelectedClientId(String(nextClientId));
    setSelectedPriceLevel(nextPriceLevel);
    applyPriceSelection(nextClient, nextPriceLevel);
  }

  function handlePriceLevelChange(nextPriceLevel) {
    setSelectedPriceLevel(String(nextPriceLevel));
    applyPriceSelection(selectedClient, String(nextPriceLevel));
  }

  function handleLookupSelection(item) {
    if (lookupType === "clients") {
      handleClientSelection(item.id);
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
          warehouseId: item.warehouseId ?? null,
          unitPriceGrossOverride: null,
        };
      })
      .filter(Boolean);
    if (!loadedItems.length) {
      setError("No se pudieron cargar los productos de esta cotización.");
      return;
    }
    setCart(loadedItems);
    setActiveQuoteId(quote.id);
    if (quote.clientId ?? quote.client?.id)
      setSelectedClientId(String(quote.clientId ?? quote.client.id));
    setView("billing");
    setLookupType(null);
    setLastDocument(null);
    setError("");
      setNotice(
        `${quote.kind === "PREVENTA" ? "Preventa" : "Cotización"} ${quote.consecutive} cargada en facturación: revisa y corrige antes de emitir.`,
      );
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
      !["F1", "F2", "F4", "F5", "F6", "F7", "F8", "F9"].includes(event.key)
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
    if (event.key === "F8") void holdSale();
    if (event.key === "F9") setDraftsOpen(true);
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
    const price = getPriceForClient(product, selectedClient, selectedPriceLevel);
    if (!price) {
      setError(
        `El producto ${product.name} no tiene configurado el Precio ${selectedPriceLevel}.`,
      );
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
          unitPriceGrossOverride: null,
        },
      ];
    });
    setError("");
  }

  async function printTicketFor(document) {
    try {
      // Se consulta la factura completa: trae medios de pago, vendedor y cajero.
      const full = document.id ? await apiClient.get(`/facturas/${document.id}`) : document;
      printInvoiceTicket(full);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function fulfillQuoteLine(quote, item, status) {
    try {
      const saved = await apiClient.patch(`/cotizaciones/${quote.id}/lineas/${item.id}/surtido`, { status });
      const apply = (current) => ({
        ...current,
        items: (current.items ?? []).map((line) => (line.id === item.id ? { ...line, ...saved } : line)),
      });
      setSelectedDocument((current) => (current ? apply(current) : current));
      setQuotes((current) => current.map((row) => (row.id === quote.id ? apply(row) : row)));
      setNotice(status === "SURTIDO" ? "Línea marcada como surtida." : "Línea marcada como atendida.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function clearCart() {
    setCart(emptyCart);
    setActiveQuoteId(null);
    setDraftId(null);
  }

  // Bodega por línea (#45/#46): null = la del encabezado.
  function updateCartWarehouse(productId, warehouseId) {
    setCart((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, warehouseId: warehouseId ? Number(warehouseId) : null }
          : item,
      ),
    );
  }

  // Documentos en espera (#73): guarda solo la captura, no mueve stock, caja ni cartera.
  async function holdSale() {
    if (!cart.length) {
      setError("Agrega productos antes de dejar la factura en espera.");
      return;
    }
    const client = clients.find((item) => String(item.id) === String(selectedClientId));
    const title = `${client ? clientName(client) : "Venta"} · ${new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
    try {
      const saved = await saveDraft({
        id: draftId ?? undefined,
        kind: "VENTA",
        title,
        payload: {
          clientId: selectedClientId,
          warehouseId: selectedWarehouseId,
          sellerId: selectedSellerId,
          priceLevel: selectedPriceLevel,
          quoteId: activeQuoteId,
          items: cart.map((item) => ({
            productId: item.productId,
            productPriceId: item.productPriceId,
            quantity: item.quantity,
            warehouseId: item.warehouseId ?? null,
            unitPriceGrossOverride: item.unitPriceGrossOverride ?? null,
          })),
        },
      });
      setNotice(`Factura «${saved.title}» guardada en espera. No afecta inventario ni caja.`);
      setCart(emptyCart);
      setActiveQuoteId(null);
      setDraftId(null);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function resumeSale(draft) {
    const payload = draft.payload ?? {};
    const restored = (payload.items ?? [])
      .map((line) => {
        const product = activeProducts.find((candidate) => candidate.id === line.productId);
        return product ? { ...line, product } : null;
      })
      .filter(Boolean);
    if (!restored.length) {
      setError("Los productos de este borrador ya no están disponibles.");
      return;
    }
    if (payload.clientId) setSelectedClientId(String(payload.clientId));
    if (payload.warehouseId) setSelectedWarehouseId(String(payload.warehouseId));
    if (payload.sellerId) setSelectedSellerId(String(payload.sellerId));
    if (payload.priceLevel !== undefined) setSelectedPriceLevel(String(payload.priceLevel));
    setActiveQuoteId(payload.quoteId ?? null);
    setCart(restored);
    setDraftId(draft.id);
    setDraftsOpen(false);
    setView("billing");
    setNotice(`Documento «${draft.title}» retomado. Los precios se revalidan al emitir la factura.`);
  }

  function updateCartQuantity(productId, nextQuantity) {
    const safeQuantity = parseQuantityInput(nextQuantity);
    if (safeQuantity === null) return;
    setCart((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: safeQuantity }
          : item,
      ),
    );
  }

  function updateCartPrice(productId, nextGrossPrice) {
    setCart((current) => current.map((item) =>
      item.productId === productId
        ? { ...item, unitPriceGrossOverride: nextGrossPrice }
        : item,
    ));
  }

  // Datos del cliente para totalizar: saldos a favor, bonus y deuda actual.
  useEffect(() => {
    let cancelled = false;
    setClientAdvances([]);
    setBonusAvailable(0);
    setClientDebt(0);
    if (!selectedClientId) return undefined;
    apiClient
      .get("/anticipos", { clientId: selectedClientId, status: "DISPONIBLE" })
      .then((rows) => {
        if (!cancelled) setClientAdvances(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        // Sin permiso de cartera: simplemente no se ofrecen saldos a favor.
      });
    apiClient
      .get(`/facturas/bonus/${selectedClientId}`)
      .then((result) => {
        if (!cancelled) setBonusAvailable(Number(result?.available ?? 0));
      })
      .catch(() => {});
    apiClient
      .get(`/clientes/${selectedClientId}/creditos`)
      .then((rows) => {
        if (cancelled) return;
        const debt = (Array.isArray(rows) ? rows : []).reduce(
          (sum, credit) => sum + Math.max(0, Number(credit.balance ?? 0)),
          0,
        );
        setClientDebt(roundMoney(debt));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedClientId]);

  // Tras cerrar una consulta, el foco vuelve a la fila de captura de código.
  useEffect(() => {
    if (view === "billing" && !lookupType && !loading && !totalizeOpen) {
      const timer = setTimeout(focusSalesScanner, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [view, lookupType, loading, totalizeOpen]);

  async function addBarcodeToCart(code) {
    const normalized = code.trim();
    if (!normalized) return;
    // El código puede ser un código de barras o el código interno del producto
    // (el que se muestra en la tabla cuando no tiene código de barras).
    const needle = normalized.toLowerCase();
    const localProduct =
      activeProducts.find((product) =>
        (product.barcodes ?? []).some(
          (barcode) => barcode.code?.toLowerCase() === needle,
        ),
      ) ??
      activeProducts.find(
        (product) =>
          String(product.primaryBarcode ?? "").toLowerCase() === needle ||
          String(product.code ?? "").toLowerCase() === needle ||
          String(product.id) === normalized,
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
      if (isAuthError(requestError)) {
        setError(requestError.message);
        onRequestLogin?.();
      } else {
        setError(`El código ${normalized} no existe en el catálogo.`);
      }
    }
  }

  // "Emitir factura" abre Total operación (efectivo, instrumentos, bonus, crédito).
  function openTotalize() {
    if (!cart.length) {
      setError("Agrega al menos un producto para facturar.");
      return;
    }
    if (cartTotals.total <= 0) {
      setError("El total de la factura debe ser mayor a cero.");
      return;
    }
    setError("");
    setTotalizeError("");
    setTotalizeOpen(true);
  }

  async function saveInvoice(result) {
    setSaving(true);
    setTotalizeError("");
    setNotice("");
    try {
      const payments = [
        ...(result.cashAmount > 0
          ? [
              {
                bankAccountId: result.cashAccountId,
                amount: result.cashAmount,
                reference: "Efectivo",
              },
            ]
          : []),
        ...result.instruments.map((row) => ({
          bankAccountId: row.bankAccountId,
          amount: row.amount,
          ...(row.reference ? { reference: row.reference } : {}),
        })),
        ...(result.bonusAmount > 0 ? [{ bonus: true, amount: result.bonusAmount }] : []),
        ...result.advanceLines.map((line) => ({
          advanceId: line.advanceId,
          amount: line.amount,
        })),
      ];
      const onCredit = result.creditAmount > 0;
      const invoice = await apiClient.post("/facturas", {
        clientId: selectedClientId ? Number(selectedClientId) : undefined,
        warehouseId: selectedWarehouseId
          ? Number(selectedWarehouseId)
          : undefined,
        source: "POS",
        // El crédito lo decide Total operación: lo no pagado queda a crédito.
        saleMode: onCredit ? "CREDITO" : "CONTADO",
        ...(onCredit
          ? { creditDueDate: new Date(`${result.creditDueDate}T00:00:00`).toISOString() }
          : {}),
        // Los pagos viajan con la factura: se guardan en una sola transacción.
        ...(payments.length ? { payments } : {}),
        ...(result.comments ? { paymentNotes: result.comments } : {}),
        ...(result.support
          ? {
              paymentSupportName: result.support.supportName,
              paymentSupportMimeType: result.support.supportMimeType,
              paymentSupportData: result.support.supportData,
            }
          : {}),
        priceLevel: Number(selectedPriceLevel),
        items: cart.map((item) => ({
          productId: item.productId,
          productPriceId: item.productPriceId,
          warehouseId: item.warehouseId
            ? Number(item.warehouseId)
            : selectedWarehouseId
              ? Number(selectedWarehouseId)
              : undefined,
          quantity: item.quantity,
          ...(hasAppliedUnitPrice(item.unitPriceGrossOverride)
            ? { unitPriceGross: Number(item.unitPriceGrossOverride) }
            : {}),
        })),
        sellerUserId: selectedSellerId ? Number(selectedSellerId) : undefined,
        ...(activeQuoteId ? { quoteId: activeQuoteId } : {}),
      });

      setTotalizeOpen(false);
      setActiveQuoteId(null);
      if (draftId) apiClient.delete(`/borradores/${draftId}`).catch(() => {});
      setDraftId(null);
      setInvoices((current) => [invoice, ...current]);
      invalidateSalesDataCache();
      setLastDocument(invoice);
      setNotice(
        onCredit
          ? `Factura ${invoice.consecutive} creada; ${formatCop(result.creditAmount)} quedaron a crédito.`
          : `Factura ${invoice.consecutive} creada correctamente.`,
      );
      setCart(emptyCart);
    } catch (requestError) {
      setTotalizeError(requestError.message);
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
        priceLevel: Number(selectedPriceLevel),
        kind: quoteKind,
        items: cart.map((item) => ({
          productId: item.productId,
          productPriceId: item.productPriceId,
          quantity: item.quantity,
          ...(quoteKind === "PREVENTA"
            ? {
                warehouseId: Number(item.warehouseId ?? selectedWarehouseId) || undefined,
              }
            : {}),
        })),
      });
      setQuotes((current) => [quote, ...current]);
      invalidateSalesDataCache();
      setLastDocument(quote);
      setNotice(
        quote.kind === "PREVENTA"
          ? `Preventa ${quote.consecutive} creada: cada bodega recibió el aviso de sus líneas.`
          : `Cotización ${quote.consecutive} creada correctamente.`,
      );
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

  const extras = {
    onHold: holdSale,
    onDrafts: () => setDraftsOpen(true),
    warehouses,
    defaultWarehouseId: selectedWarehouseId,
    onUpdateWarehouse: updateCartWarehouse,
    onTicket: printTicketFor,
  };

  return (
    <SalesExtrasContext.Provider value={extras}>
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
            selectedPriceLevel={selectedPriceLevel}
            clientDebt={clientDebt}
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
            canOverridePrice={canOverridePrice}
            onScanBarcode={addBarcodeToCart}
            canViewReturns={canAccessReturns(session, "RETURNS_VIEW")}
            canCreateReturns={canAccessReturns(session, "RETURNS_CREATE")}
            onReturnCreated={() => {
              invalidateSalesDataCache();
              setNotice("Devolución registrada. Inventario y cartera actualizados.");
            }}
            onSellerChange={setSelectedSellerId}
            onUpdateQuantity={updateCartQuantity}
            onUpdatePrice={updateCartPrice}
            onPriceLevelChange={handlePriceLevelChange}
            onClearCart={clearCart}
            onSubmit={openTotalize}
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
            selectedPriceLevel={selectedPriceLevel}
            quoteKind={quoteKind}
            onQuoteKindChange={setQuoteKind}
            cart={cart}
            totals={cartTotals}
            saving={saving}
            actionLoading={actionLoading}
            quotes={quotes}
          onClientChange={handleClientSelection}
            onDueDateChange={setCreditDueDate}
            onAddProduct={addProduct}
            onBarcode={addBarcodeToCart}
            onUpdateQuantity={updateCartQuantity}
            onPriceLevelChange={handlePriceLevelChange}
            onClearCart={clearCart}
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
          <ReportsPanel
            invoices={invoices}
            quotes={quotes}
            orders={orders}
            clients={clients}
            warehouses={warehouses}
            salesUsers={salesUsers}
            onSelect={setSelectedDocument}
          />
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
      {totalizeOpen && (
        <TotalizeDialog
          mode="sale"
          title="TOTAL OPERACIÓN"
          totalLabel="Total operación"
          total={cartTotals.total}
          bankAccounts={bankAccounts}
          client={selectedClient}
          previousBalance={clientDebt}
          bonusAvailable={bonusAvailable}
          advances={clientAdvances}
          saving={saving}
          error={totalizeError}
          onAccept={saveInvoice}
          onCancel={() => setTotalizeOpen(false)}
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
          cart={cart}
          onClose={() => setLookupType(null)}
          onSelect={handleLookupSelection}
          onLoadQuote={loadQuoteIntoBilling}
        />
      )}
      {selectedDocument && (
        <SalesDocumentDialog
          document={selectedDocument}
          type={selectedDocument.__salesType}
          onPrint={() => printSalesDocument(selectedDocument, selectedDocument.__salesType)}
          onTicket={printTicketFor}
          warehouses={warehouses}
          onFulfill={
            ["ADMIN", "BODEGA"].includes(session?.role) ? fulfillQuoteLine : undefined
          }
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
      {draftsOpen && (
        <DraftsDialog kind="VENTA" onLoad={resumeSale} onClose={() => setDraftsOpen(false)} />
      )}
    </section>
    </SalesExtrasContext.Provider>
  );
}

function BillingPanel({
  bankAccounts,
  selectedClient,
  selectedWarehouse,
  selectedSeller,
  selectedSellerId,
  salesUsers,
  selectedPriceLevel,
  clientDebt,
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
  canOverridePrice,
  onScanBarcode,
  canViewReturns,
  canCreateReturns,
  onReturnCreated,
  onPriceLevelChange,
  onSellerChange,
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
        {canViewReturns && (
          <button
            type="button"
            className={billingTab === "returns" ? "is-active" : ""}
            role="tab"
            aria-selected={billingTab === "returns"}
            onClick={() => setBillingTab("returns")}
          >
            Devoluciones
          </button>
        )}
      </div>
      {billingTab === "returns" && canViewReturns ? (
        <ReturnsPanel
          invoices={invoices}
          bankAccounts={bankAccounts}
          canCreate={canCreateReturns}
          onCreated={onReturnCreated}
        />
      ) : billingTab === "new" ? (
        <TicketPanel
          selectedClient={selectedClient}
          clientDebt={clientDebt}
          selectedWarehouse={selectedWarehouse}
          selectedSeller={selectedSeller}
          selectedSellerId={selectedSellerId}
          salesUsers={salesUsers}
          selectedPriceLevel={selectedPriceLevel}
          cart={cart}
          totals={totals}
          saving={saving}
          onDismissNotice={onDismissNotice}
          notice={notice}
          lastDocument={lastDocument}
          documentNumber={documentNumber}
          onScanBarcode={onScanBarcode}
          onPriceLevelChange={onPriceLevelChange}
          onSellerChange={onSellerChange}
          onUpdateQuantity={onUpdateQuantity}
          onUpdatePrice={onUpdatePrice}
          canOverridePrice={canOverridePrice}
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
  selectedPriceLevel,
  quoteKind,
  onQuoteKindChange,
  cart,
  totals,
  saving,
  actionLoading,
  quotes,
  onClientChange,
  onDueDateChange,
  onUpdateQuantity,
  onPriceLevelChange,
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
          title={quoteKind === "PREVENTA" ? "Emisión de preventa" : "Emisión de cotización"}
          description={
            quoteKind === "PREVENTA"
              ? "El vendedor arma la preventa; la caja la carga, corrige y factura. Cada bodega recibe solo sus líneas."
              : "Guarda la cotización para cargarla después en facturación."
          }
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
            <span>Tipo</span>
            <select value={quoteKind} onChange={(event) => onQuoteKindChange(event.target.value)}>
              <option value="COTIZACION">Cotización</option>
              <option value="PREVENTA">Preventa (vendedor → caja)</option>
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
          <label>
            <span>Precio general</span>
            <select
              value={selectedPriceLevel}
              onChange={(event) => onPriceLevelChange(event.target.value)}
            >
              {PRICE_LEVELS.map((level) => (
                <option value={level} key={level}>
                  Precio {level}
                </option>
              ))}
            </select>
          </label>
        </div>
        <SalesShortcutBar
          onSales={onGoToBilling}
          onProducts={onOpenProductLookup}
          onReprint={onReprint}
          onLoad={onOpenLoadLookup}
        />
        <CartTable
          showWarehouse
          cart={cart}
          totals={totals}
          onUpdateQuantity={onUpdateQuantity}
          onClearCart={onClearCart}
          onOpenProductLookup={onOpenProductLookup}
        />
        <div className="sales-submit-row">
          <strong>Total propuesto: {formatCop(totals.total)}</strong>
          <button
            type="button"
            className="primary-action"
            onClick={onSubmit}
            disabled={saving}
          >
            <Check size={14} /> {saving ? "Guardando…" : quoteKind === "PREVENTA" ? "Guardar preventa" : "Guardar cotización"}
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

function SalesPriceLevelField({ value, cart = [], onChange }) {
  const missingProducts = cart.filter(
    (item) => !getExactPriceForLevel(item.product, value),
  ).length;
  return (
    <div className="sales-context-price" aria-label="Precio general de la venta">
      <span>Precio general</span>
      <select
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        aria-label="Precio general"
      >
        {PRICE_LEVELS.map((level) => (
          <option value={level} key={level}>
            Precio {level}
          </option>
        ))}
      </select>
      <small className={missingProducts ? "has-missing" : ""}>
        {missingProducts
          ? `${missingProducts} producto${missingProducts === 1 ? "" : "s"} sin este precio`
          : "Aplica a toda la factura"}
      </small>
    </div>
  );
}

function SalesShortcutBar({ onSales, onProducts, onReprint, onLoad }) {
  const { onHold, onDrafts } = useContext(SalesExtrasContext);
  const shortcuts = [
    ["F4", "Facturación", onSales, ReceiptText],
    ["F5", "Productos", onProducts, Package],
    ["F6", "Reimprime", onReprint, FileText],
    ["F7", "Cargar", onLoad, ShoppingCart],
    ["F8", "En espera", onHold, Clock],
    ["F9", "Borradores", onDrafts, FolderOpen],
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
  selectedClient,
  clientDebt = 0,
  selectedWarehouse,
  selectedSeller,
  selectedSellerId,
  salesUsers,
  selectedPriceLevel,
  cart,
  totals,
  documentNumber,
  saving,
  notice,
  onDismissNotice,
  lastDocument,
  onScanBarcode,
  onPriceLevelChange,
  onSellerChange,
  onUpdateQuantity,
  onUpdatePrice,
  canOverridePrice,
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
  const { onTicket } = useContext(SalesExtrasContext);
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
            <SalesPriceLevelField
              value={selectedPriceLevel}
              cart={cart}
              onChange={onPriceLevelChange}
            />
          </div>
          <SalesShortcutBar
            onSales={onGoToBilling}
            onProducts={onOpenProductLookup}
            onReprint={onReprint}
            onLoad={onLoadQuote}
          />
          <SalesPaymentBox
            client={selectedClient}
            total={totals.total}
            clientDebt={clientDebt}
          />
        </div>
        <BillingTotalsPanel
          documentNumber={documentNumber}
          cart={cart}
          totals={totals}
        />
      </div>
      <CartTable
        showWarehouse
        onScan={onScanBarcode}
        cart={cart}
        totals={totals}
        onUpdateQuantity={onUpdateQuantity}
        onUpdatePrice={onUpdatePrice}
        canOverridePrice={canOverridePrice}
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
          <small>{formatCop(lastDocument.total)}</small>
          {lastDocument.items && (
            <button type="button" onClick={() => onTicket?.(lastDocument)}>
              <Printer size={12} /> Ticket
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function SalesPaymentBox({ client, total, clientDebt }) {
  // El crédito lo decide la ficha del cliente; el pago se captura en Total operación.
  const hasCredit = hasCreditCapacity(client);
  return (
    <div className="sales-payment-box">
      <div className="sales-payment-heading">
        <span>Total a pagar</span>
        <strong>{formatCop(total)}</strong>
      </div>
      <small className="sales-credit-hint">
        {hasCredit
          ? `Cliente con crédito · límite ${formatCop(client.maxCredit)} · deuda actual ${formatCop(clientDebt)}`
          : "Cliente sin crédito: la venta es de contado."}
      </small>
      <small className="sales-credit-hint">
        «Emitir factura» abre Total operación: efectivo, cuentas, bonus
        {hasCredit ? " y crédito" : ""}.
      </small>
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
        <b>{formatCop(totals.subtotal)}</b>
      </div>
      <div>
        <span>Impuestos</span>
        <b>{formatCop(totals.taxes)}</b>
      </div>
      <div>
        <span>Total</span>
        <b>{formatCop(totals.total)}</b>
      </div>
      <div>
        <span>Vuelto</span>
        <b>{formatCop(0)}</b>
      </div>
      <footer>
        <span>Total cantidad o piezas</span>
        <b>{quantity}</b>
      </footer>
    </aside>
  );
}

function CartTable({
  onScan,
  cart,
  totals,
  onUpdateQuantity,
  onUpdatePrice,
  canOverridePrice,
  onClearCart,
  onOpenProductLookup,
  showWarehouse = false,
}) {
  const { warehouses = [], defaultWarehouseId, onUpdateWarehouse } =
    useContext(SalesExtrasContext);
  const columns = showWarehouse ? 7 : 6;
  // #50: más renglones visibles en la grilla.
  const blankRowCount = Math.max(14, 22 - cart.length);

  function handleTableClick(event) {
    // Las líneas existentes son editables, pero las filas vacías siguen
    // permitiendo agregar otro producto sin abrir el buscador por accidente.
    if (!onOpenProductLookup) return;
    if (event.target.closest("button, select, input, a")) return;
    const clickedEmptyRow = event.target.closest(".sales-cart-empty-row");
    if (cart.length > 0 && !clickedEmptyRow) return;
    onOpenProductLookup();
  }

  function handleTableKeyDown(event) {
    if (cart.length > 0) {
      // Enter confirma el campo y pasa al siguiente; tras el último abre productos.
      handleEnterAdvance(event, { onLast: () => onOpenProductLookup?.() });
      return;
    }
    if (!onOpenProductLookup) return;
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    onOpenProductLookup();
  }

  return (
    <div className="sales-cart">
      <div
        className="sales-cart-table-wrap"
        data-enter-scope
        role={cart.length > 0 ? undefined : "button"}
        tabIndex={cart.length > 0 ? -1 : 0}
        aria-label={
          cart.length > 0
            ? "Detalle de productos de la venta"
            : "Abrir productos para agregar a la venta"
        }
        onClick={handleTableClick}
        onKeyDown={handleTableKeyDown}
      >
        <table className="sales-cart-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Und</th>
              {showWarehouse && <th>Bodega</th>}
              <th>Precio</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item) => {
              const price =
                getPriceById(item.product, item.productPriceId) ??
                getDefaultPrice(item.product);
              const lineTotals = calculateLineTotals({
                unitPriceNet: cartUnitPriceNet(item, price),
                quantity: item.quantity,
                taxRate: item.product.taxRate,
              });
              return (
                <tr key={item.productId}>
                  <td>
                    <strong>
                      {item.product.primaryBarcode ??
                        item.product.code ??
                        item.product.id}
                    </strong>
                  </td>
                  <td className="sales-cart-description-cell">
                    <strong>{item.product.name}</strong>
                  </td>
                  <td>
                    <SalesQuantityInput
                      item={item}
                      onUpdateQuantity={onUpdateQuantity}
                    />
                  </td>
                  <td>UND</td>
                  {showWarehouse && (
                    <td>
                      <LineWarehouse
                        item={item}
                        warehouses={warehouses}
                        defaultWarehouseId={defaultWarehouseId}
                        onChange={onUpdateWarehouse}
                      />
                    </td>
                  )}
                  <td>
                    {canOverridePrice ? (
                      <SalesPriceInput
                        item={item}
                        catalogPrice={price}
                        onUpdatePrice={onUpdatePrice}
                      />
                    ) : (
                      <span className="sales-cart-price-level">
                        {formatCop(
                          grossFromNet(
                            cartUnitPriceNet(item, price),
                            item.product.taxRate,
                          ),
                        )}
                      </span>
                    )}
                  </td>
                  <td className="sales-cart-total">
                    {formatCop(lineTotals.total)}
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: blankRowCount }, (_, index) =>
              index === 0 && onScan ? (
                // Fila de captura (como en Saint): Código + Enter agrega el producto;
                // Enter con el código vacío abre la lista de productos.
                <tr className="sales-cart-empty-row sales-cart-entry-row" key="entry">
                  <td>
                    <SalesEntryCode
                      onScan={onScan}
                      onOpenProductLookup={onOpenProductLookup}
                    />
                  </td>
                  <td colSpan={columns - 1} />
                </tr>
              ) : (
                <tr className="sales-cart-empty-row" key={`empty-${index}`}>
                  <td colSpan={columns} />
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="sales-cart-summary">
        <span>
          Subtotal <strong>{formatCop(totals.subtotal)}</strong>
        </span>
        <span>
          IVA <strong>{formatCop(totals.taxes)}</strong>
        </span>
        <span className="is-total">
          Total <strong>{formatCop(totals.total)}</strong>
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

/**
 * Bodega de origen de cada línea (#45) con la existencia disponible por ubicación (#46).
 * Una línea que sale de una bodega distinta a la del encabezado se resalta.
 */
function LineWarehouse({ item, warehouses, defaultWarehouseId, onChange }) {
  const effectiveId = item.warehouseId ?? Number(defaultWarehouseId);
  const stockByWarehouse = new Map(
    (item.product?.warehouses ?? []).map((row) => [Number(row.warehouseId), Number(row.quantity ?? 0)]),
  );
  const isOther = item.warehouseId && Number(item.warehouseId) !== Number(defaultWarehouseId);
  const requested = Number(item.quantity ?? 0);
  const available = stockByWarehouse.get(Number(effectiveId)) ?? 0;
  return (
    <div className={`sales-line-warehouse ${isOther ? "is-other" : ""}`}>
      <select
        value={item.warehouseId ?? ""}
        aria-label={`Bodega de origen de ${item.product?.name}`}
        onChange={(event) => onChange?.(item.productId, event.target.value)}
      >
        <option value="">
          Bodega del encabezado · disp. {stockByWarehouse.get(Number(defaultWarehouseId)) ?? 0}
        </option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.location} · disp. {stockByWarehouse.get(Number(warehouse.id)) ?? 0}
          </option>
        ))}
      </select>
      {isOther && <strong className="sales-line-badge">OTRA BODEGA</strong>}
      {requested > available && (
        <small className="sales-line-short">Solo hay {available} en esa bodega</small>
      )}
    </div>
  );
}

function SalesEntryCode({ onScan, onOpenProductLookup }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="sales-quantity-control">
    <input
      data-sales-scanner
      autoComplete="off"
      value={code}
      disabled={busy}
      aria-label="Código del siguiente producto"
      onChange={(event) => setCode(event.target.value)}
      onKeyDown={async (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        const value = code.trim();
        if (!value) {
          onOpenProductLookup?.();
          return;
        }
        setBusy(true);
        setCode("");
        try {
          await onScan(value);
        } finally {
          setBusy(false);
          // El input se deshabilita mientras consulta: se devuelve el foco al terminar.
          setTimeout(focusSalesScanner, 0);
        }
      }}
    />
    </div>
  );
}

function SalesQuantityInput({ item, onUpdateQuantity }) {
  const [draft, setDraft] = useState(String(item.quantity));
  return (
    <div className="sales-quantity-control">
      <input
        type="text"
        onKeyDown={(event) => {
          // Enter confirma la cantidad y devuelve el foco al lector de códigos.
          if (event.key !== "Enter") return;
          event.preventDefault();
          const parsedValue = parseQuantityInput(draft);
          if (parsedValue !== null) {
            onUpdateQuantity(item.productId, parsedValue);
            setDraft(String(parsedValue));
          }
          focusSalesScanner();
        }}
        inputMode="decimal"
        min="0.001"
        step="any"
        value={draft}
        onChange={(event) => {
          const rawValue = event.target.value;
          if (!isQuantityDraft(rawValue)) return;
          setDraft(rawValue);
          const parsedValue = parseQuantityInput(rawValue);
          if (parsedValue !== null) onUpdateQuantity(item.productId, parsedValue);
        }}
        onBlur={() => {
          const parsedValue = parseQuantityInput(draft);
          if (parsedValue === null) {
            setDraft(String(item.quantity));
          } else {
            setDraft(String(parsedValue));
          }
        }}
        aria-label={`Cantidad de ${item.product.name}`}
      />
    </div>
  );
}

function SalesPriceInput({ item, catalogPrice, onUpdatePrice }) {
  const currentNet = cartUnitPriceNet(item, catalogPrice);
  const currentGross = grossFromNet(currentNet, item.product.taxRate);
  const [draft, setDraft] = useState(String(Math.round(currentGross)));

  useEffect(() => {
    setDraft(String(Math.round(currentGross)));
  }, [currentGross]);

  function commit() {
    const parsed = readCopInput(draft).value;
    if (parsed <= 0) {
      setDraft(String(Math.round(currentGross)));
      return;
    }
    const catalogGross = grossFromNet(
      hasAppliedUnitPrice(item.appliedUnitPrice)
        ? Number(item.appliedUnitPrice)
        : Number(catalogPrice?.price ?? 0),
      item.product.taxRate,
    );
    onUpdatePrice(
      item.productId,
      Math.abs(parsed - catalogGross) < 0.005 ? null : parsed,
    );
    setDraft(String(parsed));
  }

  return (
    <label className="sales-cart-price-editor">
      <CopInput
        value={readCopInput(draft).value}
        onChange={(amount) => setDraft(String(amount))}
        onBlur={commit}
        onKeyDown={(event) => {
          // Confirma el precio; el avance al siguiente recuadro lo hace el contenedor.
          if (event.key === "Enter") commit();
        }}
        aria-label={`Precio final con IVA de ${item.product.name}`}
      />
    </label>
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
              <th>Vendedor</th>
              <th>Cajero</th>
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
                  <td>{invoice.sellerUsername ?? invoice.createdByUsername ?? "—"}</td>
                  <td>{invoice.createdByUsername ?? "—"}</td>
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
                  <td>{formatCop(invoice.total)}</td>
                  <td>
                    <div className="sales-table-actions">
                      <button
                        type="button"
                        onClick={() =>
                          onSelect({ ...invoice, __salesType: "invoice" })
                        }
                      >
                        <Eye size={13} /> Ver
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
                    {quote.kind === "PREVENTA" && <small className="sales-kind-badge"> Preventa</small>}
                  </td>
                  <td>{clientName(quote.client)}</td>
                  <td>{quote.items?.length ?? 0}</td>
                  <td>{formatDate(quote.expiresAt)}</td>
                  <td>{formatCop(quote.total)}</td>
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
                        <Eye size={13} /> Ver
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
                      {quote.kind !== "PREVENTA" && ["PENDIENTE", "APROBADA"].includes(quote.status) && (
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
                          <Eye size={13} /> Ver
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
                    <td>{formatCop(order.total)}</td>
                    <td>
                      <div className="sales-table-actions">
                        <button type="button" onClick={() => onSelect(detail)}>
                          <Eye size={13} /> Ver
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

const REPORT_INITIAL_FILTERS = {
  period: "30D",
  from: "",
  to: "",
  source: "ALL",
  status: "ACTIVA",
  saleMode: "ALL",
  warehouse: "ALL",
  seller: "ALL",
  client: "ALL",
  query: "",
};

function ReportsPanel({ invoices, quotes, orders, clients, warehouses, salesUsers, onSelect }) {
  const [filters, setFilters] = useState(REPORT_INITIAL_FILTERS);
  const [activeTab, setActiveTab] = useState("overview");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const range = useMemo(() => salesReportRange(filters), [filters]);
  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => matchesSalesReportInvoice(invoice, filters, range)),
    [filters, invoices, range],
  );
  const filteredQuotes = useMemo(
    () => quotes.filter((quote) => matchesSalesReportDocument(quote, filters, range)),
    [filters, quotes, range],
  );
  const filteredOrders = useMemo(
    () => orders.filter((order) => inSalesReportRange(order.createdAt, range)),
    [orders, range],
  );
  const metrics = useMemo(
    () => buildSalesReportMetrics(filteredInvoices, filteredQuotes, filteredOrders),
    [filteredInvoices, filteredOrders, filteredQuotes],
  );
  const dailySales = useMemo(
    () => buildDailySales(filteredInvoices),
    [filteredInvoices],
  );
  const sourceMix = useMemo(() => buildSourceMix(filteredInvoices), [filteredInvoices]);
  const paymentMix = useMemo(() => buildPaymentMix(filteredInvoices), [filteredInvoices]);
  const topProducts = useMemo(() => buildTopSalesProducts(filteredInvoices), [filteredInvoices]);
  const sellerRows = useMemo(() => buildSellerRows(filteredInvoices), [filteredInvoices]);
  const topClients = useMemo(() => buildTopSalesClients(filteredInvoices), [filteredInvoices]);
  const summary = useMemo(
    () => buildSalesSummary(metrics, dailySales, topProducts, topClients, filteredQuotes),
    [dailySales, filteredQuotes, metrics, topClients, topProducts],
  );
  const recommendations = useMemo(
    () => buildSalesRecommendations(metrics, topProducts, filteredQuotes, filteredInvoices, filteredOrders),
    [filteredInvoices, filteredOrders, filteredQuotes, metrics, topProducts],
  );
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const reportTabs = [
    { id: "overview", label: "Resumen", icon: BarChart3 },
    { id: "trends", label: "Tendencias", icon: TrendingUp },
    { id: "products", label: "Productos y equipo", icon: Package },
    { id: "opportunities", label: "Oportunidades", icon: Lightbulb },
    { id: "detail", label: "Detalle", icon: ReceiptText },
  ];

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }

  function resetFilters() {
    setFilters(REPORT_INITIAL_FILTERS);
    setPage(1);
  }

  function exportReportCsv() {
    if (!filteredInvoices.length) return;
    const headers = ["Fecha", "Factura", "Cliente", "Origen", "Forma de pago", "Vendedor", "Total", "Utilidad"];
    const rows = filteredInvoices.map((invoice) => [
      formatDate(invoice.createdAt),
      invoice.consecutive,
      clientName(invoice.client),
      invoiceSourceLabel(invoice.source),
      invoice.saleMode === "CREDITO" ? "Crédito" : "Contado",
      reportSellerName(invoice),
      Number(invoice.total ?? 0).toFixed(2),
      invoiceProfit(invoice).toFixed(2),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    downloadSalesReport(csv, `ventas-${filters.period.toLowerCase()}.csv`);
  }

  async function exportReportPdf() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 34;
    const colors = { navy: [28, 48, 74], blue: [43, 108, 176], green: [49, 165, 109], amber: [210, 138, 37], ink: [41, 57, 78], muted: [104, 121, 143], line: [224, 231, 239], pale: [244, 247, 251] };
    let y = 0;
    const ensureSpace = (height) => { if (y + height > pageHeight - margin) { doc.addPage(); y = margin; drawHeader(false); return true; } return false; };
    const drawHeader = (first = true) => {
      if (first) { doc.setFillColor(...colors.navy); doc.rect(0, 0, pageWidth, 78, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("MUNDO TIENDA", margin, 34); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("REPORTE COMERCIAL DE VENTAS", margin, 54); doc.setFontSize(10); doc.text(`Periodo: ${range.label}`, pageWidth - margin, 34, { align: "right" }); doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, pageWidth - margin, 52, { align: "right" }); y = 106; }
      else { doc.setFillColor(...colors.navy); doc.rect(0, 0, pageWidth, 34, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("MUNDO TIENDA · REPORTE DE VENTAS", margin, 21); y = 55; }
    };
    const sectionTitle = (title) => { ensureSpace(28); doc.setTextColor(...colors.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(title, margin, y); y += 18; };
    drawHeader();
    doc.setFillColor(...colors.pale); doc.roundedRect(margin, y, pageWidth - margin * 2, 45, 6, 6, "F"); doc.setTextColor(...colors.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(summary.headline, margin + 14, y + 18); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...colors.muted); doc.text(doc.splitTextToSize(summary.detail, pageWidth - margin * 2 - 28), margin + 14, y + 33); y += 62;
    const metricCards = [["Ventas", formatCop(metrics.sales), colors.blue], ["Ticket promedio", formatCop(metrics.averageTicket), colors.navy], ["Utilidad bruta", `${formatCop(metrics.profit)} · ${metrics.margin.toFixed(1)}%`, colors.green], ["IVA generado", formatCop(metrics.taxes), colors.amber], ["Ventas a crédito", `${formatCop(metrics.creditSales)} · ${metrics.creditShare.toFixed(1)}%`, colors.amber]];
    const cardGap = 9; const cardWidth = (pageWidth - margin * 2 - cardGap * (metricCards.length - 1)) / metricCards.length;
    metricCards.forEach(([label, value, color], index) => { const x = margin + index * (cardWidth + cardGap); doc.setFillColor(255, 255, 255); doc.setDrawColor(...colors.line); doc.roundedRect(x, y, cardWidth, 58, 5, 5, "FD"); doc.setFillColor(...color); doc.roundedRect(x, y, cardWidth, 4, 2, 2, "F"); doc.setTextColor(...colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(label, x + 10, y + 20); doc.setTextColor(...colors.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(value, x + 10, y + 41); }); y += 82;
    sectionTitle("Productos con mayor facturación");
    topProducts.slice(0, 8).forEach((row, index) => { ensureSpace(18); doc.setTextColor(...colors.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`${index + 1}. ${row.name}`, margin, y); doc.setTextColor(...colors.muted); doc.text(`${formatQuantity(row.units)} unidades`, margin + 250, y); doc.setTextColor(...colors.green); doc.setFont("helvetica", "bold"); doc.text(formatCop(row.profit), pageWidth - margin - 135, y, { align: "right" }); doc.setTextColor(...colors.ink); doc.text(formatCop(row.total), pageWidth - margin, y, { align: "right" }); y += 17; });
    y += 8; sectionTitle("Recomendaciones de negocio");
    recommendations.forEach((recommendation) => { ensureSpace(30); doc.setFillColor(...colors.pale); doc.roundedRect(margin, y - 10, pageWidth - margin * 2, 29, 4, 4, "F"); doc.setTextColor(...colors.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(recommendation.title, margin + 10, y + 2); doc.setTextColor(...colors.muted); doc.setFont("helvetica", "normal"); doc.text(doc.splitTextToSize(recommendation.detail, pageWidth - margin * 2 - 220), margin + 210, y + 2); y += 38; });
    sectionTitle("Detalle de facturas filtradas");
    const columns = [{ label: "Fecha", width: 74 }, { label: "Factura", width: 145 }, { label: "Cliente", width: 190 }, { label: "Origen", width: 80 }, { label: "Pago", width: 62 }, { label: "Total", width: 90 }, { label: "Utilidad", width: 90 }];
    const drawTableHeader = () => { ensureSpace(24); doc.setFillColor(...colors.navy); doc.rect(margin, y - 12, pageWidth - margin * 2, 21, "F"); let x = margin + 7; doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8); columns.forEach((column) => { doc.text(column.label, x, y + 1); x += column.width; }); y += 20; };
    drawTableHeader();
    filteredInvoices.slice(0, 100).forEach((invoice, index) => { if (ensureSpace(20)) drawTableHeader(); if (index % 2 === 0) { doc.setFillColor(250, 252, 254); doc.rect(margin, y - 11, pageWidth - margin * 2, 19, "F"); } let x = margin + 7; const values = [formatDate(invoice.createdAt), invoice.consecutive, clientName(invoice.client), invoiceSourceLabel(invoice.source), invoice.saleMode === "CREDITO" ? "Crédito" : "Contado", formatCop(invoice.total), formatCop(invoiceProfit(invoice))]; doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...colors.ink); values.forEach((value, valueIndex) => { doc.text(doc.splitTextToSize(String(value), columns[valueIndex].width - 12)[0], x, y); x += columns[valueIndex].width; }); y += 19; });
    doc.setTextColor(...colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("Mundo Tienda · Reporte generado desde el módulo de Ventas", margin, pageHeight - 18); doc.save(`reporte-ventas-${filters.period.toLowerCase()}.pdf`);
  }

  async function exportReportExcel() {
    const XLSX = await import("xlsx");
    const rows = filteredInvoices.map((invoice) => ({
      Fecha: formatDate(invoice.createdAt),
      Factura: invoice.consecutive,
      Cliente: clientName(invoice.client),
      Origen: invoiceSourceLabel(invoice.source),
      Pago: invoice.saleMode === "CREDITO" ? "Crédito" : "Contado",
      Vendedor: reportSellerName(invoice),
      Subtotal: Number(invoice.subtotal ?? 0),
      IVA: Number(invoice.taxes ?? 0),
      Total: Number(invoice.total ?? 0),
      Utilidad: invoiceProfit(invoice),
    }));
    const summaryRows = [
      { Indicador: "Periodo", Valor: range.label },
      { Indicador: "Facturas filtradas", Valor: metrics.invoices },
      { Indicador: "Ventas", Valor: metrics.sales },
      { Indicador: "Ticket promedio", Valor: metrics.averageTicket },
      { Indicador: "Utilidad bruta", Valor: metrics.profit },
      { Indicador: "Margen", Valor: `${metrics.margin.toFixed(1)}%` },
      { Indicador: "IVA generado", Valor: metrics.taxes },
      { Indicador: "Ventas a crédito", Valor: metrics.creditSales },
      { Indicador: "Unidades vendidas", Valor: metrics.units },
    ];
    const workbook = XLSX.utils.book_new();
    const appendSheet = (name, data, widths) => { const sheet = XLSX.utils.json_to_sheet(data); sheet["!cols"] = widths.map((wch) => ({ wch })); if (data.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(sheet["!ref"])) }; XLSX.utils.book_append_sheet(workbook, sheet, name); };
    appendSheet("Resumen", summaryRows, [28, 24]);
    appendSheet("Facturas", rows, [14, 22, 28, 16, 14, 24, 14, 14, 14, 14]);
    appendSheet("Productos", topProducts.slice(0, 100).map((row) => ({ Producto: row.name, Unidades: row.units, Ventas: row.total, Utilidad: row.profit, Margen: row.total > 0 ? `${((row.profit / row.total) * 100).toFixed(1)}%` : "0%" })), [34, 14, 16, 16, 12]);
    appendSheet("Vendedores", sellerRows.slice(0, 100).map((row) => ({ Vendedor: row.name, Facturas: row.count, Ventas: row.total, Utilidad: row.profit })), [28, 14, 16, 16]);
    appendSheet("Clientes", topClients.slice(0, 100).map((row) => ({ Cliente: row.name, Facturas: row.count, Ventas: row.total })), [34, 14, 16]);
    appendSheet("Evolución", dailySales.map((row) => ({ Fecha: row.label, Ventas: row.total, Utilidad: row.profit })), [16, 16, 16]);
    appendSheet("Oportunidades", [
      { Indicador: "Cotizaciones totales", Cantidad: metrics.totalQuotes, Valor: metrics.totalQuoteValue },
      { Indicador: "Cotizaciones abiertas", Cantidad: metrics.openQuotes, Valor: metrics.openQuoteValue },
      { Indicador: "Cotizaciones convertidas", Cantidad: metrics.convertedQuotes, Valor: metrics.convertedQuoteValue },
      { Indicador: "Entregas pendientes", Cantidad: metrics.pendingDeliveries, Valor: "" },
    ], [30, 14, 18]);
    XLSX.writeFile(workbook, `reporte-ventas-${filters.period.toLowerCase()}.xlsx`);
  }

  return (
    <div className="sales-report-panel sales-report-dashboard">
      <div className="sales-report-hero">
        <div>
          <span className="sales-report-eyebrow">MÓDULO DE VENTAS · ANALÍTICA</span>
          <h2>Panel comercial</h2>
          <p>Lectura rápida de facturación, rentabilidad, clientes y oportunidades.</p>
        </div>
        <div className="sales-report-hero-actions">
          <span className="sales-report-period-label"><CalendarDays size={14} /> {range.label}</span>
          <button type="button" onClick={resetFilters}><RotateCcw size={14} /> Restablecer</button>
          <button type="button" onClick={exportReportCsv} disabled={!filteredInvoices.length}><Download size={14} /> CSV</button>
          <button type="button" onClick={exportReportPdf}><FileText size={14} /> PDF</button>
          <button type="button" onClick={exportReportExcel}><FileSpreadsheet size={14} /> Excel</button>
        </div>
      </div>

      <section className="sales-report-filter-panel">
        <div className="sales-report-filter-heading">
          <div><Filter size={15} /><strong>Filtros del reporte</strong></div>
          <span>{filteredInvoices.length} facturas · {filteredQuotes.length} cotizaciones · {filteredOrders.length} pedidos</span>
        </div>
        <div className="sales-report-quick-filters" aria-label="Periodos rápidos">
          {[['TODAY', 'Hoy'], ['7D', '7 días'], ['30D', '30 días'], ['90D', '90 días'], ['ALL', 'Historial']].map(([value, label]) => <button key={value} type="button" className={filters.period === value ? "is-active" : ""} onClick={() => updateFilter("period", value)}>{label}</button>)}
          <button type="button" className={filters.period === "CUSTOM" ? "is-active" : ""} onClick={() => updateFilter("period", "CUSTOM")}><CalendarDays size={13} /> Rango personalizado</button>
        </div>
        <div className="sales-report-filters">
          <label><span>Periodo</span><select value={filters.period} onChange={(event) => updateFilter("period", event.target.value)}>
            <option value="TODAY">Hoy</option><option value="7D">Últimos 7 días</option><option value="30D">Últimos 30 días</option><option value="90D">Últimos 90 días</option><option value="ALL">Todo el historial</option><option value="CUSTOM">Personalizado</option>
          </select></label>
          {filters.period === "CUSTOM" && <>
            <label><span>Desde</span><input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
            <label><span>Hasta</span><input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
          </>}
          <label><span>Origen</span><select value={filters.source} onChange={(event) => updateFilter("source", event.target.value)}>
            <option value="ALL">Todos</option><option value="ADMIN">Administrativo</option><option value="POS">POS</option><option value="APP_MOVIL">App móvil</option>
          </select></label>
          <label><span>Estado</span><select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
            <option value="ACTIVA">Activas</option><option value="ANULADA">Anuladas</option><option value="ALL">Todos</option>
          </select></label>
          <label><span>Pago</span><select value={filters.saleMode} onChange={(event) => updateFilter("saleMode", event.target.value)}>
            <option value="ALL">Contado y crédito</option><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option>
          </select></label>
          <label><span>Bodega</span><select value={filters.warehouse} onChange={(event) => updateFilter("warehouse", event.target.value)}>
            <option value="ALL">Todas</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.location ?? warehouse.name ?? `Bodega ${warehouse.id}`}</option>)}
          </select></label>
          <label><span>Vendedor</span><select value={filters.seller} onChange={(event) => updateFilter("seller", event.target.value)}>
            <option value="ALL">Todos</option>{salesUsers.map((user) => <option key={user.id} value={user.username}>{user.employee ? `${user.employee.firstName ?? ""} ${user.employee.lastName ?? ""}`.trim() || user.username : user.username}</option>)}
          </select></label>
          <label><span>Cliente</span><select value={filters.client} onChange={(event) => updateFilter("client", event.target.value)}>
            <option value="ALL">Todos</option>{clients.map((client) => <option key={client.id} value={client.id}>{clientName(client)}</option>)}
          </select></label>
          <label className="sales-report-filter-search"><span>Buscar</span><div><Search size={14} /><input value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="Factura, cliente o producto" /></div></label>
        </div>
      </section>

      <section className="sales-report-kpis">
        <ReportMetricCard icon={CircleDollarSign} label="Ventas" value={formatCop(metrics.sales)} helper={`${metrics.invoices} facturas filtradas`} tone="primary" />
        <ReportMetricCard icon={ReceiptText} label="Ticket promedio" value={formatCop(metrics.averageTicket)} helper="Venta media por factura" />
        <ReportMetricCard icon={TrendingUp} label="Utilidad bruta" value={formatCop(metrics.profit)} helper={`${metrics.margin.toFixed(1)}% sobre ventas`} tone="positive" />
        <ReportMetricCard icon={Percent} label="IVA generado" value={formatCop(metrics.taxes)} helper={`${metrics.taxRate.toFixed(1)}% de la venta`} />
        <ReportMetricCard icon={CreditCard} label="Ventas a crédito" value={formatCop(metrics.creditSales)} helper={`${metrics.creditShare.toFixed(1)}% del periodo`} tone="warning" />
        <ReportMetricCard icon={Boxes} label="Unidades vendidas" value={formatQuantity(metrics.units)} helper={`${metrics.activeProducts} productos con movimiento`} />
      </section>

      <nav className="sales-report-tabs" role="tablist" aria-label="Secciones del reporte">
        {reportTabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}><Icon size={14} />{label}</button>)}
      </nav>

      <div className="sales-report-tab-panel" role="tabpanel">
        {activeTab === "overview" && <>
          <SalesExecutiveSummary summary={summary} metrics={metrics} />
          <div className="sales-report-main-grid">
            <section className="sales-report-card sales-report-trend-card">
              <div className="sales-report-card-heading"><div><span>EVOLUCIÓN</span><strong>Ventas por día</strong></div><span className="sales-report-card-meta">{range.label}</span></div>
              <SalesTrendChart points={dailySales} />
            </section>
            <section className="sales-report-card sales-report-source-card">
              <div className="sales-report-card-heading"><div><span>MEZCLA COMERCIAL</span><strong>Origen de las ventas</strong></div><BarChart3 size={16} /></div>
              <SalesSourceMix sourceMix={sourceMix} sales={metrics.sales} />
            </section>
          </div>
          <RecommendationsPanel recommendations={recommendations} />
        </>}

        {activeTab === "trends" && <div className="sales-report-chart-grid">
          <section className="sales-report-card sales-report-wide-chart"><div className="sales-report-card-heading"><div><span>EVOLUCIÓN</span><strong>Tendencia de facturación</strong></div><span className="sales-report-card-meta">{range.label}</span></div><SalesTrendChart points={dailySales} /></section>
          <section className="sales-report-card"><div className="sales-report-card-heading"><div><span>MEZCLA COMERCIAL</span><strong>Origen de las ventas</strong></div><BarChart3 size={16} /></div><SalesSourceMix sourceMix={sourceMix} sales={metrics.sales} /></section>
          <section className="sales-report-card"><div className="sales-report-card-heading"><div><span>FORMA DE PAGO</span><strong>Contado frente a crédito</strong></div><CreditCard size={16} /></div><SalesPaymentChart rows={paymentMix} /></section>
          <section className="sales-report-card sales-report-wide-chart"><div className="sales-report-card-heading"><div><span>COMPARATIVO</span><strong>Ventas y utilidad por día</strong></div><TrendingUp size={16} /></div><SalesTrendComparison points={dailySales} /></section>
        </div>}

        {activeTab === "products" && <div className="sales-report-products-grid">
          <section className="sales-report-card"><div className="sales-report-card-heading"><div><span>PRODUCTOS</span><strong>Lo que más se vende</strong></div><Package size={16} /></div><TopSalesProducts rows={topProducts} /></section>
          <section className="sales-report-card"><div className="sales-report-card-heading"><div><span>EQUIPO</span><strong>Ventas por vendedor</strong></div><Users size={16} /></div><SalesSellerTable rows={sellerRows} /></section>
          <section className="sales-report-card sales-report-products-chart"><div className="sales-report-card-heading"><div><span>FACTURACIÓN</span><strong>Comparativo de productos</strong></div><BarChart3 size={16} /></div><SalesProductChart rows={topProducts} /></section>
          <section className="sales-report-card sales-report-products-chart"><div className="sales-report-card-heading"><div><span>DESEMPEÑO</span><strong>Ventas por vendedor</strong></div><Users size={16} /></div><SalesSellerChart rows={sellerRows} /></section>
          <section className="sales-report-card sales-report-product-insight"><div className="sales-report-card-heading"><div><span>RENTABILIDAD</span><strong>Lectura de margen</strong></div><TrendingUp size={16} /></div><MarginInsight metrics={metrics} topProducts={topProducts} /></section>
          <section className="sales-report-card"><div className="sales-report-card-heading"><div><span>CLIENTES</span><strong>Mayor aporte a ventas</strong></div><Users size={16} /></div><TopClientsTable rows={topClients} /></section>
        </div>}

        {activeTab === "opportunities" && <>
          <div className="sales-report-opportunity-grid">
            <section className="sales-report-card sales-report-opportunity-card"><div className="sales-report-card-heading"><div><span>OPORTUNIDADES</span><strong>Embudo comercial</strong></div><ArrowUpRight size={16} /></div><OpportunityFunnel metrics={metrics} /></section>
            <section className="sales-report-card"><div className="sales-report-card-heading"><div><span>ACCIÓN SUGERIDA</span><strong>Prioridades de seguimiento</strong></div><Lightbulb size={16} /></div><OpportunityActions metrics={metrics} topClients={topClients} /></section>
            <RecommendationsPanel recommendations={recommendations} />
          </div>
        </>}

        {activeTab === "detail" && <section className="sales-report-card sales-report-detail-card">
          <div className="sales-report-card-heading"><div><span>DETALLE</span><strong>Facturas filtradas</strong></div><span className="sales-report-card-meta">Mostrando {paginatedInvoices.length} de {filteredInvoices.length}</span></div>
          <div className="sales-report-detail-scroll"><table className="sales-report-detail-table"><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Origen</th><th>Pago</th><th>Vendedor</th><th>Total</th><th>Utilidad</th></tr></thead><tbody>{paginatedInvoices.map((invoice) => <tr key={invoice.id} className="sales-report-detail-row" tabIndex="0" onClick={() => onSelect?.({ ...invoice, __salesType: "invoice" })} onDoubleClick={() => onSelect?.({ ...invoice, __salesType: "invoice" })} onKeyDown={(event) => { if (event.key === "Enter") onSelect?.({ ...invoice, __salesType: "invoice" }); }}><td>{formatDate(invoice.createdAt)}</td><td><strong>{invoice.consecutive}</strong></td><td>{clientName(invoice.client)}</td><td><span className="sales-report-source-pill">{invoiceSourceLabel(invoice.source)}</span></td><td>{invoice.saleMode === "CREDITO" ? "Crédito" : "Contado"}</td><td>{reportSellerName(invoice)}</td><td className="sales-report-number">{formatCop(invoice.total)}</td><td className="sales-report-number">{formatCop(invoiceProfit(invoice))}</td></tr>)}</tbody></table>{!filteredInvoices.length && <div className="sales-report-empty">No hay facturas con los filtros seleccionados.</div>}</div>
          {filteredInvoices.length > 0 && <div className="sales-report-pagination"><span>Página {currentPage} de {totalPages}</span><label>Filas<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Siguiente</button></div></div>}
        </section>}

      </div>
    </div>
  );
}

function SalesExecutiveSummary({ summary, metrics }) {
  return <section className="sales-report-executive-summary"><div className="sales-report-summary-copy"><span className="sales-report-summary-kicker">RESUMEN EJECUTIVO</span><strong>{summary.headline}</strong><p>{summary.detail}</p></div><div className="sales-report-summary-highlights"><div><span>Mejor día</span><strong>{summary.bestDay}</strong><small>{formatCop(summary.bestDayValue)}</small></div><div><span>Producto líder</span><strong>{summary.topProduct}</strong><small>{formatCop(summary.topProductValue)}</small></div><div><span>Clientes activos</span><strong>{summary.activeClients}</strong><small>{metrics.invoices} facturas en el filtro</small></div></div></section>;
}

function SalesSourceMix({ sourceMix, sales }) {
  if (!sourceMix.length) return <div className="sales-report-empty">Sin ventas en el filtro.</div>;
  return <div className="sales-report-chart-donut-wrap"><div className="sales-report-chart-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={sourceMix} dataKey="total" nameKey="label" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">{sourceMix.map((segment) => <Cell key={segment.key} fill={segment.color} />)}</Pie><Tooltip content={<ReportTooltip currency />} /></PieChart></ResponsiveContainer><div><strong>{formatCop(sales)}</strong><span>Total</span></div></div><div className="sales-report-legend">{sourceMix.map((segment) => <div key={segment.key}><i style={{ background: segment.color }} /><span>{segment.label}</span><strong>{formatCop(segment.total)}</strong><small>{segment.count} facturas · {segment.share.toFixed(1)}%</small></div>)}</div></div>;
}

function SalesPaymentChart({ rows }) {
  if (!rows.length) return <div className="sales-report-empty">Sin datos de pago.</div>;
  return <div className="sales-report-payment-chart"><ResponsiveContainer width="100%" height={245}><BarChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e9eef4" /><XAxis dataKey="label" tick={{ fill: "#718096", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#8a98aa", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatCurrencyShort(value)} /><Tooltip content={<ReportTooltip currency />} /><Bar dataKey="total" radius={[5, 5, 0, 0]} fill="#2b6cb0" /></BarChart></ResponsiveContainer></div>;
}

function SalesProductChart({ rows }) {
  if (!rows.length) return <div className="sales-report-empty">Sin productos en el filtro.</div>;
  return <div className="sales-report-products-chart-wrap"><ResponsiveContainer width="100%" height={300}><BarChart data={rows.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 18, left: 5, bottom: 5 }}><CartesianGrid horizontal={false} stroke="#e9eef4" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={120} tick={{ fill: "#596b82", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={<ReportTooltip currency />} /><Bar dataKey="total" radius={[0, 5, 5, 0]} fill="#31a56d" /></BarChart></ResponsiveContainer></div>;
}

function SalesSellerChart({ rows }) {
  if (!rows.length) return <div className="sales-report-empty">Sin vendedores en el filtro.</div>;
  return <div className="sales-report-products-chart-wrap"><ResponsiveContainer width="100%" height={300}><BarChart data={rows.slice(0, 8)} margin={{ top: 5, right: 10, left: -8, bottom: 5 }}><CartesianGrid vertical={false} stroke="#e9eef4" /><XAxis dataKey="name" tick={{ fill: "#596b82", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => value.slice(0, 10)} /><YAxis tick={{ fill: "#8a98aa", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatCurrencyShort(value)} /><Tooltip content={<ReportTooltip currency />} /><Bar dataKey="total" radius={[5, 5, 0, 0]} fill="#d28a25" /></BarChart></ResponsiveContainer></div>;
}

function SalesTrendComparison({ points }) {
  if (!points.length) return <div className="sales-report-empty">Sin ventas para comparar.</div>;
  const data = points;
  return <div className="sales-report-comparison-chart"><ResponsiveContainer width="100%" height={290}><LineChart data={data} margin={{ top: 12, right: 18, left: 0, bottom: 6 }}><CartesianGrid vertical={false} stroke="#e9eef4" /><XAxis dataKey="label" tick={{ fill: "#718096", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#8a98aa", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatCurrencyShort(value)} /><Tooltip content={<ReportTooltip currency />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: "#65758b" }} /><Line type="monotone" dataKey="total" name="Ventas" stroke="#2b6cb0" strokeWidth={3} dot={{ r: 2 }} /><Line type="monotone" dataKey="profit" name="Utilidad estimada" stroke="#31a56d" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>;
}

function ReportTooltip({ active, payload, label, currency = false }) {
  if (!active || !payload?.length) return null;
  return <div className="sales-report-tooltip"><strong>{label}</strong>{payload.map((entry) => <div key={entry.dataKey}><span>{entry.name ?? entry.dataKey}</span><b>{currency ? formatCop(entry.value) : entry.value}</b></div>)}</div>;
}

function OpportunityFunnel({ metrics }) {
  const rows = [{ label: "Cotizaciones", value: metrics.totalQuotes, amount: metrics.totalQuoteValue, tone: "blue" }, { label: "Abiertas", value: metrics.openQuotes, amount: metrics.openQuoteValue, tone: "amber" }, { label: "Convertidas", value: metrics.convertedQuotes, amount: metrics.convertedQuoteValue, tone: "green" }];
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <div className="sales-report-funnel">{rows.map((row) => <div key={row.label}><div className="sales-report-funnel-label"><span>{row.label}</span><strong>{row.value}</strong></div><div className="sales-report-funnel-track"><i className={row.tone} style={{ width: `${Math.max(8, (row.value / max) * 100)}%` }} /></div><small>{formatCop(row.amount)}</small></div>)}</div>;
}

function OpportunityActions({ metrics, topClients }) {
  const actions = [];
  if (metrics.openQuotes > 0) actions.push({ title: "Contactar cotizaciones abiertas", detail: `${metrics.openQuotes} oportunidades por ${formatCop(metrics.openQuoteValue)}.` });
  if (metrics.pendingDeliveries > 0) actions.push({ title: "Resolver entregas pendientes", detail: `${metrics.pendingDeliveries} facturas todavía requieren coordinación.` });
  if (metrics.creditShare >= 30) actions.push({ title: "Priorizar recaudo de crédito", detail: `${metrics.creditShare.toFixed(1)}% de la venta está a crédito.` });
  if (topClients[0]) actions.push({ title: `Cuidar la relación con ${topClients[0].name}`, detail: `Aporta ${formatCop(topClients[0].total)} en el periodo.` });
  if (!actions.length) actions.push({ title: "Mantener seguimiento comercial", detail: "El periodo no muestra alertas operativas prioritarias." });
  return <div className="sales-report-action-list">{actions.slice(0, 4).map((action) => <div key={action.title}><span><ArrowUpRight size={13} /></span><div><strong>{action.title}</strong><p>{action.detail}</p></div></div>)}</div>;
}

function TopClientsTable({ rows }) {
  if (!rows.length) return <div className="sales-report-empty">Sin clientes en el filtro.</div>;
  return <div className="sales-report-client-list">{rows.slice(0, 6).map((row, index) => <div key={row.name}><span>{index + 1}</span><div><strong>{row.name}</strong><small>{row.count} facturas</small></div><b>{formatCop(row.total)}</b></div>)}</div>;
}

function RecommendationsPanel({ recommendations }) {
  return <section className="sales-report-card sales-report-recommendations"><div className="sales-report-card-heading"><div><span>LECTURA DE NEGOCIO</span><strong>Recomendaciones para decidir</strong></div><Lightbulb size={16} /></div><div className="sales-report-recommendation-grid">{recommendations.map((recommendation) => <article key={recommendation.title}><div className={`sales-report-recommendation-icon ${recommendation.tone}`}><ArrowUpRight size={15} /></div><div><strong>{recommendation.title}</strong><p>{recommendation.detail}</p></div></article>)}</div></section>;
}

function MarginInsight({ metrics, topProducts }) {
  const bestProduct = [...topProducts].sort((a, b) => b.profit - a.profit)[0];
  return <div className="sales-report-margin-insight"><div><span>Margen bruto del periodo</span><strong>{metrics.margin.toFixed(1)}%</strong></div><div className="sales-report-margin-track"><i style={{ width: `${Math.min(100, Math.max(0, metrics.margin))}%` }} /></div><p>{bestProduct ? `${bestProduct.name} aporta la mayor utilidad acumulada (${formatCop(bestProduct.profit)}).` : "Aún no hay utilidad calculada para este filtro."}</p></div>;
}

function ReportMetricCard({ icon: Icon, label, value, helper, tone = "neutral" }) {
  return <article className={`sales-report-metric-card ${tone}`}><div><Icon size={15} /><span>{label}</span></div><strong>{value}</strong><small>{helper}</small></article>;
}

function SalesTrendChart({ points }) {
  if (!points.length) return <div className="sales-report-empty sales-report-chart-empty">No hay ventas para dibujar en este periodo.</div>;
  return <div className="sales-report-trend-wrap"><ResponsiveContainer width="100%" height={255}><AreaChart data={points} margin={{ top: 10, right: 12, left: 2, bottom: 5 }}><defs><linearGradient id="sales-report-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2b6cb0" stopOpacity=".28" /><stop offset="100%" stopColor="#2b6cb0" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9eef4" /><XAxis dataKey="label" tick={{ fill: "#8a98aa", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#8a98aa", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatCurrencyShort(value)} /><Tooltip content={<ReportTooltip currency />} /><Area type="monotone" dataKey="total" name="Ventas" stroke="#2b6cb0" strokeWidth={3} fill="url(#sales-report-area)" dot={{ r: 3, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} /></AreaChart></ResponsiveContainer><div className="sales-report-trend-total"><span>Total del periodo</span><strong>{formatCop(points.reduce((sum, point) => sum + point.total, 0))}</strong></div></div>;
}

function TopSalesProducts({ rows }) {
  if (!rows.length) return <div className="sales-report-empty">No hay productos en el periodo.</div>;
  const max = Math.max(...rows.map((row) => row.total), 1);
  return <div className="sales-report-product-list">{rows.slice(0, 6).map((row, index) => <div className="sales-report-product-row" key={row.productId}><div className="sales-report-product-index">{index + 1}</div><div className="sales-report-product-info"><strong>{row.name}</strong><span>{formatQuantity(row.units)} unidades · {formatCop(row.profit)} utilidad</span><div><i style={{ width: `${Math.max(5, (row.total / max) * 100)}%` }} /></div></div><b>{formatCop(row.total)}</b></div>)}</div>;
}

function SalesSellerTable({ rows }) {
  if (!rows.length) return <div className="sales-report-empty">No hay vendedores con ventas en el periodo.</div>;
  return <div className="sales-report-seller-list">{rows.slice(0, 6).map((row) => <div className="sales-report-seller-row" key={row.name}><span className="sales-report-avatar">{row.name.slice(0, 1).toUpperCase()}</span><div><strong>{row.name}</strong><small>{row.count} facturas · {formatCop(row.profit)} utilidad</small></div><b>{formatCop(row.total)}</b></div>)}</div>;
}

function buildSalesReportMetrics(invoices, quotes, orders) {
  const sales = invoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const subtotal = invoices.reduce((sum, invoice) => sum + Number(invoice.subtotal ?? 0), 0);
  const taxes = invoices.reduce((sum, invoice) => sum + Number(invoice.taxes ?? 0), 0);
  const profit = invoices.reduce((sum, invoice) => sum + invoiceProfit(invoice), 0);
  const units = invoices.reduce((sum, invoice) => sum + (invoice.items ?? []).reduce((inner, item) => inner + Number(item.quantity ?? 0), 0), 0);
  const creditSales = invoices.filter((invoice) => invoice.saleMode === "CREDITO").reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const convertedQuoteRows = quotes.filter((quote) => quote.status === "CONVERTIDA");
  const convertedQuotes = convertedQuoteRows.length;
  const openQuotes = quotes.filter((quote) => ["PENDIENTE", "APROBADA"].includes(quote.status));
  const pendingDeliveries = invoices.filter((invoice) => invoice.delivery && invoice.delivery.status !== "ENTREGADO" && invoice.delivery.status !== "CANCELADO").length;
  const deliveredOrders = orders.filter((order) => order.delivery?.status === "ENTREGADO").length;
  return {
    invoices: invoices.length,
    sales,
    subtotal,
    taxes,
    taxRate: sales > 0 ? (taxes / sales) * 100 : 0,
    profit,
    margin: sales > 0 ? (profit / sales) * 100 : 0,
    averageTicket: invoices.length ? sales / invoices.length : 0,
    units,
    activeProducts: new Set(invoices.flatMap((invoice) => (invoice.items ?? []).map((item) => item.productId))).size,
    creditSales,
    creditShare: sales > 0 ? (creditSales / sales) * 100 : 0,
    openQuotes: openQuotes.length,
    openQuoteValue: openQuotes.reduce((sum, quote) => sum + Number(quote.total ?? 0), 0),
    totalQuotes: quotes.length,
    totalQuoteValue: quotes.reduce((sum, quote) => sum + Number(quote.total ?? 0), 0),
    convertedQuotes,
    convertedQuoteValue: convertedQuoteRows.reduce((sum, quote) => sum + Number(quote.total ?? 0), 0),
    quoteConversion: quotes.length ? (convertedQuotes / quotes.length) * 100 : 0,
    pendingDeliveries,
    deliveredOrders,
  };
}

function buildDailySales(invoices) {
  const rows = new Map();
  invoices.forEach((invoice) => {
    const key = salesReportDateKey(invoice.createdAt);
    const current = rows.get(key) ?? { key, total: 0, profit: 0, label: salesReportDayLabel(invoice.createdAt) };
    current.total += Number(invoice.total ?? 0);
    current.profit += invoiceProfit(invoice);
    rows.set(key, current);
  });
  const sorted = [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (sorted.length <= 14) return sorted;
  return sorted.slice(-14);
}

function buildSourceMix(invoices) {
  const colors = { ADMIN: "#2b6cb0", POS: "#31a56d", APP_MOVIL: "#e09b3d", OTHER: "#8995a7" };
  const labels = { ADMIN: "Administrativo", POS: "POS", APP_MOVIL: "App móvil", OTHER: "Otro" };
  const grouped = new Map();
  invoices.forEach((invoice) => {
    const key = colors[invoice.source] ? invoice.source : "OTHER";
    const current = grouped.get(key) ?? { key, label: labels[key], total: 0, count: 0, color: colors[key] };
    current.total += Number(invoice.total ?? 0);
    current.count += 1;
    grouped.set(key, current);
  });
  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  return [...grouped.values()].sort((a, b) => b.total - a.total).map((item) => ({ ...item, share: total > 0 ? (item.total / total) * 100 : 0 }));
}

function buildPaymentMix(invoices) {
  const grouped = new Map([["CONTADO", { label: "Contado", total: 0, count: 0 }], ["CREDITO", { label: "Crédito", total: 0, count: 0 }]]);
  invoices.forEach((invoice) => {
    const key = invoice.saleMode === "CREDITO" ? "CREDITO" : "CONTADO";
    const row = grouped.get(key);
    row.total += Number(invoice.total ?? 0);
    row.count += 1;
  });
  return [...grouped.values()].filter((row) => row.count > 0);
}

function buildTopSalesProducts(invoices) {
  const grouped = new Map();
  invoices.forEach((invoice) => (invoice.items ?? []).forEach((item) => {
    const current = grouped.get(item.productId) ?? { productId: item.productId, name: item.product?.name ?? `Producto #${item.productId}`, units: 0, total: 0, profit: 0 };
    current.units += Number(item.quantity ?? 0);
    current.total += Number(item.total ?? 0);
    current.profit += Number(item.profitAmount ?? 0) || (Number(item.total ?? 0) - Number(item.unitCost ?? 0) * Number(item.quantity ?? 0));
    grouped.set(item.productId, current);
  }));
  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function buildSellerRows(invoices) {
  const grouped = new Map();
  invoices.forEach((invoice) => {
    const name = reportSellerName(invoice);
    const current = grouped.get(name) ?? { name, count: 0, total: 0, profit: 0 };
    current.count += 1;
    current.total += Number(invoice.total ?? 0);
    current.profit += invoiceProfit(invoice);
    grouped.set(name, current);
  });
  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function buildTopSalesClients(invoices) {
  const grouped = new Map();
  invoices.forEach((invoice) => {
    const name = clientName(invoice.client);
    const current = grouped.get(name) ?? { name, count: 0, total: 0 };
    current.count += 1;
    current.total += Number(invoice.total ?? 0);
    grouped.set(name, current);
  });
  return [...grouped.values()].sort((a, b) => b.total - a.total);
}

function buildSalesSummary(metrics, dailySales, topProducts, topClients, quotes) {
  const bestDay = [...dailySales].sort((a, b) => b.total - a.total)[0];
  const topProduct = topProducts[0];
  let headline = "El periodo está listo para ser analizado.";
  if (metrics.sales > 0 && metrics.margin >= 20) headline = "El periodo muestra una operación comercial saludable.";
  else if (metrics.sales > 0 && metrics.margin < 15) headline = "El volumen de ventas requiere proteger la rentabilidad.";
  else if (!metrics.sales) headline = "Amplía el periodo para obtener una lectura comercial completa.";
  const detail = metrics.sales > 0
    ? `${metrics.invoices} facturas generan ${formatCop(metrics.sales)}. ${metrics.openQuotes > 0 ? `Hay ${metrics.openQuotes} cotizaciones abiertas que pueden convertirse en facturación.` : "No hay cotizaciones abiertas pendientes en el filtro."}`
    : `${quotes.length} cotizaciones y ${topClients.length} clientes están disponibles para ajustar la consulta.`;
  return { headline, detail, bestDay: bestDay?.label ?? "—", bestDayValue: bestDay?.total ?? 0, topProduct: topProduct?.name ?? "—", topProductValue: topProduct?.total ?? 0, activeClients: topClients.length };
}

function buildSalesRecommendations(metrics, topProducts, quotes, invoices, orders) {
  const recommendations = [];
  if (topProducts[0]) recommendations.push({ title: `Protege el inventario de ${topProducts[0].name}`, detail: `Es el producto con más facturación del filtro: ${formatCop(topProducts[0].total)}. Revisa existencia y reposición antes del próximo ciclo.`, tone: "blue" });
  if (metrics.openQuotes > 0) recommendations.push({ title: "Haz seguimiento a cotizaciones abiertas", detail: `${metrics.openQuotes} cotizaciones representan ${formatCop(metrics.openQuoteValue)}. Prioriza las de mayor valor y fecha más antigua.`, tone: "amber" });
  if (metrics.creditShare >= 35) recommendations.push({ title: "Revisa la concentración de ventas a crédito", detail: `El crédito representa ${metrics.creditShare.toFixed(1)}% de las ventas filtradas. Valida cupos, vencimientos y próximos recaudos.`, tone: "red" });
  if (metrics.margin > 0 && metrics.margin < 15) recommendations.push({ title: "Revisa precios y costos", detail: `La utilidad bruta calculada es ${metrics.margin.toFixed(1)}%. Identifica productos con margen bajo antes de aplicar descuentos.`, tone: "red" });
  if (metrics.pendingDeliveries > 0) recommendations.push({ title: "Prioriza las entregas pendientes", detail: `${metrics.pendingDeliveries} facturas tienen entrega abierta. Coordina preparación y salida para evitar acumulación operativa.`, tone: "amber" });
  if (!recommendations.length && invoices.length) recommendations.push({ title: "Mantén el seguimiento periódico", detail: `El periodo tiene ${metrics.invoices} facturas y ${orders.length} pedidos. Conserva esta revisión para detectar cambios de mezcla y margen.`, tone: "blue" });
  if (!invoices.length && !quotes.length) recommendations.push({ title: "Amplía el periodo de consulta", detail: "No hay documentos con los filtros actuales. Prueba Todo el historial o ajusta la fecha para encontrar actividad.", tone: "amber" });
  return recommendations.slice(0, 4);
}

function matchesSalesReportInvoice(invoice, filters, range) {
  if (!inSalesReportRange(invoice.createdAt, range)) return false;
  if (filters.source !== "ALL" && invoice.source !== filters.source) return false;
  if (filters.status !== "ALL" && invoice.status !== filters.status) return false;
  if (filters.saleMode !== "ALL" && invoice.saleMode !== filters.saleMode) return false;
  if (filters.warehouse !== "ALL" && String(invoice.warehouseId ?? invoice.warehouse?.id ?? "") !== String(filters.warehouse)) return false;
  if (filters.seller !== "ALL" && reportSellerName(invoice) !== filters.seller && String(invoice.createdByUsername ?? "") !== filters.seller) return false;
  if (filters.client !== "ALL" && String(invoice.clientId ?? invoice.client?.id ?? "") !== String(filters.client)) return false;
  const query = filters.query.trim().toLowerCase();
  if (query && !`${invoice.consecutive ?? ""} ${clientName(invoice.client)} ${(invoice.items ?? []).map((item) => item.product?.name ?? "").join(" ")}`.toLowerCase().includes(query)) return false;
  return true;
}

function matchesSalesReportDocument(document, filters, range) {
  if (!inSalesReportRange(document.createdAt, range)) return false;
  const query = filters.query.trim().toLowerCase();
  return !query || `${document.consecutive ?? ""} ${clientName(document.client)}`.toLowerCase().includes(query);
}

function salesReportRange(filters) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  if (filters.period === "CUSTOM") {
    const start = filters.from ? new Date(`${filters.from}T00:00:00`) : new Date(0);
    const customEnd = filters.to ? new Date(`${filters.to}T23:59:59`) : end;
    return { start, end: customEnd, label: `${filters.from || "inicio"} · ${filters.to || "hoy"}` };
  }
  if (filters.period === "ALL") return { start: new Date(0), end, label: "Todo el historial" };
  const days = { TODAY: 0, "7D": 6, "30D": 29, "90D": 89 }[filters.period] ?? 29;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  return { start, end, label: { TODAY: "Hoy", "7D": "Últimos 7 días", "30D": "Últimos 30 días", "90D": "Últimos 90 días" }[filters.period] ?? "Periodo seleccionado" };
}

function inSalesReportRange(value, range) {
  if (!value) return false;
  const dateValue = new Date(value);
  return dateValue >= range.start && dateValue <= range.end;
}

function salesReportDateKey(value) {
  const dateValue = new Date(value);
  return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}-${String(dateValue.getDate()).padStart(2, "0")}`;
}

function salesReportDayLabel(value) {
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(new Date(value)).replace(".", "");
}

function reportSellerName(invoice) {
  return invoice.sellerUsername ?? invoice.createdByUsername ?? invoice.createdByUser?.username ?? "Sin vendedor";
}

function invoiceProfit(invoice) {
  return (invoice.items ?? []).reduce((sum, item) => {
    const explicit = Number(item.profitAmount);
    if (Number.isFinite(explicit) && explicit !== 0) return sum + explicit;
    return sum + Number(item.total ?? 0) - Number(item.unitCost ?? 0) * Number(item.quantity ?? 0);
  }, 0);
}

function formatQuantity(value) {
  return Number(value ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

function formatCurrencyShort(value) {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(0)}k`;
  return `$${Math.round(amount)}`;
}

function downloadSalesReport(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
                  {formatCop(invoice.total)}
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
  cart = [],
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
                    onDoubleClick={() => {
                      const alreadyInCart =
                        type === "products" &&
                        cart.some((item) => item.productId === record.id);
                      if (alreadyInCart) return;
                      type === "quotes"
                        ? onLoadQuote(record)
                        : onSelect(record);
                    }}
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
                        <button
                          type="button"
                          disabled={cart.some(
                            (item) => item.productId === record.id,
                          )}
                          title={
                            cart.some((item) => item.productId === record.id)
                              ? "Este producto ya está en la factura; edita la cantidad en la tabla"
                              : undefined
                          }
                          onClick={() => onSelect(record)}
                        >
                          {cart.some((item) => item.productId === record.id) ? (
                            "En factura"
                          ) : (
                            <>
                              <Plus size={12} /> Agregar
                            </>
                          )}
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
      clients: ["Código", "Nombre", "Id. Fiscal", "Saldo"],
      products: ["Imagen", "Código", "Producto", "Existencia", "Precio"],
      warehouses: ["Código", "Nombre del depósito", "Estado"],
      invoices: ["Número", "Cliente", "Fecha", "Total", "Estado"],
      quotes: ["Número", "Cliente", "Vigente hasta", "Total", "Estado"],
    }[type] ?? ["Código", "Nombre"]
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
        <td>{formatCop(record.balance ?? 0)}</td>
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
        <td>
          {formatCop(
            grossFromNet(
              getDefaultPrice(record)?.price,
              record.taxRate,
            ),
          )}
        </td>
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
        <td>{formatCop(record.total)}</td>
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
      <td>{formatCop(record.total)}</td>
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
            <span>{clientName(quote.client)} · {quote.items?.length ?? 0} productos · {formatCop(quote.total)}</span>
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
  onTicket,
  onFulfill,
  warehouses = [],
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
          {isInvoice && (
            <>
              <div>
                <span>Vendedor</span>
                <strong>{document.sellerUsername ?? document.createdByUsername ?? "—"}</strong>
              </div>
              <div>
                <span>Cajero</span>
                <strong>{document.createdByUsername ?? "—"}</strong>
              </div>
            </>
          )}
          {isQuote && (
            <div>
              <span>Tipo</span>
              <strong>{document.kind === "PREVENTA" ? "Preventa" : "Cotización"}</strong>
            </div>
          )}
          <div>
            <span>Total</span>
            <strong>
              {formatCop(document.total ?? relatedInvoice?.total)}
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
                  {item.quantity} × {formatCop(
                    grossFromNet(item.unitPrice, item.taxRate ?? item.product?.taxRate),
                  )}
                </span>
                <strong>{formatCop(item.total)}</strong>
                {isQuote && document.kind === "PREVENTA" && (
                  <small className="sales-line-fulfillment">
                    {warehouseLabel(item.warehouseId, warehouses)} ·{" "}
                    {item.fulfillmentStatus === "SURTIDO"
                      ? "Surtido"
                      : item.fulfillmentStatus === "ATENDIDO"
                        ? "Atendido"
                        : "Pendiente"}
                    {onFulfill && item.fulfillmentStatus !== "SURTIDO" && (
                      <>
                        {" "}
                        <button type="button" onClick={() => onFulfill(document, item, "ATENDIDO")}>
                          Atender
                        </button>
                        <button type="button" onClick={() => onFulfill(document, item, "SURTIDO")}>
                          Surtido
                        </button>
                      </>
                    )}
                  </small>
                )}
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
          {isInvoice && onTicket && (
            <button type="button" onClick={() => onTicket(document)}>
              <Printer size={13} /> Ticket
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

function warehouseLabel(id, warehouses) {
  if (!id) return "Sin bodega";
  return warehouses.find((warehouse) => Number(warehouse.id) === Number(id))?.location ?? `Bodega #${id}`;
}

function printSalesDocument(record, type) {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    window.print();
    return;
  }

  const isQuote = type === "quote";
  const title = record.consecutive ?? (isQuote ? "Cotización" : "Factura");
  const rows = (record.items ?? [])
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.product?.name ?? `Producto #${item.productId}`)}</td>
        <td>${Number(item.quantity ?? 0)}</td>
        <td>${formatCop(grossFromNet(item.unitPrice, item.taxRate ?? item.product?.taxRate))}</td>
        <td>${formatCop(item.total)}</td>
      </tr>`,
    )
    .join("");

  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#0d0d0d;background:#ececec;font:13px Arial,sans-serif}
    .sheet{border:2px solid #2d2d2d;padding:22px;background:#fdfdfd}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:4px solid #2d2d2d;padding-bottom:14px;margin-bottom:18px}.brand{color:#111111;font-size:20px;font-weight:700}.type{text-align:right;color:#131313;font-size:17px;font-weight:700}.meta{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:18px}.meta div{padding:10px;background:#f5f5f5;border-left:4px solid #373737}.meta span{display:block;color:#161616;font-size:11px;margin-bottom:4px}.meta strong{font-size:13px}table{width:100%;border-collapse:collapse;margin-top:8px}th{padding:10px;text-align:left;color:#fff;background:#2f6aa6}td{padding:10px;border-bottom:1px solid #d5d5d5}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.totals{display:flex;justify-content:flex-end;margin-top:18px}.totals div{min-width:220px;padding:12px;background:#f4f4f4;border:1px solid #bbbbbb}.totals p{display:flex;justify-content:space-between;margin:5px 0}.totals .total{padding-top:9px;border-top:2px solid #2d2d2d;font-size:17px;font-weight:700;color:#111111}.foot{margin-top:24px;color:#3b3b3b;font-size:11px}
  </style></head><body><main class="sheet"><header class="head"><div class="brand">Mundo Tienda</div><div class="type">${isQuote ? "COTIZACIÓN" : "FACTURA"}<br><span>${escapeHtml(title)}</span></div></header><section class="meta"><div><span>Cliente</span><strong>${escapeHtml(clientName(record.client))}</strong></div><div><span>Fecha</span><strong>${escapeHtml(formatDate(record.createdAt))}</strong></div><div><span>Estado</span><strong>${escapeHtml(record.status ?? "ACTIVA")}</strong></div></section><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Este documento no tiene líneas.</td></tr>'}</tbody></table><section class="totals"><div><p>Subtotal <strong>${formatCop(record.subtotal)}</strong></p><p>Impuestos <strong>${formatCop(record.taxes)}</strong></p><p class="total">Total <strong>${formatCop(record.total)}</strong></p></div></section><p class="foot">Documento generado desde el módulo de ventas.</p></main></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activePrices(product) {
  return activeSalePrices(product);
}
function isQuantityDraft(value) {
  return /^\d*([.,]\d{0,3})?$/.test(String(value ?? ""));
}
function parseQuantityInput(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function getDefaultPrice(product) {
  return defaultSalePrice(product);
}
function getPriceForClient(product, client, priceLevel) {
  const effectivePriceLevel =
    priceLevel === undefined || priceLevel === null
      ? client?.priceLevel ?? 0
      : priceLevel;
  return salePriceForLevel(product, effectivePriceLevel);
}
function getExactPriceForLevel(product, priceLevel = "0") {
  return activeSalePrices(product).find(
    (price) => getCommercialPriceLevel(price) === Number(priceLevel),
  );
}
function getPriceById(product, id) {
  return salePriceById(product, id);
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
      const line = calculateLineTotals({
        unitPriceNet: cartUnitPriceNet(item, price),
        quantity: item.quantity,
        taxRate: item.product.taxRate,
      });
      totals.subtotal = roundMoney(totals.subtotal + line.subtotal);
      totals.taxes = roundMoney(totals.taxes + line.taxAmount);
      totals.total = roundMoney(totals.total + line.total);
      return totals;
    },
    { subtotal: 0, taxes: 0, total: 0 },
  );
}

function cartUnitPriceNet(item, catalogPrice) {
  if (hasAppliedUnitPrice(item.unitPriceGrossOverride)) {
    return netFromGross(Number(item.unitPriceGrossOverride), item.product?.taxRate);
  }
  if (hasAppliedUnitPrice(item.appliedUnitPrice)) return Number(item.appliedUnitPrice);
  return Number(catalogPrice?.price ?? 0);
}

function hasAppliedUnitPrice(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function canAccessReturns(session, permission) {
  return (
    session?.role === "ADMIN" ||
    Boolean(session?.permissions?.includes(permission))
  );
}

function canEditSalePrice(session) {
  return session?.role === "ADMIN" || session?.permissions?.includes("SALES_PRICE_OVERRIDE");
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
function hasCreditCapacity(client) {
  return Boolean(client?.hasCredit && Number(client.maxCredit) > 0);
}
function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO").format(new Date(value));
}
function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
