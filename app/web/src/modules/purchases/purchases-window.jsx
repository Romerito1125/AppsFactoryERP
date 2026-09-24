import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Eye,
  FileText,
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

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

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

function invalidatePurchasesDataCache() {
  purchasesDataPromise = undefined;
  purchasesDataSnapshot = undefined;
}

function loadPurchasesData() {
  if (purchasesDataSnapshot) return Promise.resolve(purchasesDataSnapshot);
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
    setExternalReference("");
    setExpectedAt("");
    setCart([]);
    setDocumentAttachment(null);
    setError("");
    setNotice("");
  }

  function openLookup(type) {
    setError("");
    setLookupType(type);
  }

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
        taxRate: Number(product.taxRate ?? parsedItem.taxRate ?? 0),
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
          taxRate: Number(item.taxRate ?? item.product?.taxRate ?? 0),
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
        taxRate: Number(product.taxRate ?? 0),
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
         taxRate: Number(item.taxRate ?? 0),
       })),
      };
      const saved = editingPurchaseId
        ? await apiClient.patch("/compras/" + editingPurchaseId, body)
        : await apiClient.post("/compras", body);
      setOrders((current) =>
        editingPurchaseId
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      );
      invalidatePurchasesDataCache();
     setCart([]);
      setNotice(
        "Compra " +
          orderNumber(saved) +
          (editingPurchaseId ? " actualizada" : " guardada") +
          " correctamente.",
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
            totals={cartTotals}
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
            onRemoveItem={removeCartItem}
            onSave={savePurchase}
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
          <PurchaseReportsPanel orders={orders} />
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
  onRemoveItem,
  onSave,
}) {
  const isOrder = view === "orders";
  const rows = Math.max(15, cart.length + 5);
  return (
    <div className="purchase-document-shell">
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
            <label htmlFor="purchase-expected-at">Entrega prevista</label>
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
              <th>Total</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {cart.map((item) => (
              <tr key={item.productId}>
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
                  />
                </td>
                <td className="number-cell">
                  {formatCurrency(lineTotal(item))}
                </td>
                <td>
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
                  <td colSpan={isOrder ? 8 : 7}>&nbsp;</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <div className="purchase-document-footer">
        <button
          type="button"
          className="purchase-add-product"
          onClick={() => onOpenLookup("products")}
        >
          <Plus size={14} /> Agregar producto
        </button>
        <span className="purchase-footer-hint">
          La tabla permanece visible mientras agregas productos · F5 consulta
          productos
        </span>
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
    </div>
  );
}

function PurchaseTotalsPanel({ title, totals }) {
  return (
    <aside className="purchase-totals-panel">
      <h2>{title}</h2>
      <div className="purchase-number-row">
        <span>Nº</span>
        <strong>{totals.number ?? ""}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Total cantidad o piezas</span>
        <strong>{totals.quantity}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Total renglones</span>
        <strong>{formatCurrency(totals.subtotal)}</strong>
      </div>
      <div className="purchase-number-row">
        <span>Impuestos</span>
        <strong>{formatCurrency(totals.tax)}</strong>
      </div>
      {totals.retentionAmount > 0 && (
        <div className="purchase-number-row">
          <span>Retención ({formatQuantity(totals.retentionRate)}%)</span>
          <strong>-{formatCurrency(totals.retentionAmount)}</strong>
        </div>
      )}
      <div className="purchase-number-row purchase-grand-total">
        <span>Total a pagar</span>
        <strong>{formatCurrency(totals.payableTotal ?? totals.total)}</strong>
      </div>
    </aside>
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

function PurchaseReportsPanel({ orders }) {
  const total = orders.reduce(
    (sum, order) => sum + Number(order.total ?? 0),
    0,
  );
  const pending = orders.filter((order) =>
    ["BORRADOR", "ORDENADA"].includes(order.status),
  ).length;
  return (
    <div className="purchase-report-shell">
      <div className="purchase-list-heading">
        <div>
          <span className="purchase-section-kicker">MÓDULO DE COMPRAS</span>
          <h2>REPORTES</h2>
        </div>
      </div>
      <div className="purchase-report-cards">
        <MetricCard label="Compras registradas" value={orders.length} />
        <MetricCard label="Pendientes de recibir" value={pending} />
        <MetricCard label="Valor acumulado" value={formatCurrency(total)} />
      </div>
      <div className="purchase-report-table-wrap">
        <table className="purchase-table">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Operaciones</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(statusLabels).map((status) => {
              const rows = orders.filter((order) => order.status === status);
              return (
                <tr key={status}>
                  <td>{statusLabels[status]}</td>
                  <td>{rows.length}</td>
                  <td className="number-cell">
                    {formatCurrency(
                      rows.reduce(
                        (sum, order) => sum + Number(order.total ?? 0),
                        0,
                      ),
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="purchase-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

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
                    {type === "warehouses" ? "Nombre del depósito" : "Descripción"}
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
              placeholder="Código, descripción o referencia"
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
      taxRate: item.taxRate ?? item.product?.taxRate ?? 0,
    })),
    order.provider,
  );
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
              <tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Costo</th><th>Total</th></tr>
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
          {Number(order.retentionAmount ?? totals.retentionAmount) > 0 && (
            <div className="purchase-pdf-total purchase-pdf-retention">
              <span>Retención ({formatQuantity(order.retentionRate ?? totals.retentionRate)}%)</span>
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
          <strong>NUEVO PRODUCTO EN LA COMPRA</strong>
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
          <label><span>IVA %</span><input type="number" min="0" step="0.01" value={draft.taxRate} onChange={(event) => update("taxRate", event.target.value)} /></label>
          <label><span>Código de barras</span><input value={draft.barcode} onChange={(event) => update("barcode", event.target.value)} /></label>
          <label><span>Descripción</span><input value={draft.description} onChange={(event) => update("description", event.target.value)} /></label>
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
  const tax = cart.reduce(
    (sum, item) => sum + lineTotal(item) * (Number(item.taxRate ?? 0) / 100),
    0,
  );
  const total = subtotal + tax;
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
    tax,
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
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const pdfDocument = await pdfjs.getDocument({
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
