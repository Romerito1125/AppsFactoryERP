import { useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  Check,
  ChevronDown,
  Heart,
  LoaderCircle,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Star,
  Trash2,
  UserRound,
  Warehouse,
} from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { NotificationBell } from "@/components/desktop/notification-center";
import { TransientMessage } from "@/components/desktop/transient-message";

import "./pos-window.css";

const EMPTY_CART = [];
const CLIENT_TYPE_LABELS = {
  MAYORISTA: "Mayorista",
  MINORISTA: "Minorista",
};
const POS_CLIENT_STORAGE_KEY = "mmm-pos-client-id";
const POS_WAREHOUSE_STORAGE_KEY = "mmm-pos-warehouse-id";
const POS_SELLER_STORAGE_KEY = "mmm-pos-seller-id";

export function PosWorkspace({ session, onRequestLogin, onOpenNotification }) {
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [offerPrices, setOfferPrices] = useState({});
  const [offerPricingLoading, setOfferPricingLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(() => readStoredSelection(POS_CLIENT_STORAGE_KEY));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(() => readStoredSelection(POS_WAREHOUSE_STORAGE_KEY));
  const [selectedSellerId, setSelectedSellerId] = useState(() => readStoredSelection(POS_SELLER_STORAGE_KEY));
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [saleMode, setSaleMode] = useState("CONTADO");
  const [creditDueDate, setCreditDueDate] = useState(defaultDueDate());
  const [cart, setCart] = useState(EMPTY_CART);
  const [searchTerm, setSearchTerm] = useState("");
  const [barcode, setBarcode] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [saleConfirmation, setSaleConfirmation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const searchRef = useRef(null);
  const barcodeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) setLoading(true);
    }, 0);

    Promise.allSettled([
      apiClient.getAllPages("/clientes", { estado: "activos" }),
      apiClient.getAllPages("/productos", { estado: "activos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
      apiClient.getAllPages("/cuentas-bancarias", { estado: "activos" }),
      apiClient.get("/usuarios/vendedores"),
      apiClient.get("/productos/favoritos/mios"),
    ]).then((results) => {
      if (cancelled) return;
      const [clientsResult, productsResult, warehousesResult, accountsResult, sellersResult, favoritesResult] = results;

      if (clientsResult.status === "fulfilled") {
        const nextClients = clientsResult.value.filter(isActive);
        setClients(nextClients);
        setSelectedClientId((current) => nextClients.some((client) => String(client.id) === String(current)) ? String(current) : "");
      }
      if (productsResult.status === "fulfilled") setProducts(productsResult.value.filter(isSaleableProduct));
      if (warehousesResult.status === "fulfilled") {
        const nextWarehouses = warehousesResult.value.filter(isActive);
        setWarehouses(nextWarehouses);
        const storedWarehouseId = readStoredSelection(POS_WAREHOUSE_STORAGE_KEY);
        const preferredWarehouse = nextWarehouses.find((warehouse) => String(warehouse.id) === String(storedWarehouseId))
          ?? nextWarehouses.find((warehouse) => warehouse.isDefault || String(warehouse.id) === String(session?.warehouseId));
        const nextWarehouseId = String(preferredWarehouse?.id ?? nextWarehouses[0]?.id ?? "");
        setSelectedWarehouseId(nextWarehouseId);
        persistSelection(POS_WAREHOUSE_STORAGE_KEY, nextWarehouseId);
      }
      if (accountsResult.status === "fulfilled") {
        const nextAccounts = accountsResult.value.filter(isActive);
        setBankAccounts(nextAccounts);
        setSelectedAccountId(String(nextAccounts[0]?.id ?? ""));
      }
      if (sellersResult.status === "fulfilled") {
        const nextSellers = sellersResult.value.filter(isActive).filter(isSalesUser);
        setSellers(nextSellers);
        const storedSellerId = readStoredSelection(POS_SELLER_STORAGE_KEY);
        const currentUserId = sessionUserId(session);
        const preferredSeller = nextSellers.find((user) => String(user.id) === String(storedSellerId))
          ?? nextSellers.find((user) => String(user.id) === String(currentUserId))
          ?? nextSellers[0];
        const nextSellerId = String(preferredSeller?.id ?? "");
        setSelectedSellerId(nextSellerId);
        persistSelection(POS_SELLER_STORAGE_KEY, nextSellerId);
      }
      if (favoritesResult.status === "fulfilled") setFavoriteIds(favoritesResult.value.map((product) => String(product.id)));

      const requiredFailure = [clientsResult, productsResult, warehousesResult, sellersResult].find((result) => result.status === "rejected");
      if (requiredFailure) {
        setError(`No se pudo cargar la caja: ${requiredFailure.reason?.message ?? "verifica la conexión"}`);
        if (isAuthError(requiredFailure.reason)) onRequestLogin?.();
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [onRequestLogin, session]);

  useEffect(() => {
    if (loading || !selectedClientId || !products.length) {
      setOfferPrices({});
      setOfferPricingLoading(false);
      return undefined;
    }

    let cancelled = false;
    const client = clients.find((item) => String(item.id) === String(selectedClientId));
    const items = products
      .map((product) => {
        const price = priceForClient(product, client);
        return price
          ? { productId: Number(product.id), productPriceId: Number(price.id), quantity: 1, unitPrice: Number(price.price) }
          : null;
      })
      .filter(Boolean);

    if (!items.length) {
      setOfferPrices({});
      return undefined;
    }

    setOfferPricingLoading(true);
    apiClient.post("/ofertas/aplicables", { clientId: Number(selectedClientId), items })
      .then((response) => {
        if (cancelled) return;
        const nextPrices = {};
        for (const item of response?.items ?? []) {
          const effective = Number(item.effectiveUnitPrice);
          if (Number.isFinite(effective)) nextPrices[String(item.productId)] = effective;
        }
        setOfferPrices(nextPrices);
        setCart((current) => current.map((line) => {
          const basePrice = priceForClient(line.product, client);
          const effective = nextPrices[String(line.productId)];
          return basePrice
            ? { ...line, productPriceId: basePrice.id, appliedUnitPrice: Number.isFinite(effective) ? effective : null }
            : line;
        }));
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message ?? "No se pudieron actualizar los precios del cliente.");
      })
      .finally(() => {
        if (!cancelled) setOfferPricingLoading(false);
      });

    return () => { cancelled = true; };
  }, [clients, loading, products, selectedClientId]);

  useEffect(() => {
    const keepAlive = window.setInterval(() => {
      apiClient.get("/auth/perfil").catch((requestError) => {
        if (isAuthError(requestError)) onRequestLogin?.();
      });
    }, 240000);
    return () => window.clearInterval(keepAlive);
  }, [onRequestLogin]);

  useEffect(() => {
    if (loading) return undefined;
    const focusBarcode = window.setTimeout(() => barcodeRef.current?.focus(), 0);
    return () => window.clearTimeout(focusBarcode);
  }, [loading]);

  async function refreshSoldProducts(productIds) {
    const uniqueProductIds = [...new Set(productIds.map(Number).filter(Boolean))];
    if (!uniqueProductIds.length) return false;
    const results = await Promise.allSettled(uniqueProductIds.map((productId) => apiClient.get(`/productos/${productId}`)));
    const refreshedProducts = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (refreshedProducts.length) {
      const refreshedById = new Map(refreshedProducts.map((product) => [String(product.id), product]));
      setProducts((current) => current.map((product) => refreshedById.get(String(product.id)) ?? product).filter(isSaleableProduct));
    }
    const inventoryUpdated = results.length > 0 && results.every((result) => result.status === "fulfilled");
    if (!inventoryUpdated && results.some((result) => result.status === "rejected" && isAuthError(result.reason))) onRequestLogin?.();
    return inventoryUpdated;
  }

  function applyOptimisticStock(soldLines) {
    const soldByProduct = new Map(soldLines.map((line) => [String(line.productId), Number(line.quantity)]));
    setProducts((current) => current.map((product) => {
      const soldQuantity = soldByProduct.get(String(product.id));
      if (!soldQuantity || !selectedWarehouseId) return product;
      return {
        ...product,
        warehouses: (product.warehouses ?? []).map((warehouse) => String(warehouse.warehouseId ?? warehouse.warehouse?.id) === String(selectedWarehouseId)
          ? { ...warehouse, quantity: Math.max(0, Number(warehouse.quantity ?? 0) - soldQuantity) }
          : warehouse),
      };
    }));
  }

  const selectedClient = clients.find((client) => String(client.id) === String(selectedClientId));
  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === String(selectedWarehouseId));
  const favoriteSet = useMemo(() => new Set(favoriteIds.map(String)), [favoriteIds]);
  const visibleProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return products
      .filter((product) => !favoritesOnly || favoriteSet.has(String(product.id)))
      .filter((product) => !query || productSearchText(product).includes(query))
      .slice(0, 60);
  }, [favoriteSet, favoritesOnly, products, searchTerm]);
  const cartTotals = useMemo(() => calculateTotals(cart), [cart]);

  function handleClientChange(nextClientId) {
    const nextClient = clients.find((client) => String(client.id) === String(nextClientId));
    setSelectedClientId(String(nextClientId));
    persistSelection(POS_CLIENT_STORAGE_KEY, nextClientId);
    setCart((current) => current.map((item) => {
      const price = priceForClient(item.product, nextClient);
      if (!price) return item;
      const available = stockForWarehouse(item.product, selectedWarehouseId, price);
      return { ...item, productPriceId: price.id, quantity: Math.min(item.quantity, available) };
    }).filter((item) => item.quantity > 0));
  }

  function handleWarehouseChange(nextWarehouseId) {
    setSelectedWarehouseId(String(nextWarehouseId));
    persistSelection(POS_WAREHOUSE_STORAGE_KEY, nextWarehouseId);
    setCart((current) => current.flatMap((item) => {
      const price = getPriceById(item.product, item.productPriceId) ?? priceForClient(item.product, null);
      const available = stockForWarehouse(item.product, nextWarehouseId, price);
      if (available <= 0) return [];
      return [{ ...item, quantity: Math.min(item.quantity, available) }];
    }));
  }

  function handleSellerChange(nextSellerId) {
    setSelectedSellerId(String(nextSellerId));
    persistSelection(POS_SELLER_STORAGE_KEY, nextSellerId);
  }

  function addProduct(product) {
    const price = priceForClient(product, selectedClient);
    if (!price) {
      setError(`El producto ${product.name} no tiene un precio activo.`);
      return;
    }
    const available = stockForWarehouse(product, selectedWarehouseId, price);
    const existing = cart.find((item) => item.productId === product.id);
    if (available <= 0) {
      setError(`${product.name} no tiene existencias en la bodega seleccionada.`);
      return;
    }
    if (existing && existing.quantity >= available) {
      setError(`No puedes agregar más de ${available} unidad${available === 1 ? "" : "es"} de ${product.name}.`);
      return;
    }
    setSaleConfirmation(null);
    const appliedUnitPrice = offerPrices[String(product.id)];
    setCart((current) => {
      if (existing) return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1, productPriceId: price.id, appliedUnitPrice: Number.isFinite(appliedUnitPrice) ? appliedUnitPrice : null } : item);
      return [...current, { product, productId: product.id, productPriceId: price.id, appliedUnitPrice: Number.isFinite(appliedUnitPrice) ? appliedUnitPrice : null, quantity: 1 }];
    });
    setError("");
  }

  function updateQuantity(productId, quantity) {
    setCart((current) => current.flatMap((item) => {
      if (item.productId !== productId) return [item];
      if (quantity <= 0) return [];
      const price = getPriceById(item.product, item.productPriceId) ?? priceForClient(item.product, null);
      const available = stockForWarehouse(item.product, selectedWarehouseId, price);
      return available > 0 ? [{ ...item, quantity: Math.min(quantity, available) }] : [];
    }));
  }

  function updatePrice(productId, productPriceId) {
    setCart((current) => current.map((item) => {
      if (item.productId !== productId) return item;
      const price = getPriceById(item.product, productPriceId);
      const available = stockForWarehouse(item.product, selectedWarehouseId, price);
      return { ...item, productPriceId: Number(productPriceId), quantity: Math.min(item.quantity, available) };
    }).filter((item) => item.quantity > 0));
  }

  async function resolveBarcode(event) {
    event?.preventDefault();
    const code = barcode.trim();
    if (!code) {
      barcodeRef.current?.focus();
      return;
    }
    const normalizedCode = code.toLowerCase();
    const localProduct = products.find((product) => productCode(product).toLowerCase() === normalizedCode || (product.barcodes ?? []).some((item) => item.code?.toLowerCase() === normalizedCode));
    setBarcode("");
    if (localProduct) {
      addProduct(localProduct);
      window.setTimeout(() => barcodeRef.current?.focus(), 0);
      return;
    }
    setActionLoading("barcode");
    try {
      const product = await apiClient.get(`/productos/codigo-barras/${encodeURIComponent(code)}`);
      if (!isSaleableProduct(product)) throw new Error("El producto escaneado no tiene un precio activo.");
      setProducts((current) => current.some((item) => item.id === product.id) ? current : [product, ...current]);
      addProduct(product);
    } catch (requestError) {
      setError(requestError.message || "No se encontró el código de barras.");
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setActionLoading("");
      window.setTimeout(() => barcodeRef.current?.focus(), 0);
    }
  }

  async function toggleFavorite(product) {
    const productId = String(product.id);
    const isFavorite = favoriteSet.has(productId);
    setActionLoading(`favorite-${productId}`);
    try {
      if (isFavorite) await apiClient.delete(`/productos/${product.id}/favorito`);
      else await apiClient.put(`/productos/${product.id}/favorito`);
      setFavoriteIds((current) => isFavorite ? current.filter((id) => id !== productId) : [...current, productId]);
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setActionLoading("");
      barcodeRef.current?.focus();
    }
  }

  async function saveInvoice() {
    if (!cart.length) return setError("Agrega al menos un producto para facturar.");
    if (!selectedSellerId) return setError("Selecciona quién realiza la venta.");
    if (saleMode === "CONTADO" && !selectedAccountId) return setError("Selecciona una cuenta de recaudo.");
    if (saleMode === "CREDITO" && !creditDueDate) return setError("Selecciona la fecha de vencimiento.");
    setSaving(true);
    setError("");
    try {
      const invoice = await apiClient.post("/facturas", {
        clientId: selectedClientId ? Number(selectedClientId) : undefined,
        createdByUserId: Number(selectedSellerId),
        warehouseId: selectedWarehouseId ? Number(selectedWarehouseId) : undefined,
        source: "POS",
        saleMode,
        items: cart.map((item) => ({ productId: item.productId, productPriceId: item.productPriceId, warehouseId: selectedWarehouseId ? Number(selectedWarehouseId) : undefined, quantity: item.quantity })),
      });
      if (saleMode === "CONTADO") {
        await apiClient.post("/movimientos-bancarios/ingreso", { bankAccountId: Number(selectedAccountId), amount: Number(invoice.total), invoiceId: invoice.id, description: `Recaudo venta ${invoice.consecutive}` });
      } else {
        await apiClient.post(`/facturas/${invoice.id}/credito`, { dueDate: new Date(`${creditDueDate}T00:00:00`).toISOString() });
      }
      const soldLines = cart.map((item) => ({
        productId: item.productId,
        quantity: saleStockQuantity(item.product, getPriceById(item.product, item.productPriceId), item.quantity),
      }));
      const soldProductIds = soldLines.map((line) => line.productId);
      applyOptimisticStock(soldLines);
      setCart(EMPTY_CART);
      setSaleConfirmation({ consecutive: invoice.consecutive, total: invoice.total, stockStatus: "updating" });
      window.dispatchEvent(new Event("notifications:refresh"));
      void refreshSoldProducts(soldProductIds).then((inventoryUpdated) => {
        setSaleConfirmation((current) => current ? { ...current, stockStatus: inventoryUpdated ? "updated" : "pending" } : current);
      });
    } catch (requestError) {
      setError(requestError.message);
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setSaving(false);
      window.setTimeout(() => barcodeRef.current?.focus(), 0);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setSearchTerm("");
      setBarcode("");
      barcodeRef.current?.focus();
    }
    if (event.key === "F2") {
      event.preventDefault();
      searchRef.current?.focus();
    }
    if (event.key === "F6") {
      event.preventDefault();
      barcodeRef.current?.focus();
    }
    if (event.key === "Enter" && document.activeElement === searchRef.current && visibleProducts.length === 1) {
      event.preventDefault();
      addProduct(visibleProducts[0]);
      window.setTimeout(() => barcodeRef.current?.focus(), 0);
    }
  }

  return (
    <section className="new-pos-page" onKeyDown={handleKeyDown} aria-label="Caja POS Mundo Tienda">
      <PosPageHeader
        session={session}
        onOpenCenter={() => window.location.assign("/?notifications=1")}
        onOpenNotification={onOpenNotification}
        onRequestLogin={onRequestLogin}
      />
      <div className="new-pos-content">
        {loading ? <PosLoadingState /> : (
          <BillingView
            clients={clients}
            warehouses={warehouses}
            sellers={sellers}
            selectedClientId={selectedClientId}
            selectedWarehouseId={selectedWarehouseId}
            selectedSellerId={selectedSellerId}
            selectedAccountId={selectedAccountId}
            selectedWarehouse={selectedWarehouse}
            bankAccounts={bankAccounts}
            products={visibleProducts}
            selectedClient={selectedClient}
            offerPrices={offerPrices}
            cart={cart}
            totals={cartTotals}
            favoriteSet={favoriteSet}
            favoritesOnly={favoritesOnly}
            searchTerm={searchTerm}
            barcode={barcode}
            saleMode={saleMode}
            creditDueDate={creditDueDate}
            saving={saving}
            actionLoading={actionLoading}
            offerPricingLoading={offerPricingLoading}
            saleConfirmation={saleConfirmation}
            onDismissSaleConfirmation={() => setSaleConfirmation(null)}
            searchRef={searchRef}
            barcodeRef={barcodeRef}
            onClientChange={handleClientChange}
            onWarehouseChange={handleWarehouseChange}
            onSellerChange={handleSellerChange}
            onAccountChange={setSelectedAccountId}
            onSearch={setSearchTerm}
            onBarcode={setBarcode}
            onResolveBarcode={resolveBarcode}
            onToggleFavorites={() => setFavoritesOnly((current) => !current)}
            onAddProduct={addProduct}
            onToggleFavorite={toggleFavorite}
            onUpdateQuantity={updateQuantity}
            onUpdatePrice={updatePrice}
            onClearCart={() => setCart(EMPTY_CART)}
            onSaleModeChange={setSaleMode}
            onDueDateChange={setCreditDueDate}
            onSaveInvoice={saveInvoice}
          />
        )}
      </div>
      {error && (
        <TransientMessage
          className="new-pos-message is-error"
          role="alert"
          onDismiss={() => setError("")}
        >
          {error}
        </TransientMessage>
      )}
      <footer className="new-pos-footer new-pos-page-footer">
        <span><strong>Venta</strong> · {selectedWarehouse ? `Depósito ${selectedWarehouse.location ?? selectedWarehouse.id}` : "Sin depósito seleccionado"} · {selectedClient ? clientName(selectedClient) : "Sin cliente"}</span>
      </footer>
    </section>
  );
}

export function PosPageHeader({ session, onOpenCenter, onOpenNotification, onRequestLogin } = {}) {
  return (
    <header className="new-pos-page-header">
      <div className="new-pos-page-brand" aria-label="Mundo Tienda POS">
        <img src="/logo.jpeg" alt="Mundo Tienda" />
        <span>Mundo Tienda</span>
      </div>
      <div className="new-pos-page-heading">
        <span>OPERACIÓN COMERCIAL</span>
        <strong>CAJA POS</strong>
      </div>
      {session && (
        <div className="new-pos-page-actions">
          <NotificationBell
            session={session}
            onOpenCenter={onOpenCenter}
            onOpenNotification={onOpenNotification}
            onRequestLogin={onRequestLogin}
            compact
          />
        </div>
      )}
    </header>
  );
}

function BillingView({
  clients,
  warehouses,
  sellers,
  selectedClientId,
  selectedWarehouseId,
  selectedSellerId,
  selectedAccountId,
  selectedWarehouse,
  bankAccounts,
  products,
  selectedClient,
  offerPrices,
  cart,
  totals,
  favoriteSet,
  favoritesOnly,
  searchTerm,
  barcode,
  saleMode,
  creditDueDate,
  saving,
  actionLoading,
  offerPricingLoading,
  saleConfirmation,
  onDismissSaleConfirmation,
  searchRef,
  barcodeRef,
  onClientChange,
  onWarehouseChange,
  onSellerChange,
  onAccountChange,
  onSearch,
  onBarcode,
  onResolveBarcode,
  onToggleFavorites,
  onAddProduct,
  onToggleFavorite,
  onUpdateQuantity,
  onUpdatePrice,
  onClearCart,
  onSaleModeChange,
  onDueDateChange,
  onSaveInvoice,
}) {
  return (
    <div className="new-pos-billing-grid">
      <main className="new-pos-workbench">
        <section className="new-pos-operation-head">
          <div className="new-pos-operation-title">
            <div><span className="new-pos-eyebrow">OPERACIÓN PRINCIPAL</span><h2>Nueva venta</h2></div>
            <span className="new-pos-shortcuts"><kbd>F2</kbd> buscar <kbd>F6</kbd> barras <kbd>Enter</kbd> agregar</span>
          </div>
          <div className="new-pos-context-grid">
            <SearchableSelect label="Cliente" icon={<UserRound size={14} />} value={selectedClientId} onChange={onClientChange} placeholder="Sin cliente" options={[{ value: "", label: "Sin cliente" }, ...clients.map((client) => ({ value: client.id, label: `${clientName(client)} · ${CLIENT_TYPE_LABELS[client.clientType] ?? "Cliente"}` }))]} />
            <SearchableSelect label="Bodega / depósito" icon={<Warehouse size={14} />} value={selectedWarehouseId} onChange={onWarehouseChange} placeholder="Seleccionar depósito" options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouseName(warehouse)}${warehouse.isDefault ? " · Predeterminado" : ""}` }))} />
            <SearchableSelect label="Vendedor" icon={<UserRound size={14} />} value={selectedSellerId} onChange={onSellerChange} placeholder="Seleccionar vendedor" options={sellers.map((seller) => ({ value: seller.id, label: `${userName(seller)} · ${roleLabel(seller.role)}` }))} />
          </div>
          <div className="new-pos-search-row">
            <label className="new-pos-search-box"><Search size={17} /><input ref={searchRef} value={searchTerm} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar producto por nombre, código o marca…" aria-label="Buscar productos" /><kbd>F2</kbd></label>
            <form className="new-pos-barcode-box" onSubmit={onResolveBarcode}>
              <Barcode size={17} />
              <input ref={barcodeRef} autoFocus inputMode="numeric" value={barcode} onChange={(event) => onBarcode(event.target.value)} placeholder="Escanear código · lector listo" aria-label="Código de barras, lector listo" />
              <span className="new-pos-scanner-ready">LISTO</span>
              <kbd>F6</kbd>
              <button type="submit" disabled={actionLoading === "barcode"}>{actionLoading === "barcode" ? <LoaderCircle size={14} className="is-spinning" /> : <Plus size={14} />}</button>
            </form>
            <button type="button" className={`new-pos-filter-button ${favoritesOnly ? "is-active" : ""}`} onClick={onToggleFavorites}><Star size={15} fill={favoritesOnly ? "currentColor" : "none"} /> Favoritos</button>
          </div>
          {offerPricingLoading && selectedClient && <div className="new-pos-price-sync" role="status">Actualizando precio para {clientName(selectedClient)}…</div>}
        </section>

        <section className="new-pos-product-area" aria-label="Productos para agregar a la venta">
          <div className="new-pos-section-heading"><div><strong>{favoritesOnly ? "Productos favoritos" : "Productos disponibles"}</strong><span>{products.length} resultado{products.length === 1 ? "" : "s"} · selecciona para agregar al ticket</span></div></div>
          {products.length ? <div className="new-pos-product-grid">{products.map((product) => <ProductCard key={product.id} product={product} favorite={favoriteSet.has(String(product.id))} favoriteLoading={actionLoading === `favorite-${product.id}`} onAdd={onAddProduct} onToggleFavorite={onToggleFavorite} selectedWarehouseId={selectedWarehouse?.id} selectedClient={selectedClient} offerPrice={offerPrices[String(product.id)]} />)}</div> : <EmptyState icon={<Search size={22} />} title="No hay productos para esa búsqueda" detail="Prueba otro nombre, código o limpia el filtro de favoritos." />}
        </section>
      </main>

      <aside className="new-pos-ticket" aria-label="Ticket de venta">
        <div className="new-pos-ticket-heading"><div><span className="new-pos-eyebrow">TICKET ACTUAL</span><h2><ShoppingCart size={17} /> Venta <span>{cart.length} líneas</span></h2></div>{cart.length > 0 && <button type="button" className="new-pos-icon-button" onClick={onClearCart} title="Limpiar ticket"><Trash2 size={15} /></button>}</div>
        <div className="new-pos-ticket-lines">{cart.length ? cart.map((item) => <CartLine key={item.productId} item={item} onUpdateQuantity={onUpdateQuantity} onUpdatePrice={onUpdatePrice} />) : <EmptyState icon={<ShoppingCart size={26} />} title="Ticket vacío" detail="Agrega productos desde la búsqueda o escanea un código." />}</div>
        <div className="new-pos-ticket-bottom">
          <div className="new-pos-total-lines"><span>Subtotal <b>{formatCurrency(totals.subtotal)}</b></span><span>IVA <b>{formatCurrency(totals.taxes)}</b></span><span className="is-total">Total <strong>{formatCurrency(totals.total)}</strong></span></div>
          <div className="new-pos-payment-heading"><span>Forma de pago</span><div className="new-pos-payment-switch"><button type="button" className={saleMode === "CONTADO" ? "is-active" : ""} onClick={() => onSaleModeChange("CONTADO")}>Contado</button><button type="button" className={saleMode === "CREDITO" ? "is-active" : ""} onClick={() => onSaleModeChange("CREDITO")}>Crédito</button></div></div>
          {saleMode === "CONTADO" ? <label className="new-pos-field"><span>Cuenta de recaudo</span><select value={selectedAccountId} onChange={(event) => onAccountChange(event.target.value)}><option value="">Selecciona una cuenta</option>{bankAccounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.bankName}</option>)}</select></label> : <label className="new-pos-field"><span>Vencimiento</span><input type="date" value={creditDueDate} onChange={(event) => onDueDateChange(event.target.value)} /></label>}
          <div className="new-pos-ticket-actions"><button type="button" className="new-pos-primary-button" disabled={saving || !cart.length} onClick={onSaveInvoice}>{saving ? <LoaderCircle size={15} className="is-spinning" /> : <Check size={15} />} {saving ? "Procesando…" : "Emitir factura"}</button></div>
          {saleConfirmation?.consecutive && (
            <TransientMessage
              className="new-pos-sale-confirmation"
              role="status"
              messageKey={saleConfirmation.consecutive}
              onDismiss={onDismissSaleConfirmation}
            >
              <strong>Venta registrada correctamente</strong>
              <span>{saleConfirmation.consecutive} · {formatCurrency(saleConfirmation.total)}</span>
              <small>{saleConfirmation.stockStatus === "updating" ? "Actualizando existencias…" : saleConfirmation.stockStatus === "updated" ? "Existencias actualizadas" : "Venta guardada; revisa el stock cuando haya conexión."}</small>
            </TransientMessage>
          )}
        </div>
      </aside>
    </div>
  );
}

function SearchableSelect({ label, icon, value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const selectedOption = options.find((option) => String(option.value) === String(value));
  const visibleOptions = options
    .filter((option) => !query.trim() || option.label.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 50);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  function openSearch() {
    setOpen(true);
    setQuery("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function chooseOption(option) {
    onChange(String(option.value));
    setOpen(false);
    setQuery("");
  }

  function handleInputKeyDown(event) {
    if (event.key === "Enter" && visibleOptions[0]) {
      event.preventDefault();
      chooseOption(visibleOptions[0]);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      className={`new-pos-context-select new-pos-search-select ${open ? "is-open" : ""}`}
      ref={rootRef}
      onMouseDown={(event) => {
        if (!event.target.closest("input") && !event.target.closest(".new-pos-search-select-menu")) {
          event.preventDefault();
          openSearch();
        }
      }}
    >
      <span>{icon}{label}</span>
      <div className="new-pos-search-select-control">
        <input
          ref={inputRef}
          value={open ? query : selectedOption?.label ?? ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={open ? `Buscar ${label.toLowerCase()}…` : placeholder}
          aria-label={`Buscar ${label.toLowerCase()}`}
          aria-expanded={open}
          role="combobox"
        />
        <ChevronDown size={13} />
        {open && (
          <div className="new-pos-search-select-menu" role="listbox">
            {visibleOptions.length ? visibleOptions.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={String(option.value) === String(value)}
                className={String(option.value) === String(value) ? "is-selected" : ""}
                key={`${option.value}-${option.label}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseOption(option);
                }}
              >
                {option.label}
              </button>
            )) : <span className="new-pos-search-select-empty">No hay coincidencias</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, favorite, favoriteLoading, onAdd, onToggleFavorite, selectedWarehouseId, selectedClient, offerPrice }) {
  const catalogPrice = priceForClient(product, selectedClient);
  const price = Number.isFinite(Number(offerPrice)) ? { ...catalogPrice, price: Number(offerPrice), name: "Oferta aplicada" } : catalogPrice;
  const stock = stockForWarehouse(product, selectedWarehouseId, catalogPrice);
  const activePriceCount = activePrices(product).length;
  const outOfStock = stock <= 0;
  return <article className={`new-pos-product-card ${outOfStock ? "is-out-of-stock" : ""}`}>
    <button type="button" className={`new-pos-favorite-button ${favorite ? "is-active" : ""}`} onClick={() => onToggleFavorite(product)} disabled={favoriteLoading} aria-label={favorite ? `Quitar ${product.name} de favoritos` : `Agregar ${product.name} a favoritos`}><Heart size={14} fill={favorite ? "currentColor" : "none"} /></button>
    <button type="button" className="new-pos-product-main" onClick={() => onAdd(product)} disabled={outOfStock} aria-disabled={outOfStock}><div className="new-pos-product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <PackagePlus size={22} />}</div><div className="new-pos-product-info"><strong title={product.name}>{product.name}</strong><span>{product.brand || "Sin marca"} · {productCode(product)}</span><div><b>{formatCurrency(price?.price)}</b><em>{activePriceCount} precio{activePriceCount === 1 ? "" : "s"} activo{activePriceCount === 1 ? "" : "s"}</em></div><small className={outOfStock ? "is-empty" : ""}>{outOfStock ? "Sin existencias" : `${stock} disponibles`}</small></div></button>
    <div className="new-pos-product-actions"><button type="button" className="new-pos-add-button" onClick={() => onAdd(product)} disabled={outOfStock} aria-disabled={outOfStock}>{outOfStock ? "Sin existencias" : <><Plus size={14} /> Agregar</>}</button></div>
  </article>;
}

function CartLine({ item, onUpdateQuantity, onUpdatePrice }) {
  const catalogPrice = getPriceById(item.product, item.productPriceId) ?? priceForClient(item.product, null);
  const price = Number.isFinite(Number(item.appliedUnitPrice)) ? { ...catalogPrice, price: Number(item.appliedUnitPrice), name: "Oferta aplicada" } : catalogPrice;
  return <div className="new-pos-cart-line"><div className="new-pos-cart-line-top"><div><strong>{item.product.name}</strong><span>{productCode(item.product)}</span></div><strong>{formatCurrency(Number(price?.price ?? 0) * item.quantity)}</strong></div><div className="new-pos-cart-line-bottom"><div className="new-pos-quantity"><button type="button" onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)} aria-label="Disminuir"><Minus size={12} /></button><b>{item.quantity}</b><button type="button" onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)} aria-label="Aumentar"><Plus size={12} /></button></div><select value={item.productPriceId} onChange={(event) => onUpdatePrice(item.productId, event.target.value)} aria-label={`Precio de ${item.product.name}`}>{activePrices(item.product).map((option) => <option value={option.id} key={option.id}>{option.name} · {formatCurrency(option.price)}</option>)}</select></div></div>;
}

function PosLoadingState() {
  return <div className="new-pos-loading"><LoaderCircle size={24} className="is-spinning" /><strong>Preparando caja…</strong><span>Cargando catálogo, clientes y depósitos.</span></div>;
}

function EmptyState({ icon, title, detail }) {
  return <div className="new-pos-empty">{icon}<strong>{title}</strong><span>{detail}</span></div>;
}

function activePrices(product) {
  const now = Date.now();
  return (product?.prices ?? []).filter((price) => price.isActive !== false && (!price.startsAt || new Date(price.startsAt).getTime() <= now) && (!price.endsAt || new Date(price.endsAt).getTime() >= now));
}

function priceForClient(product, client) {
  const prices = activePrices(product);
  if (!prices.length) return null;
  const type = client?.clientType;
  const scored = prices.map((price) => {
    const name = String(price.name ?? "").toLowerCase();
    let score = price.isDefault ? 10 : 0;
    if (type === "MAYORISTA" && /mayor|wholesale|distrib/.test(name)) score += 50;
    if (type === "MINORISTA" && /minor|retail|detal|consumidor|final/.test(name)) score += 45;
    if (!type && /minor|retail|detal|consumidor|final/.test(name)) score += 20;
    return { price, score };
  });
  return scored.sort((left, right) => right.score - left.score || Number(left.price.id) - Number(right.price.id))[0]?.price ?? null;
}

function getPriceById(product, id) {
  return activePrices(product).find((price) => Number(price.id) === Number(id));
}

function productSearchText(product) {
  return `${product.id} ${productCode(product)} ${(product.barcodes ?? []).map((item) => item.code).join(" ")} ${product.name} ${product.brand ?? ""} ${product.productType?.name ?? ""}`.toLowerCase();
}

function productCode(product) {
  return product.primaryBarcode ?? product.barcodes?.find((item) => item.isPrimary)?.code ?? product.barcodes?.[0]?.code ?? `P-${product.id}`;
}

function stockForWarehouse(product, warehouseId, price) {
  const stock = product?.warehouses ?? [];
  const baseStock = warehouseId
    ? Number(stock.find((item) => String(item.warehouseId ?? item.warehouse?.id) === String(warehouseId))?.quantity ?? 0)
    : stock.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  if (!price) return baseStock;
  const baseUnitsPerSale = saleStockQuantity(product, price, 1);
  return baseUnitsPerSale > 0 ? Math.floor(baseStock / baseUnitsPerSale) : 0;
}

function saleStockQuantity(product, price, quantity) {
  const amount = Number(quantity ?? 0);
  const priceQuantity = Number(price?.quantity ?? 1);
  const priceUnit = price?.unit ?? product?.unit ?? "UND";
  const productUnit = product?.unit ?? "UND";
  if (!Number.isFinite(amount) || amount < 0 || priceQuantity <= 0) return 0;
  if (priceUnit === productUnit) return amount * priceQuantity;
  const unitsPerPackage = Number(product?.packagingProfile?.unitsPerPackage ?? 0);
  const packagesPerBox = Number(product?.packagingProfile?.packagesPerBox ?? 0);
  if (priceUnit === "PAQUETE" && productUnit === "UND" && unitsPerPackage > 0) {
    return amount * priceQuantity * unitsPerPackage;
  }
  if (priceUnit === "CAJA" && productUnit === "UND" && unitsPerPackage > 0 && packagesPerBox > 0) {
    return amount * priceQuantity * unitsPerPackage * packagesPerBox;
  }
  if (priceUnit === "CAJA" && productUnit === "PAQUETE" && packagesPerBox > 0) {
    return amount * priceQuantity * packagesPerBox;
  }
  return 0;
}

function calculateTotals(cart) {
  return cart.reduce((total, item) => {
    const catalogPrice = getPriceById(item.product, item.productPriceId) ?? priceForClient(item.product, null);
    const price = Number.isFinite(Number(item.appliedUnitPrice)) ? { ...catalogPrice, price: Number(item.appliedUnitPrice) } : catalogPrice;
    const subtotal = Number(price?.price ?? 0) * Number(item.quantity ?? 0);
    const taxes = subtotal * (Number(item.product.taxRate ?? 0) / 100);
    return { subtotal: total.subtotal + subtotal, taxes: total.taxes + taxes, total: total.total + subtotal + taxes };
  }, { subtotal: 0, taxes: 0, total: 0 });
}

function isSaleableProduct(product) {
  return product?.isActive !== false && product?.deletedAt == null && activePrices(product).length > 0;
}

function isActive(item) {
  return item?.isActive !== false && item?.deletedAt == null;
}

function clientName(client) {
  if (!client) return "Consumidor final";
  return client.name ?? ([client.firstName, client.lastName].filter(Boolean).join(" ") || `Cliente #${client.id}`);
}

function userName(user) {
  return user?.employee ? [user.employee.firstName, user.employee.lastName].filter(Boolean).join(" ") || user.username : user?.username ?? `Usuario #${user?.id}`;
}

function roleLabel(role) {
  return { ADMIN: "Administrador", CAJERO: "Cajero", VENDEDOR: "Vendedor" }[role] ?? role ?? "Usuario";
}

function warehouseName(warehouse) {
  return warehouse?.location ?? warehouse?.name ?? `Depósito ${warehouse?.id}`;
}

function isSalesUser(user) {
  return ["ADMIN", "CAJERO", "VENDEDOR"].includes(user?.role);
}

function sessionUserId(session) {
  return session?.user?.id ?? session?.id ?? session?.sub ?? "";
}

function readStoredSelection(key) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function persistSelection(key, value) {
  try {
    if (value) window.localStorage.setItem(key, String(value));
    else window.localStorage.removeItem(key);
  } catch {
    // The POS must continue working if browser storage is unavailable.
  }
}

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 15);
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
