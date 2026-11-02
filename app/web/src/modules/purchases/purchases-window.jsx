import { Fragment, useEffect, useMemo, useState } from "react";
import { PriceUpdateDialog } from "@/components/pricing/price-update-dialog";
import {
  grossFromNet,
  marginPercent,
  netFromGross,
  priceForExactLevel,
} from "@/lib/commercial-pricing";
import { advanceFrom, handleEnterAdvance } from "@/lib/enter-advance";
import {
  Clock,
  ClipboardList,
  BarChart3,
  CalendarDays,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  LoaderCircle,
  PackageSearch,
  Plus,
  Printer,
  ScanText,
  Share2,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";
import { PurchaseTotalDialog } from "./purchase-total-dialog";
import { DraftsDialog, saveDraft } from "@/components/drafts/drafts-dialog";
import { downloadPdf } from "@/lib/simple-pdf";
import "./purchases-reports.css";

const viewLabels = {
  purchases: "Compras",
  orders: "Órdenes y recepción",
  quotes: "Cotizaciones",
  reports: "Reportes",
};

const statusLabels = {
  BORRADOR: "Borrador",
  ORDENADA: "Ordenada",
  RECIBIDA: "Recibida",
  ANULADA: "Anulada",
};

let purchasesDataPromise;
let purchasesDataSnapshot;
let pdfWorkerConfigured = false;

function configurePdfWorker() {
  if (pdfWorkerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  pdfWorkerConfigured = true;
}

function invalidatePurchasesDataCache() {
  purchasesDataPromise = undefined;
  purchasesDataSnapshot = undefined;
}

function loadPurchasesData() {
  if (purchasesDataSnapshot) {
    // Los precios se editan en Productos: nunca reutilizar productos en caché.
    return apiClient
      .getAllPages("/productos", { estado: "activos" })
      .then(
        (value) => ({
          ...purchasesDataSnapshot,
          productsResult: { status: "fulfilled", value },
        }),
        () => purchasesDataSnapshot,
      );
  }
  if (!purchasesDataPromise) {
    purchasesDataPromise = Promise.allSettled([
      apiClient.getAllPages("/proveedores", { estado: "activos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
      apiClient.getAllPages("/productos", { estado: "activos" }),
      apiClient.getAllPages("/tipos-producto", { estado: "activos" }),
      apiClient.getAllPages("/compras"),
    ]).then(
      ([providersResult, warehousesResult, productsResult, productTypesResult, ordersResult]) => {
        purchasesDataSnapshot = {
          providersResult,
          warehousesResult,
          productsResult,
          productTypesResult,
          ordersResult,
        };
        return purchasesDataSnapshot;
      },
    );
  }
  return purchasesDataPromise;
}

export function PurchasesWindow({
  initialView = "purchases",
  onClose,
  onOpenView,
  onRequestLogin,
}) {
  const [view, setView] = useState(
    ["purchases", "orders", "reports"].includes(initialView)
      ? initialView
      : "purchases",
  );
  const [providers, setProviders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [cart, setCart] = useState([]);
  const [lookupType, setLookupType] = useState(null);
  const [purchasePreview, setPurchasePreview] = useState(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [documentAttachment, setDocumentAttachment] = useState(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [lookupLoadingId, setLookupLoadingId] = useState("");
  const [priceDialog, setPriceDialog] = useState(null);
  const [totalOpen, setTotalOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    loadPurchasesData().then(
      ({ providersResult, warehousesResult, productsResult, productTypesResult, ordersResult }) => {
        if (cancelled) return;
        const nextProviders =
          providersResult.status === "fulfilled"
            ? providersResult.value.filter(isActive)
            : [];
        const nextWarehouses =
          warehousesResult.status === "fulfilled"
            ? warehousesResult.value.filter(isActive)
            : [];
        setProviders(nextProviders);
        setWarehouses(nextWarehouses);
        setProducts(
          productsResult.status === "fulfilled"
            ? productsResult.value.filter(isActive)
            : [],
        );
        setProductTypes(
          productTypesResult.status === "fulfilled" ? productTypesResult.value : [],
        );
        setOrders(
          ordersResult.status === "fulfilled" ? ordersResult.value : [],
        );
        setSelectedProviderId((current) =>
          current || String(nextProviders[0]?.id ?? ""),
        );
        setSelectedWarehouseId((current) =>
          current || String(nextWarehouses[0]?.id ?? ""),
        );

        const requiredFailure = [providersResult, warehousesResult].find(
          (result) => result.status === "rejected",
        );
        if (requiredFailure) {
          setError(
            `No se pudo cargar Compras: ${requiredFailure.reason?.message ?? "verifica la conexión con el sistema"}`,
          );
          if (isAuthError(requiredFailure.reason)) onRequestLogin?.();
        }
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onRequestLogin]);

  useEffect(() => {
    function handleShortcuts(event) {
      if (event.key === "Escape") {
        if (lookupType) setLookupType(null);
        return;
      }
      if (event.key === "F4") {
        event.preventDefault();
        startNewPurchase();
      } else if (event.key === "F1") {
        event.preventDefault();
        setLookupType("providers");
      } else if (event.key === "F2") {
        event.preventDefault();
        setLookupType("warehouses");
      } else if (event.key === "F5") {
        event.preventDefault();
        setLookupType("products");
      } else if (event.key === "F7") {
        event.preventDefault();
        setLookupType("orders");
      }
    }
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [lookupType]);

  const lastProductId = cart[cart.length - 1]?.productId;
  useEffect(() => {
    if (!lastProductId || editingPurchaseId) {
      setSuggestion(null);
      return undefined;
    }
    let cancelled = false;
    apiClient
      .get("/compras/proveedor-sugerido", { productId: lastProductId })
      .then((result) => {
        if (cancelled || !result?.providerId) {
          if (!cancelled) setSuggestion(null);
          return;
        }
        const product = cart.find((item) => String(item.productId) === String(lastProductId))?.product;
        setSuggestion({
          ...result,
          productName: product?.name ?? "el producto",
          alreadySelected: String(result.providerId) === String(selectedProviderId),
        });
      })
      .catch(() => !cancelled && setSuggestion(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastProductId, editingPurchaseId, selectedProviderId]);

  const selectedProvider = providers.find(
    (provider) => String(provider.id) === String(selectedProviderId),
  );
  const selectedWarehouse = warehouses.find(
    (warehouse) => String(warehouse.id) === String(selectedWarehouseId),
  );
  const cartTotals = useMemo(
    () => calculateCartTotals(cart, selectedProvider),
    [cart, selectedProvider],
  );
  const purchaseViews = [
    "purchases",
    "orders",
    "reports",
  ];
  const viewIndex = purchaseViews.indexOf(view);

  function moveView(offset) {
    const nextView = purchaseViews[viewIndex + offset];
    if (nextView) navigate(nextView);
  }

  function navigate(nextView) {
    setError("");
    setNotice("");
    if (nextView !== view) {
      onOpenView?.(nextView);
      return;
    }
    setView(nextView);
  }

  function startNewPurchase() {
    setView("purchases");
    setEditingPurchaseId("");
    setDraftId(null);
    setExternalReference("");
    setExpectedAt("");
    setCart([]);
    setDocumentAttachment(null);
    setError("");
    setNotice("");
  }

  async function refreshProducts() {
    try {
      const fresh = (await apiClient.getAllPages("/productos", { estado: "activos" })).filter(isActive);
      setProducts(fresh);
      // Las líneas ya cargadas conservan los precios editados en esta compra.
      setCart((current) =>
        current.map((item) => {
          const updated = fresh.find((product) => String(product.id) === String(item.productId));
          return updated ? { ...item, product: updated } : item;
        }),
      );
    } catch {
      // Se conserva la lista actual si no hay conexión.
    }
  }

  function openLookup(type) {
    setError("");
    setLookupType(type);
  }

  // Cualquier apertura de la consulta de productos (F5, Enter, botón) trae precios frescos.
  useEffect(() => {
    if (lookupType === "products") void refreshProducts();
  }, [lookupType]);

  async function selectLookupItem(item) {
    if (lookupType === "providers") setSelectedProviderId(String(item.id));
    if (lookupType === "warehouses") setSelectedWarehouseId(String(item.id));
    if (lookupType === "products") addProduct(item);
    if (lookupType === "orders") await loadOrderIntoEditor(item);
    setLookupType(null);
  }

  async function openPurchasePdf(order) {
    setError("");
    try {
      const detail = await apiClient.get(`/compras/${order.id}`);
      setPurchasePreview(detail);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    }
  }

  function applyOcrQuote(result) {
    startNewPurchase();
    if (result.documentAttachment) setDocumentAttachment(result.documentAttachment);
    const providerMatch = providers.find((provider) => {
      if (!result.supplier) return false;
      const providerText = normalizeOcrMatch(
        `${provider.name ?? ""} ${provider.legalName ?? ""} ${provider.businessName ?? ""} ${provider.taxId ?? ""}`,
      );
      const supplierText = normalizeOcrMatch(result.supplier);
      return (
        providerText.includes(supplierText) || supplierText.includes(providerText)
      );
    });
    if (providerMatch) setSelectedProviderId(String(providerMatch.id));
    if (result.documentNumber) setExternalReference(result.documentNumber);
    if (result.expectedAt) setExpectedAt(result.expectedAt);
    const matchedItems = [];
    const unmatchedItems = [];
    for (const parsedItem of result.items ?? []) {
      const product =
        products.find((item) => String(item.id) === String(parsedItem.productId)) ??
        findProductForOcrItem(parsedItem, products);
      if (!product) {
        unmatchedItems.push(parsedItem);
        continue;
      }
      const existing = matchedItems.find(
        (item) => String(item.productId) === String(product.id),
      );
      if (existing) {
        existing.quantity += parsedItem.quantity;
        continue;
      }
        matchedItems.push({
          productId: product.id,
          product,
          quantity: parsedItem.quantity > 0 ? parsedItem.quantity : 1,
          unit: normalizePurchaseUnit(
            parsedItem.unit ?? getDefaultPurchaseUnit(product),
          ),
          unitCost:
            parsedItem.unitCost > 0
              ? parsedItem.unitCost
              : defaultCostForUnit(product, getDefaultPurchaseUnit(product)),
      });
    }
    setCart(matchedItems);
    setOcrOpen(false);
    const productNotice = matchedItems.length
      ? `${matchedItems.length} producto(s) agregado(s)`
      : "no se encontraron productos coincidentes";
    const unmatchedNotice = unmatchedItems.length
      ? ` ${unmatchedItems.length} línea(s) requiere(n) revisión manual.`
      : "";
    setNotice(
      providerMatch
        ? `Cotización ${result.fileName} analizada: ${productNotice}.${unmatchedNotice}`
        : `Cotización ${result.fileName} analizada: ${productNotice}. Selecciona el proveedor.${unmatchedNotice}`,
    );
  }

  async function loadOrderIntoEditor(order) {
    setLookupLoadingId(String(order.id));
    setError("");
    try {
      const detail = await apiClient.get("/compras/" + order.id);
      setEditingPurchaseId(String(detail.id));
      setSelectedProviderId(
        String(detail.providerId ?? detail.provider?.id ?? ""),
      );
      setSelectedWarehouseId(
        String(detail.warehouseId ?? detail.warehouse?.id ?? ""),
      );
      setExternalReference(detail.externalReference ?? "");
      setExpectedAt(toDateInputValue(detail.expectedAt));
      setDocumentAttachment(
        detail.documentData
          ? {
              name: detail.documentName,
              mimeType: detail.documentMimeType,
              data: detail.documentData,
            }
          : null,
      );
      setCart(
        (detail.items ?? []).map((item) => ({
          productId: item.productId,
          product: item.product,
          quantity: Number(item.quantity ?? 1),
          unit: normalizePurchaseUnit(
            item.unit ?? getDefaultPurchaseUnit(item.product),
          ),
          unitCost: Number(item.unitCost ?? 0),
        })),
      );
      setView("purchases");
      setNotice("Compra " + orderNumber(detail) + " cargada para editar.");
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setLookupLoadingId("");
    }
  }

  function addProduct(product) {
    const existing = cart.find(
      (item) => String(item.productId) === String(product.id),
    );
    if (existing) {
      updateCartItem(product.id, "quantity", Number(existing.quantity) + 1);
      return;
    }
    setCart((current) => [
      ...current,
      {
        productId: product.id,
        product,
        quantity: 1,
        unit: getDefaultPurchaseUnit(product),
        unitCost: defaultCostForUnit(product, getDefaultPurchaseUnit(product)),
      },
    ]);
    setNotice(`${productName(product)} agregado a la tabla.`);
  }

  async function createProductFromPurchase(draft) {
    if (!selectedProviderId || !selectedWarehouseId) {
      throw new Error("Selecciona proveedor y depósito antes de crear el producto.");
    }
    const created = await apiClient.post("/productos", {
      productTypeId: Number(draft.productTypeId),
      providerId: Number(selectedProviderId),
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      taxRate: Number(draft.taxRate) || 0,
      unit: draft.unit,
      brand: draft.brand.trim(),
      minimumStock: Number(draft.minimumStock) || 0,
      maximumStock: draft.maximumStock === "" ? undefined : Number(draft.maximumStock),
      warehouses: [{ warehouseId: Number(selectedWarehouseId), quantity: 0 }],
      prices: [{
        name: draft.priceName.trim() || "Precio minorista",
        price: Number(draft.price),
        unit: draft.unit,
        quantity: 1,
        isDefault: true,
      }],
      ...(draft.barcode.trim()
        ? { barcodes: [{ code: draft.barcode.trim(), isPrimary: true }] }
        : {}),
      ...(Number(draft.unitsPerPackage) > 0 || Number(draft.packagesPerBox) > 0
        ? {
            packaging: {
              unitsPerPackage: Number(draft.unitsPerPackage) || undefined,
              packagesPerBox: Number(draft.packagesPerBox) || undefined,
            },
          }
        : {}),
    });
    setProducts((current) => [...current, created]);
    addProduct(created);
    setQuickProductOpen(false);
    setNotice(`${productName(created)} creado y agregado a la compra.`);
  }

  function updateCartItem(productId, field, value) {
    setCart((current) =>
      current.map((item) =>
        String(item.productId) === String(productId)
          ? { ...item, [field]: value }
          : item,
      ),
    );
  }

  function removeCartItem(productId) {
    setCart((current) =>
      current.filter((item) => String(item.productId) !== String(productId)),
    );
  }

  function updatePriceEdit(productId, level, gross) {
    setCart((current) =>
      current.map((item) => {
        if (String(item.productId) !== String(productId)) return item;
        const edits = { ...(item.priceEdits ?? {}) };
        const catalog = priceForExactLevel(item.product, level);
        const catalogGross = catalog
          ? grossFromNet(Number(catalog.price), item.product?.taxRate)
          : 0;
        if (gross > 0 && Math.abs(gross - catalogGross) >= 0.005) {
          edits[level] = gross;
        } else {
          delete edits[level];
        }
        return { ...item, priceEdits: edits };
      }),
    );
  }

  function openPriceDialog(productId, element) {
    setPriceDialog({ productId, element: element ?? null });
  }

  function closePriceDialog(changes, newCost) {
    const current = priceDialog;
    setPriceDialog(null);
    if (!current) return;
    setCart((items) =>
      items.map((item) => {
        if (String(item.productId) !== String(current.productId)) return item;
        const edits = { ...(item.priceEdits ?? {}) };
        Object.entries(changes ?? {}).forEach(([rawLevel, gross]) => {
          const level = Number(rawLevel);
          const catalog = priceForExactLevel(item.product, level);
          const catalogGross = catalog
            ? grossFromNet(Number(catalog.price), item.product?.taxRate)
            : 0;
          if (gross > 0 && Math.abs(gross - catalogGross) >= 0.005) {
            edits[level] = gross;
          } else {
            delete edits[level];
          }
        });
        return {
          ...item,
          ...(newCost > 0 ? { unitCost: newCost } : {}),
          priceEdits: edits,
        };
      }),
    );
    // El foco vuelve al campo de costo y pasa al siguiente recuadro.
    setTimeout(() => {
      if (current.element?.isConnected) {
        advanceFrom(current.element, {
          onLast: () => setLookupType("products"),
        });
      }
    }, 0);
  }

  async function applyPriceEdits(items) {
    const requests = items.flatMap((item) => {
      const taxRate = item.product?.taxRate;
      return Object.entries(item.priceEdits ?? {})
        .map(([rawLevel, gross]) => {
          const level = Number(rawLevel);
          const net = netFromGross(Number(gross), taxRate);
          if (!(net > 0)) return null;
          const catalog = priceForExactLevel(item.product, level);
          return { item, level, net, catalog };
        })
        .filter(Boolean);
    });

    const results = await Promise.all(
      requests.map(async ({ item, level, net, catalog }) => {
        try {
          if (catalog) {
            await apiClient.patch(`/precios-producto/${catalog.id}`, {
              price: net,
              reason: "Actualización desde compra",
            });
          } else {
            await apiClient.post(`/productos/${item.productId}/precios`, {
              name: `Precio ${level}`,
              priceLevel: level,
              price: net,
              unit: item.product?.unit ?? "UND",
              quantity: 1,
            });
          }
          return null;
        } catch (priceError) {
          return `${productName(item.product)} (Precio ${level}): ${priceError.message}`;
        }
      }),
    );
    return results.filter(Boolean);
  }

  async function savePurchase() {
    if (view !== "purchases") {
      setNotice(
        "Esta ventana conserva la misma tabla para consultar o preparar la operación.",
      );
      return;
    }
    if (!selectedProviderId || !selectedWarehouseId || !cart.length) {
      setError(
        "Selecciona proveedor, depósito y al menos un producto en la tabla.",
      );
      return;
    }
    const invalidItem = cart.find(
      (item) => Number(item.quantity) <= 0 || Number(item.unitCost) <= 0,
    );
    if (invalidItem) {
      setError("Cada producto debe tener cantidad y costo mayor que cero.");
      return;
    }
    setError("");
    setNotice("");
    setTotalOpen(true);
  }

  async function holdPurchase() {
    if (saving) return;
    if (!selectedProviderId || !selectedWarehouseId || !cart.length) {
      setError("Selecciona proveedor, depósito y al menos un producto antes de guardar en espera.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveDraft({
        id: draftId,
        kind: "COMPRA",
        title: `${selectedProvider?.name ?? "Compra"} · ${cart.length} renglón(es)`,
        payload: {
          providerId: selectedProviderId,
          warehouseId: selectedWarehouseId,
          externalReference,
          expectedAt,
          documentAttachment,
          cart,
        },
      });
      startNewPurchase();
      setNotice("Compra guardada en espera. Pulsa Borradores para verla y Retomar para continuar.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function resumePurchase(draft) {
    const data = draft.payload ?? {};
    setView("purchases");
    setSelectedProviderId(String(data.providerId ?? ""));
    setSelectedWarehouseId(String(data.warehouseId ?? ""));
    setExternalReference(data.externalReference ?? "");
    setExpectedAt(data.expectedAt ?? "");
    setDocumentAttachment(data.documentAttachment ?? null);
    setCart(data.cart ?? []);
    setEditingPurchaseId("");
    setDraftId(draft.id);
    setDraftsOpen(false);
    setNotice("Borrador cargado.");
  }

  async function confirmPurchase(result) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = {
       providerId: numberOrValue(selectedProviderId),
       warehouseId: numberOrValue(selectedWarehouseId),
        externalReference: editingPurchaseId
          ? externalReference.trim() || null
          : externalReference.trim() || undefined,
        expectedAt: editingPurchaseId
          ? expectedAt
            ? new Date(expectedAt + "T00:00:00").toISOString()
            : null
          : expectedAt
            ? new Date(expectedAt + "T00:00:00").toISOString()
            : undefined,
        ...(documentAttachment
          ? {
              documentName: documentAttachment.name,
              documentMimeType: documentAttachment.mimeType,
              documentData: documentAttachment.data,
            }
          : {}),
        ...(editingPurchaseId
          ? {}
          : { orderedAt: new Date().toISOString() }),
       items: cart.map((item) => ({
         productId: numberOrValue(item.productId),
         quantity: Number(item.quantity),
         unit: item.unit,
         unitCost: Number(item.unitCost),
       })),
        discount1Percent: result.discount1Percent,
        discount2Percent: result.discount2Percent,
        freight: result.freight,
        retentionBase: result.retentionBase,
        retentionBaseEdited: result.retentionBaseEdited,
        retentionBaseReason: result.retentionBaseReason,
        retentionRate: result.retentionRate,
        paymentCondition: result.paymentCondition,
        invoiceDate: result.invoiceDate,
        dueDate: result.dueDate,
        operationType: result.operationType,
        purchaseOrderRef: result.purchaseOrderRef,
        ...(result.notes ? { notes: result.notes } : {}),
      };
      let saved = editingPurchaseId
        ? await apiClient.patch("/compras/" + editingPurchaseId, body)
        : await apiClient.post("/compras", body);
      // Las compras solo registran pagos contra una cuenta bancaria/caja.
      const paidNow = Number(result.pay?.cash) || 0;
      const priceUpdatePromise = result.savePrices
        ? applyPriceEdits(
            cart.filter((item) => Object.keys(item.priceEdits ?? {}).length),
          )
        : Promise.resolve([]);
      if (paidNow > 0) {
        if (saved.status === "BORRADOR") saved = await apiClient.post(`/compras/${saved.id}/ordenar`, {});
        if (saved.status === "ORDENADA") saved = await apiClient.post(`/compras/${saved.id}/recibir`, {});
        await apiClient.post(`/compras/${saved.id}/pagos`, {
          amount: paidNow,
          bankAccountId: result.pay.accountId,
          notes: `Efectivo ${paidNow}`,
        });
      }
      if (draftId) {
        apiClient.delete(`/borradores/${draftId}`).catch(() => {});
        setDraftId(null);
      }
      setOrders((current) =>
        editingPurchaseId
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      );
      const priceFailures = await priceUpdatePromise;
      if (result.savePrices) {
        window.dispatchEvent(
          new CustomEvent("catalog:changed", {
            detail: {
              productIds: cart
                .filter((item) => Object.keys(item.priceEdits ?? {}).length)
                .map((item) => item.productId),
            },
          }),
        );
      }
      setTotalOpen(false);
      invalidatePurchasesDataCache();
     setCart([]);
      setNotice(
        "Compra " +
          orderNumber(saved) +
          (editingPurchaseId ? " actualizada" : " guardada") +
          " correctamente." +
          (priceFailures.length
            ? ` No se pudieron actualizar precios: ${priceFailures.join("; ")}`
            : ""),
      );
      setEditingPurchaseId("");
      setExternalReference("");
      setExpectedAt("");
      setDocumentAttachment(null);
   } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  async function transitionOrder(order, action) {
   if (action === "anular" && !window.confirm("¿Anular esta compra?")) return;
   setSaving(true);
    setError("");
    setNotice("");
   try {
      const saved =
        action === "anular"
          ? await apiClient.patch(`/compras/${order.id}/anular`, {})
          : await apiClient.post(`/compras/${order.id}/${action}`, {});
     setOrders((current) =>
       current.map((item) => (item.id === saved.id ? saved : item)),
     );
      invalidatePurchasesDataCache();
     setNotice(
        `La compra ${orderNumber(saved)} ahora está ${statusLabels[saved.status] ?? saved.status}.`,
      );
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
    }
  }

  const activeOrder = orders[0] ?? null;

  return (
    <section
      className={`provider-window purchases-window purchases-window-${view} ${isDragging ? "is-dragging" : ""}`}
      aria-label={`Ventana de ${viewLabels[view] ?? "Compras"}`}
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle purchase-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <ClipboardList size={14} />
        </div>
        <span>MÓDULO DE COMPRAS</span>
        <strong>{(viewLabels[view] ?? "Compras").toUpperCase()}</strong>
        <span className="purchase-mode-label">MODO: NORMAL</span>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar Compras"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>

      <div className="provider-content purchase-content">
        {loading ? (
          <div className="module-loading">Cargando información de compras…</div>
        ) : view === "purchases" ? (
          <PurchaseDocumentPanel
            view={view}
            selectedProvider={selectedProvider}
            selectedWarehouse={selectedWarehouse}
            selectedProviderId={selectedProviderId}
            selectedWarehouseId={selectedWarehouseId}
            cart={cart}
            totals={{ ...cartTotals, number: externalReference }}
            saving={saving}
            editingPurchaseId={editingPurchaseId}
            externalReference={externalReference}
            expectedAt={expectedAt}
            onProviderChange={setSelectedProviderId}
            onWarehouseChange={setSelectedWarehouseId}
            onOpenLookup={openLookup}
            onExternalReferenceChange={setExternalReference}
            onExpectedAtChange={setExpectedAt}
            onNewPurchase={startNewPurchase}
            onImportQuote={() => setOcrOpen(true)}
            onCreateProduct={() => setQuickProductOpen(true)}
            documentAttachment={documentAttachment}
            onDocumentChange={async (file) => {
              if (!file) {
                setDocumentAttachment(null);
                return;
              }
              try {
                setDocumentAttachment({
                  name: file.name,
                  mimeType: file.type || "application/octet-stream",
                  data: await readFileAsDataUrl(file),
                });
                setNotice(`Documento ${file.name} listo para conservar con la compra.`);
              } catch (requestError) {
                setError(requestError.message);
              }
            }}
            onUpdateItem={updateCartItem}
            onUpdatePriceEdit={updatePriceEdit}
            onOpenPriceDialog={openPriceDialog}
            onRemoveItem={removeCartItem}
            onSave={savePurchase}
            onHold={holdPurchase}
            onDrafts={() => setDraftsOpen(true)}
            suggestion={suggestion}
          />
       ) : view === "orders" ? (
          <PurchaseOrdersPanel
            orders={orders}
            activeOrder={activeOrder}
            onOpenLookup={openLookup}
            onViewPdf={openPurchasePdf}
            onOpenView={navigate}
            onTransition={transitionOrder}
            onNotice={setNotice}
            saving={saving}
          />
        ) : view === "reports" ? (
          <PurchaseReportsPanel
            orders={orders}
            providers={providers}
            warehouses={warehouses}
            onViewPdf={openPurchasePdf}
          />
        ) : (
          <div className="module-loading">Selecciona una operación de compras.</div>
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

      {totalOpen && (
        <PurchaseTotalDialog
          totals={cartTotals}
          provider={selectedProvider}
          initialReference={externalReference}
          hasPriceEdits={cart.some((item) => Object.keys(item.priceEdits ?? {}).length)}
          editing={Boolean(editingPurchaseId)}
          saving={saving}
          error={error}
          onAccept={confirmPurchase}
          onCancel={() => setTotalOpen(false)}
        />
      )}
      {draftsOpen && (
        <DraftsDialog kind="COMPRA" onLoad={resumePurchase} onClose={() => setDraftsOpen(false)} />
      )}
      {lookupType && (
        <PurchaseLookupDialog
          type={lookupType}
          providers={providers}
          warehouses={warehouses}
         products={products}
         orders={orders}
          loadingId={lookupLoadingId}
         onSelect={selectLookupItem}
         onViewPdf={openPurchasePdf}
         onClose={() => setLookupType(null)}
       />
     )}
      {priceDialog &&
        (() => {
          const item = cart.find(
            (entry) => String(entry.productId) === String(priceDialog.productId),
          );
          return item ? (
            <PriceUpdateDialog
              product={item.product}
              previousCost={defaultCostForUnit(item.product, item.unit)}
              newCost={Number(item.unitCost) || 0}
              pendingPrices={item.priceEdits}
              onAccept={closePriceDialog}
              onCancel={() => closePriceDialog(null)}
            />
          ) : null;
        })()}
      {purchasePreview && (
        <PurchasePdfPreview
          order={purchasePreview}
          onClose={() => setPurchasePreview(null)}
        />
      )}
      {ocrOpen && (
        <PurchaseQuoteImportDialog
          products={products}
          onApply={applyOcrQuote}
          onClose={() => setOcrOpen(false)}
        />
      )}
      {quickProductOpen && (
        <QuickPurchaseProductDialog
          productTypes={productTypes}
          provider={selectedProvider}
          warehouse={selectedWarehouse}
          onSave={createProductFromPurchase}
          onClose={() => setQuickProductOpen(false)}
        />
      )}
      <footer className="provider-window-footer purchase-window-footer">
        <span className="purchase-footer-caption">
          Módulo de Compras · {viewLabels[view]} · {orders.length} operación(es)
        </span>
        <div className="provider-navigation-actions">
          <button
            type="button"
            disabled={viewIndex <= 0}
            onClick={() => moveView(-1)}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={viewIndex < 0 || viewIndex >= purchaseViews.length - 1}
            onClick={() => moveView(1)}
          >
            Próximo
          </button>
          <button type="button" className="exit-action" onClick={onClose}>
            Salir
          </button>
        </div>
      </footer>
    </section>
  );
}

function PurchaseDocumentPanel({
  view,
  selectedProvider,
  selectedWarehouse,
  selectedProviderId,
  selectedWarehouseId,
  cart,
  totals,
  saving,
  editingPurchaseId,
  externalReference,
  expectedAt,
  onProviderChange,
  onWarehouseChange,
  onOpenLookup,
  onExternalReferenceChange,
  onExpectedAtChange,
  onNewPurchase,
  onImportQuote,
  onCreateProduct,
  documentAttachment,
  onDocumentChange,
  onUpdateItem,
  onUpdatePriceEdit,
  onOpenPriceDialog,
  onRemoveItem,
  onSave,
  onHold,
  onDrafts,
  suggestion,
}) {
  const isOrder = view === "orders";
  const [activeItemId, setActiveItemId] = useState(null);
  const [infoItemId, setInfoItemId] = useState(null);
  const activeItem =
    cart.find((item) => String(item.productId) === String(activeItemId)) ??
    cart[cart.length - 1] ??
    null;
  const infoItem = cart.find((item) => String(item.productId) === String(infoItemId)) ?? null;
  const rows = Math.max(15, cart.length + 5);
  const columnCount = isOrder ? 12 : 11;
  return (
    <div
      className="purchase-document-shell"
      data-enter-scope
      onKeyDown={(event) => {
        if (
          ["F1", "F2"].includes(event.key) &&
          event.target.closest?.(".purchase-table")
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (!activeItem) return;
          if (event.key === "F1") setInfoItemId(activeItem.productId);
          if (event.key === "F2") onOpenPriceDialog(activeItem.productId, null);
          return;
        }
        handleEnterAdvance(event, {
          // Tras el último recuadro se abre la consulta de productos (siguiente renglón).
          onLast: () => onOpenLookup("products"),
        });
      }}
    >
      <div className="purchase-document-top">
        <div className="purchase-document-fields">
          <div className="purchase-field-row">
            <label htmlFor="purchase-provider">Proveedor</label>
            <input
              id="purchase-provider"
              value={selectedProviderId}
              onChange={(event) => onProviderChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "F1") {
                  event.preventDefault();
                  onOpenLookup("providers");
                }
              }}
            />
            <button
              type="button"
              className="field-shortcut"
              onClick={() => onOpenLookup("providers")}
            >
              F1
            </button>
            <output className="purchase-description">
              {selectedProvider?.name ?? ""}
            </output>
          </div>
          <div className="purchase-field-row">
            <label htmlFor="purchase-warehouse">Depósito</label>
            <input
              id="purchase-warehouse"
              value={selectedWarehouseId}
              onChange={(event) => onWarehouseChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "F2") {
                  event.preventDefault();
                  onOpenLookup("warehouses");
                }
              }}
            />
            <button
              type="button"
              className="field-shortcut"
              onClick={() => onOpenLookup("warehouses")}
            >
              F2
            </button>
            <output
              className="purchase-description purchase-warehouse-description"
              title={warehouseName(selectedWarehouse)}
            >
              {warehouseName(selectedWarehouse)}
            </output>
          </div>
          {!isOrder && (
            <div className="purchase-field-row">
              <label htmlFor="purchase-document">Documento compra</label>
              <input
                id="purchase-document"
                className="purchase-document-input"
                value={externalReference}
                onChange={(event) => onExternalReferenceChange(event.target.value)}
                placeholder="Número del documento"
              />
            </div>
          )}
          <div className="purchase-field-row">
            <label htmlFor="purchase-expected-at">Entrega prevista del proveedor</label>
            <input
              id="purchase-expected-at"
              type="date"
              value={expectedAt}
              onChange={(event) => onExpectedAtChange(event.target.value)}
            />
          </div>
        </div>
        <div className="purchase-brand-mark" aria-label="Mundo Tienda">
          mundo <small>tienda</small>
        </div>
        <PurchaseTotalsPanel title={viewLabels[view]} totals={totals} />
      </div>
      {suggestion && (
        <p className="purchase-suggestion" role="status">
          Proveedor sugerido para {suggestion.productName}: <strong>{suggestion.name}</strong>{" "}
          ({suggestion.source === "HISTORIAL" ? "último proveedor de compra" : suggestion.source === "MARCA" ? "proveedor de la marca" : "proveedor principal"}).
          {suggestion.alreadySelected ? "" : " Cámbialo con F1 si aplica."}
        </p>
      )}

      <div className="purchase-shortcuts">
        <button
          type="button"
          className="purchase-shortcut purchase-shortcut-new"
          onClick={onNewPurchase}
        >
          <ClipboardList size={13} /> F4 Nueva compra
        </button>
        <button
          type="button"
          className="purchase-shortcut purchase-shortcut-products"
          onClick={() => onOpenLookup("products")}
        >
          <PackageSearch size={13} /> F5 Productos
        </button>
        <button
          type="button"
          className="purchase-shortcut purchase-shortcut-new-product"
          onClick={onCreateProduct}
        >
          <Plus size={13} /> Nuevo producto
        </button>
        <button type="button" className="purchase-shortcut" onClick={onHold} disabled={saving} title="Guardar esta compra sin confirmarla">
          <Clock size={13} /> Guardar en espera
        </button>
        <button type="button" className="purchase-shortcut" onClick={onDrafts}>
          <FileText size={13} /> Borradores
        </button>
        <button
          type="button"
          className="purchase-shortcut purchase-shortcut-load"
          onClick={() => onOpenLookup("orders")}
        >
          <FileText size={13} /> F7 Cargar
        </button>
        <button
          type="button"
          className="purchase-shortcut purchase-shortcut-ocr"
          onClick={onImportQuote}
        >
          <ScanText size={13} /> Escanear factura
        </button>
        <label className="purchase-shortcut purchase-shortcut-document">
          <Upload size={13} /> {documentAttachment ? "Documento listo" : "Adjuntar documento"}
          <input
            type="file"
            accept="application/pdf,image/*"
            hidden
            onChange={(event) => onDocumentChange?.(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div className="purchase-table-wrap">
        <table className="purchase-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              {isOrder && <th>Existencia</th>}
              <th>Cantidad</th>
              <th>Und</th>
              <th>Costo</th>
              <th>Precio 0</th>
              <th>Precio 1</th>
              <th>Precio 2</th>
              <th>Precio 3</th>
              <th>Total</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {cart.map((item) => (
              <tr key={item.productId} onFocusCapture={() => setActiveItemId(item.productId)}>
                <td>{productCode(item.product)}</td>
                <td className="purchase-product-description">
                  {productName(item.product)}
                </td>
                {isOrder && (
                  <td className="number-cell">{productStock(item.product)}</td>
                )}
                <td>
                  <input
                    className="table-number-input"
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) =>
                      onUpdateItem(
                        item.productId,
                        "quantity",
                        event.target.value,
                      )
                    }
                  />
                </td>
                <td>
                  <select
                    className="purchase-unit-select"
                    aria-label={`Unidad de compra de ${productName(item.product)}`}
                    value={getPurchaseUnitOptions(item.product).includes(item.unit) ? item.unit : getPurchaseUnitOptions(item.product)[0]}
                    onChange={(event) =>
                      onUpdateItem(item.productId, "unit", event.target.value)
                    }
                  >
                    {getPurchaseUnitOptions(item.product).map((unit) => (
                      <option value={unit} key={unit}>
                        {purchaseUnitLabel(unit)}
                      </option>
                    ))}
                  </select>
                  <small className="purchase-unit-preview">
                    = {formatQuantity(convertPurchaseQuantityToBase(item.quantity, item.unit, item.product))} UND
                  </small>
                </td>
                <td>
                  <input
                    className="table-number-input table-cost-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitCost}
                    onChange={(event) =>
                      onUpdateItem(
                        item.productId,
                        "unitCost",
                        event.target.value,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      const previous = defaultCostForUnit(item.product, item.unit);
                      // Costo distinto del anterior: primero se revisan los precios.
                      if (
                        Number(item.unitCost) > 0 &&
                        Math.abs(Number(item.unitCost) - previous) >= 0.005
                      ) {
                        event.preventDefault();
                        onOpenPriceDialog(item.productId, event.target);
                      }
                    }}
                  />
                </td>
                {[0, 1, 2, 3].map((level) => (
                  <PurchasePriceCell
                    key={level}
                    item={item}
                    level={level}
                    onChange={onUpdatePriceEdit}
                  />
                ))}
                <td className="number-cell">
                  {formatCurrency(lineTotal(item))}
                </td>
                <td>
                  <button
                    type="button"
                    className="row-prices"
                    tabIndex={-1}
                    title="Revisar precios y utilidad"
                    aria-label={`Precios de ${productName(item.product)}`}
                    onClick={() => onOpenPriceDialog(item.productId, null)}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    className="row-remove"
                    aria-label={`Quitar ${productName(item.product)}`}
                    onClick={() => onRemoveItem(item.productId)}
                  >
                    <X size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, rows - cart.length) }).map(
              (_, index) => (
                <tr
                  className="empty-row"
                  key={`empty-${index}`}
                  onClick={() => onOpenLookup("products")}
                  title="Haga clic para consultar productos"
                >
                  <td colSpan={columnCount}>&nbsp;</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <div className="purchase-document-footer">
        <button
          type="button"
          className="purchase-save-button"
          disabled={saving}
          onClick={onSave}
        >
          {saving
            ? "Guardando…"
            : editingPurchaseId
              ? "Actualizar compra"
              : "Guardar compra"}
        </button>
      </div>
      {infoItem && (
        <div className="module-dialog-backdrop">
          <section className="module-dialog purchase-info-dialog" role="dialog" aria-modal="true">
            <header className="module-dialog-titlebar">
              <strong>INFORMACIÓN DEL PRODUCTO</strong>
              <button type="button" aria-label="Cerrar" onClick={() => setInfoItemId(null)}>
                <X size={17} />
              </button>
            </header>
            <dl className="purchase-info-list">
              <dt>Código</dt><dd>{productCode(infoItem.product)}</dd>
              <dt>Descripción</dt><dd>{productName(infoItem.product)}</dd>
              <dt>IVA</dt><dd>{formatQuantity(infoItem.product?.taxRate ?? 0)} %</dd>
              <dt>Existencia</dt><dd>{formatQuantity(productStock(infoItem.product))}</dd>
              <dt>Costo anterior</dt>
              <dd>{formatCurrency(defaultCostForUnit(infoItem.product, infoItem.unit))}</dd>
              {[0, 1, 2, 3].map((level) => (
                <Fragment key={level}>
                  <dt>Precio {level}</dt>
                  <dd>{formatCurrency(levelGross(infoItem, level))}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

function levelGross(item, level) {
  const pending = Number(item.priceEdits?.[level] ?? 0);
  if (pending > 0) return pending;
  const catalog = priceForExactLevel(item.product, level);
  return catalog ? grossFromNet(Number(catalog.price), item.product?.taxRate) : 0;
}

function PurchaseTotalsPanel({ title, totals }) {
  // Panel de totales como la captura C23 de Saint: Compra · N° · Total cantidad o pieza ·
  // Total renglones · Impuestos · Total.
  const hasRetention = totals.retentionAmount > 0;
  return (
    <aside className="purchase-totals-panel">
      <h2>{title === "Compras" ? "Compra" : title}</h2>
      <div className="purchase-number-row">
        <span>N°</span>
        <strong>{totals.number ?? ""}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Total cantidad o pieza</span>
        <strong>{totals.quantity}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Total renglones</span>
        <strong>{formatCurrency(totals.lines)}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Impuestos</span>
        <strong>{formatCurrency(totals.taxes)}</strong>
      </div>
      <div className="purchase-number-row purchase-grand-total">
        <span>Total</span>
        <strong>{formatCurrency(totals.total)}</strong>
      </div>
      {hasRetention && (
        <>
          <div className="purchase-number-row">
            <span>Retención ({formatQuantity(totals.retentionRate)}%)</span>
            <strong>-{formatCurrency(totals.retentionAmount)}</strong>
          </div>
          <div className="purchase-number-row">
            <span>Total a pagar</span>
            <strong>{formatCurrency(totals.payableTotal ?? totals.total)}</strong>
          </div>
        </>
      )}
    </aside>
  );
}

// Precio de venta (IVA incluido) editable en la misma línea de la compra,
// con la utilidad calculada contra el costo unitario actual.
function PurchasePriceCell({ item, level, onChange }) {
  const taxRate = item.product?.taxRate;
  const pending = Number(item.priceEdits?.[level] ?? 0);
  const catalog = priceForExactLevel(item.product, level);
  const gross =
    pending > 0
      ? pending
      : catalog
        ? grossFromNet(Number(catalog.price), taxRate)
        : 0;
  const [draft, setDraft] = useState(gross > 0 ? String(gross) : "");
  useEffect(() => {
    setDraft(gross > 0 ? String(gross) : "");
  }, [gross]);
  const margin =
    gross > 0
      ? marginPercent(
          netFromGross(Number(item.unitCost) || 0, taxRate),
          netFromGross(gross, taxRate),
        )
      : null;

  function commit() {
    const parsed = Number(String(draft).trim().replace(",", "."));
    if (!draft.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setDraft(gross > 0 ? String(gross) : "");
      return;
    }
    onChange(item.productId, level, Math.round(parsed * 100) / 100);
  }

  return (
    <td className={`number-cell purchase-price-cell ${pending > 0 ? "is-edited" : ""}`}>
      <input
        className="table-number-input"
        inputMode="decimal"
        value={draft}
        placeholder="—"
        aria-label={`Precio ${level} con IVA de ${productName(item.product)}`}
        onChange={(event) => {
          if (/^\d*([.,]\d{0,2})?$/.test(event.target.value)) setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      <small className="purchase-price-margin">
        {margin === null ? "sin precio" : `${margin}% util.`}
      </small>
    </td>
  );
}

function PurchaseOrdersPanel({
  orders,
  activeOrder,
  onOpenLookup,
  onViewPdf,
  onOpenView,
  onTransition,
  saving,
}) {
  const [search, setSearch] = useState("");
  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) =>
      `${orderNumber(order)} ${order.provider?.name ?? ""} ${order.status ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [orders, search]);
  return (
    <div className="purchase-list-shell">
      <div className="purchase-list-heading">
        <div>
          <span className="purchase-section-kicker">MÓDULO DE COMPRAS</span>
          <h2>ÓRDENES Y RECEPCIÓN</h2>
        </div>
        <div className="purchase-list-actions">
          <button type="button" onClick={() => onOpenView("purchases")}>
            <Plus size={14} /> Nueva compra
          </button>
          <button type="button" onClick={() => onOpenLookup("orders")}>
            <Search size={14} /> F6 Cargar
          </button>
        </div>
      </div>
      <div className="purchase-orders-toolbar">
        <label htmlFor="purchase-order-search">Buscar</label>
        <div className="purchase-search">
          <Search size={14} />
          <input
            id="purchase-order-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número, proveedor o estado"
          />
        </div>
        <span>{filteredOrders.length} registros</span>
      </div>
      <div className="purchase-table-wrap purchase-orders-table-wrap">
        <table className="purchase-table purchase-orders-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Proveedor</th>
              <th>Depósito</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr
                key={order.id}
                className={activeOrder?.id === order.id ? "is-selected" : ""}
              >
                <td>{orderNumber(order)}</td>
                <td>{order.provider?.name ?? order.providerName ?? "—"}</td>
                <td>
                  {warehouseName(order.warehouse)}
                </td>
                <td>{formatDate(order.orderedAt ?? order.createdAt)}</td>
                <td className="number-cell">{formatCurrency(order.total)}</td>
                <td>
                  <span
                    className={`purchase-status status-${String(order.status ?? "").toLowerCase()}`}
                  >
                    {statusLabels[order.status] ?? order.status ?? "Borrador"}
                  </span>
                </td>
                <td className="purchase-row-actions">
                  <button
                    type="button"
                    className="purchase-action-pdf"
                    disabled={saving}
                    onClick={() => onViewPdf?.(order)}
                  >
                    <Eye size={12} /> Ver PDF
                  </button>
                  {order.status === "BORRADOR" && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onTransition(order, "ordenar")}
                    >
                      {saving ? "Guardando…" : "Ordenar"}
                    </button>
                  )}
                  {order.status === "ORDENADA" && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onTransition(order, "recibir")}
                    >
                      {saving ? "Guardando…" : "Recibir"}
                    </button>
                  )}
                  {!["RECIBIDA", "ANULADA"].includes(order.status) && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onTransition(order, "anular")}
                    >
                      {saving ? "Guardando…" : "Anular"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filteredOrders.length && (
              <tr className="empty-list-row">
                <td colSpan="7">No hay compras para mostrar.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="purchase-list-footnote">
        F1/F2 proveedor · F5 productos · F6 cargar · doble clic en la operación
        para consultar su detalle
      </div>
    </div>
  );
}

function PurchaseReportsPanel({ orders, providers = [], warehouses = [], onViewPdf }) {
  const [period, setPeriod] = useState("30D");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("ALL");
  const [providerId, setProviderId] = useState("ALL");
  const [warehouseId, setWarehouseId] = useState("ALL");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const range = useMemo(() => purchaseReportRange(period, from, to), [from, period, to]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const providerMatches = providerId === "ALL" || String(order.providerId ?? order.provider?.id ?? "") === String(providerId);
    const warehouseMatches = warehouseId === "ALL" || String(order.warehouseId ?? order.warehouse?.id ?? "") === String(warehouseId);
    const statusMatches = status === "ALL" || order.status === status;
    const textMatches = !query.trim() || `${orderNumber(order)} ${order.provider?.name ?? ""} ${order.warehouse?.location ?? ""} ${order.status ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return providerMatches && warehouseMatches && statusMatches && textMatches && inPurchaseRange(order.orderedAt ?? order.createdAt, range);
  }).sort((left, right) => new Date(right.orderedAt ?? right.createdAt ?? 0).getTime() - new Date(left.orderedAt ?? left.createdAt ?? 0).getTime()), [orders, providerId, query, range, status, warehouseId]);
  const totals = useMemo(() => {
    const total = filteredOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
    const subtotal = filteredOrders.reduce((sum, order) => sum + Number(order.subtotal ?? 0), 0);
    const received = filteredOrders.filter((order) => order.status === "RECIBIDA");
    const balance = filteredOrders.reduce((sum, order) => sum + Number(order.balance ?? order.payableTotal ?? 0), 0);
    return { count: filteredOrders.length, total, subtotal, taxes: total - subtotal, pending: filteredOrders.filter((order) => ["BORRADOR", "ORDENADA"].includes(order.status)).length, received: received.length, balance };
  }, [filteredOrders]);
  const localProviders = useMemo(() => buildPurchaseProviderRows(filteredOrders), [filteredOrders]);
  const localTimeline = useMemo(() => buildPurchaseTimeline(filteredOrders), [filteredOrders]);
  const localStatus = useMemo(() => Object.keys(statusLabels).map((key) => ({ label: statusLabels[key], key, value: filteredOrders.filter((order) => order.status === key).reduce((sum, order) => sum + Number(order.total ?? 0), 0), count: filteredOrders.filter((order) => order.status === key).length })).filter((row) => row.value > 0), [filteredOrders]);
  const providerRows = summary?.byProvider?.length ? summary.byProvider.map((row) => ({ name: row.provider?.name ?? "Sin proveedor", orders: Number(row.orders ?? 0), total: Number(row.total ?? 0), lead: Number(row.averageLeadDays ?? 0), onTime: row.onTimeRate })) : localProviders;
  const timelineRows = summary?.timeline?.length ? summary.timeline.map((row) => ({ date: purchaseDayLabel(row.period), orders: Number(row.orders ?? 0), subtotal: Number(row.subtotal ?? 0), total: Number(row.total ?? 0), taxes: Number(row.total ?? 0) - Number(row.subtotal ?? 0) })) : localTimeline;
  const topProducts = summary?.topProducts?.length ? summary.topProducts.map((row) => ({ name: row.product?.name ?? "Producto", quantity: Number(row.orderedQuantity ?? 0), received: Number(row.receivedQuantity ?? 0), total: Number(row.total ?? 0) })) : [];
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    const params = { granularity: period === "TODAY" || period === "7D" || period === "30D" || period === "90D" || period === "CUSTOM" ? "DIA" : "MES", topProducts: 20 };
    if (range.start.getTime() > 0) params.dateFrom = range.start.toISOString();
    if (period !== "ALL") params.dateTo = range.end.toISOString();
    if (providerId !== "ALL") params.providerId = providerId;
    if (warehouseId !== "ALL") params.warehouseId = warehouseId;
    apiClient.get("/compras/reportes/resumen", params).then((result) => { if (!cancelled) setSummary(result); }).catch(() => { if (!cancelled) setSummary(null); }).finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [period, providerId, range.end, range.start, warehouseId]);

  function updateFilter(setter, value) { setter(value); setPage(1); }
  function exportCsv() { const rows = filteredOrders.map((order) => [formatDate(order.orderedAt ?? order.createdAt), orderNumber(order), order.provider?.name ?? "—", order.warehouse?.location ?? "—", statusLabels[order.status] ?? order.status ?? "—", Number(order.subtotal ?? 0).toFixed(2), (Number(order.total ?? 0) - Number(order.subtotal ?? 0)).toFixed(2), Number(order.total ?? 0).toFixed(2), Number(order.balance ?? order.payableTotal ?? 0).toFixed(2)]); downloadPurchaseReport([['Fecha', 'Compra', 'Proveedor', 'Bodega', 'Estado', 'Subtotal', 'Impuestos', 'Total', 'Saldo'], ...rows], `compras-${period.toLowerCase()}.csv`, "text/csv;charset=utf-8"); }
  async function exportExcel() { const XLSX = await import("xlsx"); const workbook = XLSX.utils.book_new(); const appendSheet = (name, rows, widths) => { const sheet = XLSX.utils.json_to_sheet(rows); sheet["!cols"] = widths.map((wch) => ({ wch })); if (rows.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(sheet["!ref"])) }; XLSX.utils.book_append_sheet(workbook, sheet, name); }; appendSheet("Resumen", [{ Indicador: "Periodo", Valor: range.label }, { Indicador: "Compras", Valor: totals.count }, { Indicador: "Subtotal", Valor: totals.subtotal }, { Indicador: "Impuestos", Valor: totals.taxes }, { Indicador: "Total", Valor: totals.total }, { Indicador: "Pendientes", Valor: totals.pending }, { Indicador: "Recibidas", Valor: totals.received }, { Indicador: "Saldo", Valor: totals.balance }], [28, 24]); appendSheet("Compras", filteredOrders.map((order) => ({ Fecha: formatDate(order.orderedAt ?? order.createdAt), Compra: orderNumber(order), Proveedor: order.provider?.name ?? "—", Bodega: order.warehouse?.location ?? "—", Estado: statusLabels[order.status] ?? order.status ?? "—", Subtotal: Number(order.subtotal ?? 0), Impuestos: Number(order.total ?? 0) - Number(order.subtotal ?? 0), Total: Number(order.total ?? 0), Saldo: Number(order.balance ?? order.payableTotal ?? 0) })), [15, 20, 28, 24, 16, 16, 16, 16, 16]); appendSheet("Proveedores", providerRows.map((row) => ({ Proveedor: row.name, Compras: row.orders, Total: row.total, "Días promedio": row.lead, "Entrega a tiempo": row.onTime == null ? "—" : `${row.onTime}%` })), [30, 14, 18, 16, 20]); appendSheet("Productos", topProducts.map((row) => ({ Producto: row.name, Solicitadas: row.quantity, Recibidas: row.received, Total: row.total })), [34, 16, 16, 18]); appendSheet("Evolución", timelineRows.map((row) => ({ Periodo: row.date, Compras: row.orders, Subtotal: row.subtotal, Impuestos: row.taxes, Total: row.total })), [16, 14, 18, 18, 18]); XLSX.writeFile(workbook, `reporte-compras-${period.toLowerCase()}.xlsx`); }
  async function exportPdf() { const { jsPDF } = await import("jspdf"); const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }); const pageWidth = doc.internal.pageSize.getWidth(); const margin = 34; doc.setFillColor(31, 51, 77); doc.rect(0, 0, pageWidth, 76, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("MUNDO TIENDA", margin, 32); doc.setFontSize(10); doc.text("REPORTE DE COMPRAS", margin, 51); doc.setFont("helvetica", "normal"); doc.text(`Periodo: ${range.label}`, pageWidth - margin, 32, { align: "right" }); let y = 108; const cards = [["Compras", totals.count], ["Subtotal", formatCurrency(totals.subtotal)], ["Impuestos", formatCurrency(totals.taxes)], ["Total", formatCurrency(totals.total)], ["Pendientes", totals.pending]]; const gap = 9; const cardWidth = (pageWidth - margin * 2 - gap * 4) / 5; cards.forEach(([label, value], index) => { const x = margin + index * (cardWidth + gap); doc.setFillColor(246, 249, 252); doc.roundedRect(x, y, cardWidth, 52, 5, 5, "F"); doc.setTextColor(103, 119, 139); doc.setFontSize(8); doc.text(label, x + 10, y + 19); doc.setTextColor(31, 51, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(String(value), x + 10, y + 39); doc.setFont("helvetica", "normal"); }); y += 82; doc.setTextColor(31, 51, 77); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Detalle de compras", margin, y); y += 19; doc.setFillColor(43, 108, 176); doc.rect(margin, y - 12, pageWidth - margin * 2, 22, "F"); doc.setTextColor(255, 255, 255); doc.setFontSize(8); ["Fecha", "Compra", "Proveedor", "Estado", "Total"].forEach((header, index) => doc.text(header, [margin + 7, margin + 80, margin + 220, margin + 470, pageWidth - margin - 7][index], y + 2, { align: index === 4 ? "right" : "left" })); y += 22; doc.setTextColor(31, 51, 77); doc.setFont("helvetica", "normal"); doc.setFontSize(8); filteredOrders.slice(0, 75).forEach((order, index) => { if (y > 555) { doc.addPage(); y = 50; } if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 11, pageWidth - margin * 2, 19, "F"); } doc.text(formatDate(order.orderedAt ?? order.createdAt), margin + 7, y); doc.text(orderNumber(order), margin + 80, y); doc.text(String(order.provider?.name ?? "—").slice(0, 28), margin + 220, y); doc.text(statusLabels[order.status] ?? order.status ?? "—", margin + 470, y); doc.text(formatCurrency(order.total), pageWidth - margin - 7, y, { align: "right" }); y += 19; }); doc.save(`reporte-compras-${period.toLowerCase()}.pdf`); }

  return <div className="purchase-report-shell purchase-report-dashboard">
    <div className="purchase-report-hero"><div><span className="purchase-report-kicker">MÓDULO DE COMPRAS · ANALÍTICA</span><h2>Reportes de compras</h2><p>Controla inversión, proveedores, recepción, impuestos y saldos pendientes.</p></div><BarChart3 size={28} /></div>
    <div className="purchase-report-cards"><PurchaseReportKpi label="Compras filtradas" value={totals.count} tone="blue" /><PurchaseReportKpi label="Subtotal" value={formatCurrency(totals.subtotal)} tone="navy" /><PurchaseReportKpi label="Impuestos" value={formatCurrency(totals.taxes)} tone="amber" /><PurchaseReportKpi label="Total" value={formatCurrency(totals.total)} tone="green" /><PurchaseReportKpi label="Saldo pendiente" value={formatCurrency(totals.balance)} tone="red" /></div>
    <div className="purchase-report-quick-filters"><button type="button" className={period === "TODAY" ? "is-active" : ""} onClick={() => updateFilter(setPeriod, "TODAY")}>Hoy</button><button type="button" className={period === "7D" ? "is-active" : ""} onClick={() => updateFilter(setPeriod, "7D")}>7 días</button><button type="button" className={period === "30D" ? "is-active" : ""} onClick={() => updateFilter(setPeriod, "30D")}>30 días</button><button type="button" className={period === "90D" ? "is-active" : ""} onClick={() => updateFilter(setPeriod, "90D")}>90 días</button><button type="button" className={period === "ALL" ? "is-active" : ""} onClick={() => updateFilter(setPeriod, "ALL")}>Historial</button><button type="button" className={period === "CUSTOM" ? "is-active" : ""} onClick={() => updateFilter(setPeriod, "CUSTOM")}><CalendarDays size={13} /> Fechas</button></div>
    <div className="purchase-report-toolbar"><label>Periodo<select value={period} onChange={(event) => updateFilter(setPeriod, event.target.value)}><option value="TODAY">Hoy</option><option value="7D">Últimos 7 días</option><option value="30D">Últimos 30 días</option><option value="90D">Últimos 90 días</option><option value="ALL">Todo el historial</option><option value="CUSTOM">Personalizado</option></select></label>{period === "CUSTOM" && <><label>Desde<input type="date" value={from} onChange={(event) => updateFilter(setFrom, event.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={(event) => updateFilter(setTo, event.target.value)} /></label></>}<label>Proveedor<select value={providerId} onChange={(event) => updateFilter(setProviderId, event.target.value)}><option value="ALL">Todos</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label>Bodega<select value={warehouseId} onChange={(event) => updateFilter(setWarehouseId, event.target.value)}><option value="ALL">Todas</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.location ?? warehouse.name}</option>)}</select></label><label>Estado<select value={status} onChange={(event) => updateFilter(setStatus, event.target.value)}><option value="ALL">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="purchase-report-search"><Search size={14} /><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Buscar compra, proveedor o bodega…" /></label><button type="button" className="purchase-report-export blue" onClick={exportPdf}><Printer size={14} /> PDF</button><button type="button" className="purchase-report-export green" onClick={() => void exportExcel()}><FileSpreadsheet size={14} /> Excel</button><button type="button" className="purchase-report-export amber" onClick={exportCsv}><Download size={14} /> CSV</button></div>
    <div className="purchase-report-note"><Filter size={13} /> {filteredOrders.length} operación(es) · {range.label}{summaryLoading ? " · actualizando indicadores" : ""}</div>
    <nav className="purchase-report-tabs" aria-label="Secciones de compras"><button type="button" className={activeTab === "summary" ? "is-active" : ""} onClick={() => setActiveTab("summary")}>Resumen</button><button type="button" className={activeTab === "providers" ? "is-active" : ""} onClick={() => setActiveTab("providers")}>Proveedores</button><button type="button" className={activeTab === "products" ? "is-active" : ""} onClick={() => setActiveTab("products")}>Productos</button><button type="button" className={activeTab === "detail" ? "is-active" : ""} onClick={() => setActiveTab("detail")}>Detalle</button></nav>
    {activeTab === "summary" && <div className="purchase-report-chart-grid"><section className="purchase-report-card"><div className="purchase-report-card-title"><strong>Compras por periodo</strong><span>Subtotal, impuestos y total.</span></div><ResponsiveContainer width="100%" height={260}><BarChart data={timelineRows} margin={{ top: 10, right: 8, left: -14, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e7edf3" /><XAxis dataKey="date" tick={{ fill: "#718096", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#8a98aa", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={purchaseShortMoney} /><Tooltip content={<PurchaseReportTooltip currency />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="subtotal" name="Subtotal" fill="#2b6cb0" radius={[4, 4, 0, 0]} /><Bar dataKey="taxes" name="Impuestos" fill="#d28a25" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></section><section className="purchase-report-card"><div className="purchase-report-card-title"><strong>Estado del proceso</strong><span>Valor según estado.</span></div><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={localStatus} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="78%" paddingAngle={3} stroke="none">{localStatus.map((row, index) => <Cell key={row.key} fill={["#d28a25", "#2b6cb0", "#31a56d", "#c45454"][index % 4]} />)}</Pie><Tooltip content={<PurchaseReportTooltip currency />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer></section><section className="purchase-report-card purchase-report-wide"><div className="purchase-report-card-title"><strong>Proveedores con mayor inversión</strong><span>Compras recibidas, promedio de entrega y cumplimiento.</span></div><ResponsiveContainer width="100%" height={250}><BarChart data={providerRows.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 16, left: 10, bottom: 5 }}><CartesianGrid horizontal={false} stroke="#e7edf3" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={150} tick={{ fill: "#596b82", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={<PurchaseReportTooltip currency />} /><Bar dataKey="total" name="Total comprado" fill="#31a56d" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></section></div>}
    {activeTab === "providers" && <PurchaseProviderTable rows={providerRows} />}
    {activeTab === "products" && <PurchaseProductTable rows={topProducts} />}
    {activeTab === "detail" && <section className="purchase-report-detail"><div className="purchase-report-detail-heading"><strong>Detalle de operaciones</strong><span>{pageRows.length} de {filteredOrders.length}</span></div><div className="purchase-report-table-scroll"><table className="purchase-table"><thead><tr><th>Fecha</th><th>Compra</th><th>Proveedor</th><th>Bodega</th><th>Estado</th><th>Subtotal</th><th>Impuestos</th><th>Total</th><th>Saldo</th><th>Acción</th></tr></thead><tbody>{pageRows.map((order) => <tr key={order.id} className="purchase-report-row" tabIndex="0" onDoubleClick={() => onViewPdf?.(order)} onKeyDown={(event) => { if (event.key === "Enter") onViewPdf?.(order); }}><td>{formatDate(order.orderedAt ?? order.createdAt)}</td><td><strong>{orderNumber(order)}</strong></td><td>{order.provider?.name ?? "—"}</td><td>{order.warehouse?.location ?? "—"}</td><td><span className={`purchase-report-status ${String(order.status ?? "").toLowerCase()}`}>{statusLabels[order.status] ?? order.status ?? "—"}</span></td><td className="number-cell">{formatCurrency(order.subtotal)}</td><td className="number-cell">{formatCurrency(Number(order.total ?? 0) - Number(order.subtotal ?? 0))}</td><td className="number-cell">{formatCurrency(order.total)}</td><td className="number-cell">{formatCurrency(order.balance ?? order.payableTotal ?? 0)}</td><td><button type="button" className="purchase-report-view" onClick={() => onViewPdf?.(order)}><Eye size={13} /> Ver</button></td></tr>)}{!pageRows.length && <tr><td colSpan="10">No hay compras para los filtros seleccionados.</td></tr>}</tbody></table></div>{filteredOrders.length > 0 && <div className="purchase-report-pagination"><span>Página {currentPage} de {totalPages}</span><label>Filas<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="15">15</option><option value="30">30</option><option value="50">50</option></select></label><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Siguiente</button></div>}</section>}
  </div>;
}

function PurchaseReportKpi({ label, value, tone }) { return <article className={`purchase-report-kpi ${tone}`}><span>{label}</span><strong>{value}</strong></article>; }
function PurchaseProviderTable({ rows }) { return <section className="purchase-report-detail"><div className="purchase-report-detail-heading"><strong>Rendimiento por proveedor</strong><span>{rows.length} proveedor(es)</span></div><div className="purchase-report-table-scroll"><table className="purchase-table"><thead><tr><th>Proveedor</th><th>Compras</th><th>Total</th><th>Días promedio</th><th>Entrega a tiempo</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.orders}</td><td className="number-cell">{formatCurrency(row.total)}</td><td>{row.lead ? `${row.lead.toFixed(1)} días` : "—"}</td><td>{row.onTime == null ? "—" : `${row.onTime}%`}</td></tr>)}{!rows.length && <tr><td colSpan="5">No hay proveedores para este filtro.</td></tr>}</tbody></table></div></section>; }
function PurchaseProductTable({ rows }) { return <section className="purchase-report-detail"><div className="purchase-report-detail-heading"><strong>Productos comprados</strong><span>{rows.length} producto(s)</span></div><div className="purchase-report-table-scroll"><table className="purchase-table"><thead><tr><th>Producto</th><th>Solicitadas</th><th>Recibidas</th><th>Pendientes</th><th>Total</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.quantity}</td><td>{row.received}</td><td>{Math.max(0, row.quantity - row.received)}</td><td className="number-cell">{formatCurrency(row.total)}</td></tr>)}{!rows.length && <tr><td colSpan="5">No hay productos recibidos en este periodo.</td></tr>}</tbody></table></div></section>; }
function PurchaseReportTooltip({ active, payload, label, currency = false }) { if (!active || !payload?.length) return null; return <div className="purchase-report-tooltip"><strong>{label}</strong>{payload.map((row) => <div key={row.dataKey ?? row.name}><span>{row.name ?? row.dataKey}</span><b>{currency ? formatCurrency(row.value) : row.value}</b></div>)}</div>; }
function purchaseReportRange(period, from, to) { const end = period === "CUSTOM" && to ? new Date(`${to}T23:59:59`) : new Date(); end.setHours(23, 59, 59, 999); if (period === "ALL") return { start: new Date(0), end, label: "Todo el historial" }; if (period === "CUSTOM") return { start: from ? new Date(`${from}T00:00:00`) : new Date(0), end, label: `${from || "inicio"} · ${to || "hoy"}` }; const days = { TODAY: 0, "7D": 6, "30D": 29, "90D": 89 }[period] ?? 29; const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days); return { start, end, label: { TODAY: "Hoy", "7D": "Últimos 7 días", "30D": "Últimos 30 días", "90D": "Últimos 90 días" }[period] ?? "Periodo seleccionado" }; }
function inPurchaseRange(value, range) { if (!value) return false; const dateValue = new Date(value); return dateValue >= range.start && dateValue <= range.end; }
function purchaseDayLabel(value) { const dateValue = new Date(value); return Number.isNaN(dateValue.getTime()) ? String(value ?? "—") : new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(dateValue).replace(".", ""); }
function purchaseDateKey(value) { const dateValue = new Date(value); return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}-${String(dateValue.getDate()).padStart(2, "0")}`; }
function purchaseShortMoney(value) { const amount = Number(value ?? 0); return amount >= 1000000 ? `$${(amount / 1000000).toFixed(1)}M` : amount >= 1000 ? `$${Math.round(amount / 1000)}k` : `$${Math.round(amount)}`; }
function buildPurchaseTimeline(orders) { const rows = new Map(); orders.forEach((order) => { const value = Number(order.total ?? 0); const subtotal = Number(order.subtotal ?? 0); const key = purchaseDateKey(order.receivedAt ?? order.orderedAt ?? order.createdAt); const row = rows.get(key) ?? { date: purchaseDayLabel(order.receivedAt ?? order.orderedAt ?? order.createdAt), orders: 0, subtotal: 0, total: 0, taxes: 0 }; row.orders += 1; row.subtotal += subtotal; row.total += value; row.taxes += value - subtotal; rows.set(key, row); }); return [...rows.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-14).map(([, row]) => row); }
function buildPurchaseProviderRows(orders) { const rows = new Map(); orders.forEach((order) => { const key = order.provider?.id ?? order.providerId ?? "none"; const current = rows.get(key) ?? { name: order.provider?.name ?? "Sin proveedor", orders: 0, total: 0, lead: 0, onTime: null }; current.orders += 1; current.total += Number(order.total ?? 0); rows.set(key, current); }); return [...rows.values()].sort((left, right) => right.total - left.total); }
function downloadPurchaseReport(rows, filename, type) { const content = `\ufeff${rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")}`; const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

function PurchaseLookupDialog({
  type,
  providers,
  warehouses,
  products,
  orders,
  loadingId,
  onViewPdf,
  onSelect,
  onClose,
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const items =
    type === "providers"
      ? providers
      : type === "warehouses"
        ? warehouses
        : type === "products"
          ? products
          : orders;
  const filteredItems = items.filter((item) => {
    if (!query) return true;
    return `${item.id} ${item.code ?? ""} ${item.name ?? item.description ?? ""} ${warehouseName(item)} ${item.taxId ?? ""} ${item.reference ?? ""} ${orderNumber(item)}`
      .toLowerCase()
      .includes(query);
  });
  return (
    <div className="module-dialog-backdrop">
      <section
        className="module-dialog purchase-lookup-dialog"
        role="dialog"
        aria-modal="true"
      >
        <header className="module-dialog-titlebar">
          <strong>
            INFORMACIÓN DE{" "}
            {type === "providers"
              ? "PROVEEDORES"
              : type === "warehouses"
                ? "DEPÓSITOS"
                : type === "products"
                  ? "PRODUCTOS"
                  : "COMPRAS"}
          </strong>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="lookup-table-wrap">
          <table
            className={`purchase-table lookup-table ${
              type === "orders" ? "purchase-orders-lookup-table" : ""
            }`}
          >
            <thead>
              <tr>
                {type === "products" && <th>Imagen</th>}
                <th>Código</th>
                {type !== "orders" && (
                  <th>
                    {type === "warehouses"
                      ? "Nombre del depósito"
                      : type === "providers"
                        ? "Nombre"
                        : "Producto"}
                  </th>
                )}
                {type === "providers" && (
                  <>
                    <th>Clase</th>
                    <th>Id. Fiscal</th>
                    <th>Saldo pendiente</th>
                  </>
                )}
                {type === "warehouses" && <th>Clase</th>}
                {type === "products" && (
                  <>
                    <th>Referencia</th>
                    <th>Existencia</th>
                    <th>Costo</th>
                  </>
                )}
                {type === "orders" && (
                  <>
                    <th>Proveedor</th>
                    <th>Depósito</th>
                    <th>Fecha</th>
                    <th>Total</th>
                  </>
                )}
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  tabIndex="0"
                  onDoubleClick={() => onSelect(item)}
                  onKeyDown={(event) => event.key === "Enter" && onSelect(item)}
                >
                  {type === "products" && (
                    <td className="image-cell">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" />
                      ) : (
                        <ImageIcon size={18} />
                      )}
                    </td>
                  )}
                  <td>
                    {type === "orders" ? orderNumber(item) : productCode(item)}
                  </td>
                  {type !== "orders" && (
                    <td>
                      {type === "warehouses"
                        ? warehouseName(item)
                        : productName(item)}
                    </td>
                  )}
                  {type === "providers" && (
                    <>
                      <td>{item.className ?? item.providerType ?? ""}</td>
                      <td>{item.taxId ?? ""}</td>
                      <td className="number-cell">
                        {formatCurrency(item.pendingBalance)}
                      </td>
                    </>
                  )}
                  {type === "warehouses" && (
                    <td>{item.className ?? item.type ?? "Depósito"}</td>
                  )}
                  {type === "products" && (
                    <>
                      <td>{item.reference ?? ""}</td>
                      <td className="number-cell">{productStock(item)}</td>
                      <td className="number-cell">
                        {formatCurrency(defaultCost(item))}
                      </td>
                    </>
                  )}
                  {type === "orders" && (
                    <>
                      <td>{item.provider?.name ?? "—"}</td>
                      <td>{warehouseName(item.warehouse)}</td>
                      <td>{formatDate(purchaseOrderDate(item))}</td>
                      <td className="number-cell">
                        {formatCurrency(item.total)}
                      </td>
                    </>
                  )}
                  <td className="purchase-lookup-actions">
                    <button
                      type="button"
                      disabled={Boolean(loadingId)}
                      className="purchase-action-load"
                      onClick={() => onSelect(item)}
                    >
                      {loadingId === String(item.id)
                        ? "Cargando…"
                        : type === "products"
                            ? "Agregar"
                            : type === "orders"
                              ? "Cargar"
                              : "Seleccionar"}
                    </button>
                    {type === "orders" && (
                      <button
                        type="button"
                        className="purchase-action-pdf"
                        disabled={Boolean(loadingId)}
                        onClick={(event) => {
                          event.stopPropagation();
                          onViewPdf?.(item);
                        }}
                      >
                        <Eye size={12} /> Ver PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredItems.length && (
                <tr className="empty-list-row">
                  <td colSpan="9">No se encontraron registros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="module-dialog-footer">
          <label htmlFor="purchase-lookup-search">Buscar</label>
          <div className="purchase-search">
            <Search size={14} />
            <input
              autoFocus
              id="purchase-lookup-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Código, nombre o referencia"
            />
          </div>
          <button type="button" onClick={onClose}>
            Salir
          </button>
        </div>
      </section>
    </div>
  );
}

function PurchasePdfPreview({ order, onClose }) {
  const items = order.items ?? [];
  const totals = calculateCartTotals(
    items.map((item) => ({
      quantity: item.quantity,
      unitCost: item.unitCost,
      product: item.product,
    })),
    order.provider,
  );
  const fmt = (value) => formatCurrency(Number(value ?? 0));
  const payable = Number(order.payableTotal ?? 0) || totals.payableTotal;
  const retention = Number(order.retentionAmount ?? totals.retentionAmount);
  const paidTotal = Number(order.paidTotal ?? order.paidAmount ?? 0);
  function downloadOrderPdf() {
    const lines = [
      "MUNDO TIENDA - " + (order.operationType || "Compra"),
      `Documento: ${orderNumber(order)}   Estado: ${statusLabels[order.status] ?? order.status ?? "Borrador"}`,
      `Proveedor: ${order.provider?.name ?? "-"}   NIT: ${order.provider?.nit ?? order.provider?.document ?? "-"}`,
      `Deposito: ${warehouseName(order.warehouse)}   Fecha: ${formatDate(purchaseOrderDate(order))}`,
      `Factura proveedor: ${order.externalReference ?? "-"}   Vence: ${order.dueDate ? formatDate(order.dueDate) : "-"}`,
      `Condicion de pago: ${order.paymentCondition ?? "-"}`,
      "",
      "CODIGO      PRODUCTO                              CANT      COSTO (IVA incl.)      TOTAL",
      ...items.map(
        (item) =>
          `${String(productCode(item.product)).padEnd(11)} ${String(productName(item.product)).slice(0, 36).padEnd(36)} ${String(item.quantity).padStart(6)}  ${fmt(item.unitCost).padStart(16)}  ${fmt(lineTotal(item)).padStart(14)}`,
      ),
      "",
      `Total renglones (sin IVA): ${fmt(totals.lines)}`,
      `IVA: ${fmt(totals.taxes)}`,
      `Total operacion: ${fmt(totals.total)}`,
      ...(Number(order.discount1Percent) > 0 ? [`Descuento 1: ${order.discount1Percent}%`] : []),
      ...(Number(order.discount2Percent) > 0 ? [`Descuento 2: ${order.discount2Percent}%`] : []),
      ...(Number(order.freight) > 0 ? [`Flete: ${fmt(order.freight)}`] : []),
      ...(retention > 0
        ? [
            `Base retencion: ${fmt(order.retentionBase ?? totals.lines)}`,
            `Retencion (${formatRate(order.retentionRate ?? totals.retentionRate)}%): -${fmt(retention)}`,
          ]
        : []),
      `TOTAL A PAGAR: ${fmt(payable)}`,
      `Pagado: ${fmt(paidTotal)}   Saldo: ${fmt(Math.max(0, payable - paidTotal))}`,
    ];
    downloadPdf(`compra-${orderNumber(order)}`, lines);
  }
  function shareViaWhatsApp() {
    const message = [
      `Orden de compra ${orderNumber(order)}`,
      `Proveedor: ${order.provider?.name ?? "—"}`,
      `Depósito: ${warehouseName(order.warehouse)}`,
      `Total a pagar: ${formatCurrency(Number(order.payableTotal ?? 0) || totals.payableTotal)}`,
      "El PDF se adjunta desde la vista previa de la orden.",
    ].join("\n");
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }
  return (
    <div className="module-dialog-backdrop purchase-pdf-backdrop">
      <section className="module-dialog purchase-pdf-preview" role="dialog" aria-modal="true">
        <header className="module-dialog-titlebar">
          <strong>VISTA PREVIA PDF · {orderNumber(order)}</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <article className="purchase-pdf-page">
          <div className="purchase-pdf-heading">
            <div>
              <span>MUNDO TIENDA</span>
              <h1>Orden de compra</h1>
            </div>
            <strong>{orderNumber(order)}</strong>
          </div>
          <div className="purchase-pdf-meta">
            <div><b>Proveedor</b><span>{order.provider?.name ?? "—"}</span></div>
            <div><b>Depósito</b><span>{warehouseName(order.warehouse)}</span></div>
            <div><b>Fecha</b><span>{formatDate(purchaseOrderDate(order))}</span></div>
            <div><b>Estado</b><span>{statusLabels[order.status] ?? order.status ?? "Borrador"}</span></div>
            <div><b>Documento proveedor</b><span>{order.documentName ?? "No adjunto"}</span></div>
          </div>
          <table className="purchase-table purchase-pdf-table">
            <thead>
              <tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Costo unitario (IVA incluido)</th><th>Total</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id ?? item.productId}>
                  <td>{productCode(item.product)}</td>
                  <td>{productName(item.product)}</td>
                  <td className="number-cell">{item.quantity}</td>
                  <td className="number-cell">{formatCurrency(item.unitCost)}</td>
                  <td className="number-cell">{formatCurrency(lineTotal(item))}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan="5">No hay productos cargados en esta orden.</td></tr>}
            </tbody>
          </table>
          <div className="purchase-pdf-total">
            <span>Total a pagar</span><strong>{formatCurrency(Number(order.payableTotal ?? 0) || totals.payableTotal)}</strong>
          </div>
          <div className="purchase-pdf-total">
            <span>Total sin IVA / IVA</span>
            <strong>{formatCurrency(totals.lines)} / {formatCurrency(totals.taxes)}</strong>
          </div>
          {Number(order.retentionAmount ?? totals.retentionAmount) > 0 && (
            <div className="purchase-pdf-total purchase-pdf-retention">
              <span>Retención ({formatRate(order.retentionRate ?? totals.retentionRate)}%)</span>
              <strong>-{formatCurrency(order.retentionAmount ?? totals.retentionAmount)}</strong>
            </div>
          )}
        </article>
        <div className="module-dialog-footer">
          {order.documentData && (
            <button
              type="button"
              onClick={() => window.open(order.documentData, "_blank", "noopener,noreferrer")}
            >
              <Eye size={13} /> Ver documento proveedor
            </button>
          )}
          <button type="button" onClick={shareViaWhatsApp}>
            <Share2 size={13} /> Compartir por WhatsApp
          </button>
          <button type="button" onClick={downloadOrderPdf}>
            <FileText size={13} /> Descargar PDF
          </button>
          <button type="button" className="purchase-action-pdf" onClick={() => window.print()}>
            <Printer size={13} /> Imprimir / Guardar PDF
          </button>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  );
}

function QuickPurchaseProductDialog({
  productTypes,
  provider,
  warehouse,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState({
    productTypeId: String(productTypes[0]?.id ?? ""),
    name: "",
    description: "",
    brand: "",
    unit: "UND",
    taxRate: "0",
    price: "1",
    priceName: "Precio minorista",
    barcode: "",
    minimumStock: "0",
    maximumStock: "",
    unitsPerPackage: "",
    packagesPerBox: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.productTypeId || draft.name.trim().length < 2 || draft.brand.trim().length < 1) {
      setError("Selecciona el tipo y completa nombre y marca.");
      return;
    }
    if (Number(draft.price) <= 0) {
      setError("El precio debe ser mayor que cero.");
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } catch (requestError) {
      setError(requestError.message || "No se pudo crear el producto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-dialog-backdrop" role="presentation">
      <form className="module-dialog quick-purchase-product-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <header className="module-dialog-titlebar">
          <strong>INGRESO DE NUEVO PRODUCTO</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar" disabled={saving}><X size={17} /></button>
        </header>
        <div className="quick-product-context">
          <span>Proveedor: <b>{provider?.name ?? "—"}</b></span>
          <span>Depósito: <b>{warehouseName(warehouse)}</b></span>
        </div>
        <div className="quick-product-grid">
          <label><span>Tipo / línea</span><select value={draft.productTypeId} onChange={(event) => update("productTypeId", event.target.value)}>{productTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Nombre</span><input autoFocus value={draft.name} onChange={(event) => update("name", event.target.value)} /></label>
          <label><span>Marca</span><input value={draft.brand} onChange={(event) => update("brand", event.target.value)} /></label>
          <label><span>Unidad base</span><select value={draft.unit} onChange={(event) => update("unit", event.target.value)}>{["UND", "KG", "G", "LB", "L", "ML"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
          <label><span>Precio inicial</span><input type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => update("price", event.target.value)} /></label>
          <label><span>IVA venta %</span><input type="number" min="0" step="0.01" value={draft.taxRate} onChange={(event) => update("taxRate", event.target.value)} /></label>
          <label><span>Código de barras</span><input value={draft.barcode} onChange={(event) => update("barcode", event.target.value)} /></label>
          <label><span>Descripción (opcional)</span><input value={draft.description} onChange={(event) => update("description", event.target.value)} /></label>
          <label><span>Unidades por paquete</span><input type="number" min="1" value={draft.unitsPerPackage} onChange={(event) => update("unitsPerPackage", event.target.value)} /></label>
          <label><span>Paquetes por caja</span><input type="number" min="1" value={draft.packagesPerBox} onChange={(event) => update("packagesPerBox", event.target.value)} /></label>
        </div>
        {error && <div className="inline-error">{error}</div>}
        <div className="module-dialog-footer">
          <button type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving || !productTypes.length}>{saving ? "Guardando…" : "Crear y agregar"}</button>
        </div>
      </form>
    </div>
  );
}

function PurchaseQuoteImportDialog({ products, onApply, onClose }) {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    if (!file || processing) return;
    setProcessing(true);
    setError("");
    setProgress(0);
    try {
      const text = await extractQuoteText(file, setProgress);
      setResult(parseQuoteText(text, file.name));
    } catch (requestError) {
      setError(requestError.message || "No se pudo leer el archivo.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleApply() {
    if (!result) return;
    try {
      const documentAttachment = file
        ? {
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            data: await readFileAsDataUrl(file),
          }
        : null;
      onApply({ ...result, documentAttachment });
    } catch (requestError) {
      setError(requestError.message || "No se pudo conservar el documento.");
    }
  }

  return (
    <div className="module-dialog-backdrop">
      <section className="module-dialog purchase-ocr-dialog" role="dialog" aria-modal="true">
        <header className="module-dialog-titlebar">
          <strong>ESCANEAR FACTURA</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </header>
        <div className="purchase-ocr-content">
          <p>Sube un PDF o una imagen de la factura. El sistema lee el encabezado y agrega automáticamente los productos reconocidos a la nueva compra.</p>
          <label className="purchase-upload-dropzone">
            <Upload size={22} />
            <strong>{file ? file.name : "Seleccionar PDF o imagen"}</strong>
            <span>PDF, JPG, PNG o WEBP</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
                setError("");
              }}
            />
          </label>
          <button type="button" className="purchase-ocr-analyze" disabled={!file || processing} onClick={handleAnalyze}>
            {processing ? <><LoaderCircle size={14} className="is-spinning" /> Escaneando {progress}%</> : <><ScanText size={14} /> Escanear factura</>}
          </button>
          {error && (
            <TransientMessage
              className="module-message is-error purchase-ocr-error"
              role="alert"
              onDismiss={() => setError("")}
            >
              {error}
            </TransientMessage>
          )}
          {result && (
            <div className="purchase-ocr-result">
              <div className="purchase-ocr-fields">
                <label>Proveedor<input value={result.supplier} onChange={(event) => setResult((current) => ({ ...current, supplier: event.target.value }))} /></label>
                <label>Número de documento<input value={result.documentNumber} onChange={(event) => setResult((current) => ({ ...current, documentNumber: event.target.value }))} /></label>
              </div>
              <div className="purchase-ocr-products">
                <strong>Productos detectados ({result.items.length})</strong>
                {result.items.length ? (
                  <ul>
                    {result.items.map((item, index) => {
                      const matchedProduct = products.find((product) => String(product.id) === String(item.productId)) ?? findProductForOcrItem(item, products);
                      return (
                        <li key={`${item.code}-${index}`}>
                          <span>
                            {item.description || item.code || "Producto sin descripción"} · {item.quantity} x {formatCurrency(item.unitCost)}
                          </span>
                          <small className={matchedProduct ? "is-matched" : "is-unmatched"}>
                            {matchedProduct ? `Se agregará: ${productName(matchedProduct)}` : "No coincide con un producto existente"}
                          </small>
                          <select
                            aria-label={`Producto para ${item.description || item.code || `línea ${index + 1}`}`}
                            value={item.productId ?? ""}
                            onChange={(event) => setResult((current) => ({
                              ...current,
                              items: current.items.map((currentItem, currentIndex) =>
                                currentIndex === index
                                  ? { ...currentItem, productId: event.target.value ? Number(event.target.value) : undefined }
                                  : currentItem,
                              ),
                            }))}
                          >
                            <option value="">Seleccionar producto para corregir</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>{productName(product)} · {productCode(product)}</option>
                            ))}
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="purchase-ocr-empty">No se detectaron líneas de productos.</span>
                )}
              </div>
              <label className="purchase-ocr-text-label">Texto detectado<textarea value={result.text} onChange={(event) => setResult((current) => ({ ...current, text: event.target.value }))} /></label>
              <button type="button" className="purchase-ocr-apply" onClick={() => void handleApply()}>Usar datos y agregar productos</button>
            </div>
          )}
        </div>
        <div className="module-dialog-footer"><button type="button" onClick={onClose}>Cerrar</button></div>
      </section>
    </div>
  );
}

export function PurchaseOperationDialog({ provider, onClose, onAccept }) {
  return (
    <div className="module-dialog-backdrop">
      <section
        className="module-dialog purchase-operation-dialog"
        role="dialog"
        aria-modal="true"
      >
        <header className="module-dialog-titlebar">
          <strong>TIPO DE OPERACIÓN</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="operation-form">
          <label>
            Tipo de operación
            <select defaultValue="Compra">
              <option>Compra</option>
              <option>Nota de entrega</option>
              <option>Orden de compra</option>
              <option>Documento en espera</option>
              <option>Solicitud de cotización</option>
              <option>Pedido</option>
            </select>
          </label>
          <label>
            Proveedor
            <div className="operation-readonly">{provider?.name ?? ""}</div>
          </label>
          <label>
            Número
            <input />
          </label>
          <label>
            Orden de compra
            <input />
          </label>
          <label>
            Fecha emisión
            <input type="date" defaultValue={todayValue()} />
          </label>
          <label>
            Ordenado
            <select defaultValue="ORIGINAL">
              <option>ORIGINAL</option>
              <option>ALFABÉTICO</option>
            </select>
          </label>
        </div>
        <div className="module-dialog-footer">
          <button type="button" onClick={onAccept}>
            Aceptar
          </button>
          <button type="button" onClick={onClose}>
            Salir
          </button>
        </div>
      </section>
    </div>
  );
}

function calculateCartTotals(cart, provider) {
  const subtotal = cart.reduce((sum, item) => sum + lineTotal(item), 0);
  const total = subtotal;
  // El costo unitario incluye IVA: total renglones = base sin IVA.
  const lines = cart.reduce(
    (sum, item) =>
      sum + netFromGross(lineTotal(item), item.product?.taxRate),
    0,
  );
  const taxes = Math.round((total - lines) * 100) / 100;
  const explicitRate = Number(provider?.withholdingRate ?? 0);
  const textRate = Number(
    String(provider?.withholdingType ?? "")
      .match(/[0-9]+(?:[.,][0-9]+)?/)?.[0]
      ?.replace(",", ".") ?? 0,
  );
  const retentionRate = Math.min(100, Math.max(0, explicitRate || textRate));
  const minimumBase = Math.max(0, Number(provider?.withholdingMinimumBase ?? 0));
  const appliesRetention =
    !provider?.isSelfWithholding &&
    (provider?.hasIslrWithholding || Boolean(provider?.withholdingType)) &&
    retentionRate > 0 &&
    subtotal >= minimumBase;
  const retentionAmount = appliesRetention
    ? Number((subtotal * retentionRate / 100).toFixed(2))
    : 0;
  return {
    quantity: cart.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    subtotal,
    lines: Math.round(lines * 100) / 100,
    taxes,
    total,
    retentionRate: appliesRetention ? retentionRate : 0,
    retentionAmount,
    payableTotal: Number((total - retentionAmount).toFixed(2)),
  };
}

function lineTotal(item) {
  return Number(item.quantity ?? 0) * Number(item.unitCost ?? 0);
}

function defaultCost(product) {
  const activeCost = product.costs?.find(
    (cost) => cost.isActive !== false,
  )?.cost;
  return Number(activeCost ?? product.cost ?? product.averageCost ?? 0);
}

const purchaseUnitLabels = {
  UND: "UND",
  PAQUETE: "PAQ",
  CAJA: "CAJA",
  KG: "KG",
  G: "G",
  LB: "LB",
  L: "L",
  ML: "ML",
};

function purchaseUnitLabel(unit) {
  return purchaseUnitLabels[String(unit).toUpperCase()] ?? String(unit);
}

function normalizePurchaseUnit(unit) {
  return String(unit ?? "UND").toUpperCase();
}

function getPurchaseUnitOptions(product) {
  const baseUnit = normalizePurchaseUnit(
    product?.unit ?? product?.unitOfMeasure ?? "UND",
  );
  const profile = product?.packagingProfile;
  const unitsPerPackage = Number(profile?.unitsPerPackage ?? 0);
  const packagesPerBox = Number(profile?.packagesPerBox ?? 0);
  const options = [baseUnit];

  if (baseUnit === "UND" && unitsPerPackage > 0) options.push("PAQUETE");
  if (
    (baseUnit === "UND" || baseUnit === "PAQUETE") &&
    unitsPerPackage > 0 &&
    packagesPerBox > 0
  ) {
    options.push("CAJA");
  }

  return [...new Set(options)];
}

function getDefaultPurchaseUnit(product) {
  const options = getPurchaseUnitOptions(product);
  const preferredPrice = product?.prices?.find(
    (price) => price.isActive !== false && price.isDefault && options.includes(price.unit),
  );
  if (preferredPrice) return normalizePurchaseUnit(preferredPrice.unit);

  const preferredCost = product?.costs?.find(
    (cost) => cost.isActive !== false && options.includes(cost.unit),
  );
  if (preferredCost) return normalizePurchaseUnit(preferredCost.unit);

  return options[0] ?? "UND";
}

function defaultCostForUnit(product, unit) {
  const normalizedUnit = normalizePurchaseUnit(unit);
  const matchingCost = product?.costs?.find(
    (cost) =>
      cost.isActive !== false && normalizePurchaseUnit(cost.unit) === normalizedUnit,
  );
  if (matchingCost) return Number(matchingCost.cost ?? 0);

  const matchingPrice = product?.prices?.find(
    (price) =>
      price.isActive !== false && normalizePurchaseUnit(price.unit) === normalizedUnit,
  );
  if (matchingPrice) return Number(matchingPrice.price ?? 0);

  return defaultCost(product);
}

function convertPurchaseQuantityToBase(quantity, unit, product) {
  const amount = Number(quantity ?? 0);
  if (!Number.isFinite(amount)) return 0;
  const normalizedUnit = normalizePurchaseUnit(unit);
  const baseUnit = normalizePurchaseUnit(
    product?.unit ?? product?.unitOfMeasure ?? "UND",
  );
  if (normalizedUnit === baseUnit) return amount;
  if (baseUnit !== "UND") return amount;

  const unitsPerPackage = Number(product?.packagingProfile?.unitsPerPackage ?? 0);
  const packagesPerBox = Number(product?.packagingProfile?.packagesPerBox ?? 0);
  if (normalizedUnit === "PAQUETE" && unitsPerPackage > 0) {
    return amount * unitsPerPackage;
  }
  if (normalizedUnit === "CAJA" && unitsPerPackage > 0 && packagesPerBox > 0) {
    return amount * unitsPerPackage * packagesPerBox;
  }
  return amount;
}

function formatRate(value) {
  return String(Number(Number(value ?? 0).toFixed(2))).replace(".", ",");
}

function formatQuantity(value) {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(3);
}

function productName(item) {
  return item?.name ?? item?.description ?? item?.description1 ?? "";
}

function productCode(item) {
  return item?.code ?? item?.codigo ?? String(item?.id ?? "");
}

function productStock(item) {
  return Number(item?.stock ?? item?.existence ?? item?.inventory ?? 0);
}

function warehouseName(warehouse) {
  const record = warehouse?.warehouse ?? warehouse;
  return (
    record?.name ??
    record?.location ??
    record?.description ??
    record?.nombre ??
    record?.warehouseName ??
    (record?.id ? "Bodega #" + record.id : "—")
  );
}

function toDateInputValue(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function orderNumber(order) {
  return order?.consecutive ?? order?.number ?? order?.id ?? "";
}

function purchaseOrderDate(order) {
  return order?.orderedAt ?? order?.createdAt;
}

function isActive(item) {
  return (
    item?.isActive !== false &&
    item?.active !== false &&
    item?.status !== "INACTIVO"
  );
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el documento."));
    reader.readAsDataURL(file);
  });
}

function formatDate(value) {
  if (!value) return "—";
  const normalizedValue =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value;
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

async function extractQuoteText(file, onProgress) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return extractPdfQuoteText(file, onProgress);
  }
  return recognizeQuoteImage(file, onProgress);
}

async function extractPdfQuoteText(file, onProgress) {
  configurePdfWorker();
  const pdfDocument = await pdfjsLib.getDocument({
    data: await file.arrayBuffer(),
  }).promise;
  const pages = Math.min(pdfDocument.numPages, 5);
  const pageTexts = [];
  for (let index = 1; index <= pages; index += 1) {
    const page = await pdfDocument.getPage(index);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    if (text) pageTexts.push(text);
    onProgress?.(Math.round((index / pages) * 100));
  }
  if (pageTexts.join("\n").trim().length >= 30) return pageTexts.join("\n");

  // Los PDF escaneados no tienen capa de texto: procesa la primera página.
  const page = await pdfDocument.getPage(1);
  const viewport = page.getViewport({ scale: 1.65 });
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return recognizeQuoteImage(canvas, onProgress);
}

async function recognizeQuoteImage(image, onProgress) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa", undefined, {
    logger: (message) => {
      if (message.status === "recognizing text")
        onProgress?.(Math.round(message.progress * 100));
    },
  });
  try {
    const result = await worker.recognize(image);
    return result.data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

function parseQuoteText(text, fileName) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fullText = lines.join(" ");
  const supplier = extractSupplier(lines, fullText);
  const documentNumber =
    fullText.match(
      /(?:No\.?|Nro\.?|Numero|Número|Documento)\s*[:#-]?\s*((?:COT(?:IZ)?|OC)[\s:#-]*[A-Z0-9/-]*\d[A-Z0-9/-]*)/i,
    )?.[1] ||
    fullText.match(/(?:COT(?:IZ)?|OC)[\s:#-]*[A-Z0-9/-]*\d[A-Z0-9/-]*/i)?.[0] ||
    "";
  const expectedAt = parseOcrDate(
    fullText.match(/(?:fecha|date)\s*[:#-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1],
  );
  return {
    fileName,
    supplier,
    documentNumber,
    expectedAt,
    items: parseQuoteItems(fullText, lines),
    text: lines.join("\n"),
  };
}

function parseQuoteItems(fullText, lines = []) {
  const normalizedText = String(fullText ?? "").replace(/\s+/g, " ").trim();
  const tableHeader = normalizedText.match(/\b(?:CODIGO|C[ÓO]DIGO)\b.*?\bTOTAL\b/i);
  const tableText = tableHeader
    ? normalizedText.slice(tableHeader.index + tableHeader[0].length)
    : normalizedText;
  const codePattern = tableHeader
    ? "[A-Z0-9][A-Z0-9_-]*\\d[A-Z0-9_-]*"
    : "[A-Z0-9][A-Z0-9_-]{3,}\\d[A-Z0-9_-]*";
  const rowPattern = new RegExp(
    `(?:^|\\s)((?!(?:COT(?:IZ)?|OC)(?:-|\\b))${codePattern})\\s+(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+\\$?\\s*([\\d.,]+)\\s+\\$?\\s*([\\d.,]+)(?=\\s+(?:[A-Z0-9][A-Z0-9_-]*\\d[A-Z0-9_-]*\\s)|\\s*(?:SUBTOTAL|TOTAL|OBSERVACIONES|$))`,
    "gi",
  );
  const linePattern = new RegExp(rowPattern.source, "i");
  const parseMatch = (match) => {
    if (!match) return null;
    const description = cleanOcrDescription(match[2]);
    if (!description || isOcrHeaderOrTotal(description)) return null;
    return {
      code: match[1].trim(),
      description,
      quantity: parseOcrNumber(match[3]),
      unitCost: parseOcrNumber(match[4]),
      total: parseOcrNumber(match[5]),
      unit: "UND",
    };
  };
  const lineItems = lines.map((line) => parseMatch(line.match(linePattern))).filter(Boolean);
  if (lineItems.length) return lineItems;
  const items = [];
  for (const match of tableText.matchAll(rowPattern)) {
    const item = parseMatch(match);
    if (item) items.push(item);
  }
  return items;
}

function findProductForOcrItem(item, products) {
  const code = String(item?.code ?? "").trim();
  const byCode = (products ?? []).find((product) =>
    [
      product?.id,
      productCode(product),
      ...(product?.barcodes ?? []).map((barcode) => barcode?.code),
    ].some((candidate) => sameOcrCode(candidate, code)),
  );
  if (byCode) return byCode;

  const description = normalizeOcrMatch(item?.description);
  if (!description) return null;
  return (products ?? []).find((product) => {
    const productText = normalizeOcrMatch(
      `${productName(product)} ${product?.description ?? ""} ${product?.description1 ?? ""}`,
    );
    return productText.includes(description) || description.includes(productText);
  });
}

function sameOcrCode(left, right) {
  const leftVariants = normalizeOcrCodeVariants(left);
  const rightVariants = normalizeOcrCodeVariants(right);
  return leftVariants.some((value) => rightVariants.includes(value));
}

function normalizeOcrCode(value) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) return "";
  return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, "") : normalized;
}

function normalizeOcrCodeVariants(value) {
  const normalized = normalizeOcrCode(value);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  const numeric = normalized.replace(/^P(?=\d)/, "");
  if (/^\d+$/.test(numeric)) variants.add(numeric.replace(/^0+(?=\d)/, ""));
  return [...variants];
}

function normalizeOcrMatch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function parseOcrNumber(value) {
  const raw = String(value ?? "").replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    return Number(raw.replace(new RegExp(`\\${thousandsSeparator}`, "g"), "").replace(decimalSeparator, ".")) || 0;
  }
  if (lastComma >= 0 && raw.length - lastComma - 1 <= 2) {
    return Number(raw.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (lastDot >= 0 && raw.length - lastDot - 1 === 3) {
    return Number(raw.replace(/\./g, "")) || 0;
  }
  return Number(raw.replace(/,/g, "")) || 0;
}

function cleanOcrDescription(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^(?:codigo|c[oó]digo|descripcion|descripci[oó]n)\s+/i, "")
    .trim();
}

function isOcrHeaderOrTotal(value) {
  return /^(?:codigo|c[oó]digo|descripcion|descripci[oó]n|subtotal|total|observaciones|costos?|cantidad|cant\.?)/i.test(value);
}

function extractSupplier(lines, fullText) {
  const labeled = lines.find((line) => /^(?:proveedor|supplier|vendedor)\s*[:#-]/i.test(line));
  if (labeled) return labeled.replace(/^(?:proveedor|supplier|vendedor)\s*[:#-]?\s*/i, "").trim();
  const titleIndex = lines.findIndex((line) => /cotizaci[oó]n\s+de\s+proveedor/i.test(line));
  if (titleIndex >= 0 && lines[titleIndex + 1]) return lines[titleIndex + 1];
  const inline = fullText.match(/cotizaci[oó]n\s+de\s+proveedor\s+(.+?)(?=\s+(?:NIT|No\.?|N[uú]mero|Fecha|CODIGO|C[ÓO]DIGO)\b)/i);
  return inline?.[1]?.trim() ?? "";
}

function parseOcrDate(value) {
  const match = String(value ?? "").match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return "";
  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function isAuthError(error) {
  return /sesión|inicia sesión|autentic|401/i.test(error?.message ?? "");
}
