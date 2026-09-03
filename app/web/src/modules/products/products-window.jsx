import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Edit3,
  ImagePlus,
  Info,
  Package,
  Plus,
  ScanLine,
  Search,
  Tag,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { apiClient } from "@/lib/api-client";

const units = ["UND", "KG", "G", "LB", "L", "ML", "CAJA", "PAQUETE"];
const barcodeTypes = [
  ["EAN13", "EAN-13"],
  ["EAN8", "EAN-8"],
  ["UPC_A", "UPC-A"],
  ["UPC_E", "UPC-E"],
  ["CODE128", "Code 128"],
  ["QR", "QR"],
  ["OTHER", "Otro"],
];
const emptyProduct = {
  recordId: null,
  code: "",
  name: "",
  description: "",
  type: "",
  productTypeId: "",
  providerId: "",
  provider: "",
  brand: "",
  unit: "UND",
  taxRate: 0,
  minimumStock: 0,
  maximumStock: "",
  stock: 0,
  cost: 0,
  active: true,
  warehouse: "",
  warehouses: [],
  barcodes: [],
  prices: [],
  packagingProfile: null,
  imageUrl: "",
};
const productTabs = [
  { id: "main", label: "Datos principales", icon: Info },
  { id: "prices", label: "Precios", icon: Tag },
  { id: "units", label: "Unidades", icon: Package },
  { id: "inventory", label: "Inventario", icon: Warehouse },
  { id: "barcodes", label: "Códigos de barras", icon: ScanLine },
];
export function ProductsWindow({
  onClose,
  onRequestLogin,
  initialProductId = null,
}) {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(initialProductId ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("main");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [productTypes, setProductTypes] = useState([]);
  const [providers, setProviders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [priceEditor, setPriceEditor] = useState(null);
  const [unitsEditor, setUnitsEditor] = useState(null);
  const [barcodeEditor, setBarcodeEditor] = useState(null);
  const [inventoryEditor, setInventoryEditor] = useState(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const {
    handlePointerDown,
    isDragging,
    style: windowStyle,
  } = useDraggableWindow();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.getAllPages("/productos", { estado: "todos" }),
      apiClient.getAllPages("/tipos-producto", { estado: "activos" }),
      apiClient.getAllPages("/proveedores", { estado: "activos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
    ])
      .then(([productItems, typeItems, providerItems, warehouseItems]) => {
        if (cancelled) return;
        const next = productItems.map(mapProduct);
        const requested = next.find(
          (item) => item.recordId === Number(initialProductId),
        );
        setProducts(next);
        setSelectedId(requested?.recordId ?? next[0]?.recordId ?? null);
        setProductTypes(typeItems);
        setProviders(providerItems);
        setWarehouses(warehouseItems);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialProductId]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        `${product.code} ${product.name} ${product.brand}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    [products, searchTerm],
  );
  const selectedProduct =
    products.find((product) => product.recordId === selectedId) ?? null;
  const shownProduct = editing ? draft : selectedProduct;

  function selectProduct(recordId) {
    setSelectedId(recordId);
    setEditing(false);
    setDraft(null);
    setPriceEditor(null);
    setUnitsEditor(null);
    setBarcodeEditor(null);
    setInventoryEditor(null);
    setError("");
  }
  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function updateProduct(recordId, changes) {
    setProducts((current) =>
      current.map((item) =>
        item.recordId === recordId ? { ...item, ...changes } : item,
      ),
    );
  }
  function handleRequestError(requestError) {
    setError(requestError.message);
    if (isAuthError(requestError)) onRequestLogin?.();
  }

  function handleAdd() {
    setSelectedId(null);
    setDraft({
      ...emptyProduct,
      productTypeId: productTypes[0]?.id ?? "",
      providerId: providers[0]?.id ?? "",
      type: productTypes[0]?.name ?? "",
      provider: providers[0]?.name ?? "",
    });
    setEditing(true);
    setActiveTab("main");
    setError("");
  }
  function handleEdit() {
    if (selectedProduct) {
      setDraft({ ...selectedProduct });
      setEditing(true);
      setError("");
    }
  }

  async function handleSave() {
    if (!draft.productTypeId || !draft.providerId) {
      setError("Selecciona el tipo de producto y el proveedor principal.");
      return;
    }
    setError("");
    const body = {
      productTypeId: Number(draft.productTypeId),
      providerId: Number(draft.providerId),
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      taxRate: Number(draft.taxRate) || 0,
      unit: draft.unit,
      brand: draft.brand.trim(),
      minimumStock: Number(draft.minimumStock) || 0,
      maximumStock:
        draft.maximumStock === "" ? undefined : Number(draft.maximumStock),
    };
    try {
      const saved = selectedId
        ? await apiClient.patch(`/productos/${selectedId}`, body)
        : await apiClient.post("/productos", body);
      const normalized = mapProduct(saved);
      setProducts((current) =>
        selectedId
          ? current.map((item) =>
              item.recordId === selectedId ? { ...item, ...normalized } : item,
            )
          : [...current, normalized],
      );
      setSelectedId(normalized.recordId);
      setDraft(null);
      setEditing(false);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  async function handleDelete() {
    if (!selectedId || !window.confirm("¿Deseas desactivar este producto?"))
      return;
    try {
      await apiClient.delete(`/productos/${selectedId}`);
      updateProduct(selectedId, { active: false });
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedId) return;
    const formData = new FormData();
    formData.append("image", file);
    try {
      const saved = await apiClient.upload(
        `/productos/${selectedId}/imagen`,
        formData,
      );
      updateProduct(selectedId, {
        imageUrl: saved.imageUrl ?? saved.image?.url ?? "",
      });
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  async function handleRemoveImage() {
    if (!selectedId || !shownProduct?.imageUrl) return;
    try {
      await apiClient.delete(`/productos/${selectedId}/imagen`);
      updateProduct(selectedId, { imageUrl: "" });
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  function moveSelection(offset) {
    const index = filteredProducts.findIndex(
      (product) => product.recordId === selectedId,
    );
    const next = filteredProducts[index + offset];
    if (next) selectProduct(next.recordId);
  }
  async function refreshProduct(recordId) {
    const refreshed = mapProduct(await apiClient.get(`/productos/${recordId}`));
    setProducts((current) =>
      current.map((item) => (item.recordId === recordId ? refreshed : item)),
    );
  }

  function openInventoryEditor(item = null) {
    const warehouseId = item?.warehouseId ?? warehouses[0]?.id;
    if (!warehouseId) {
      setError("No hay bodegas activas disponibles para ajustar existencias.");
      return;
    }
    setError("");
    setInventoryEditor({
      warehouseId: Number(warehouseId),
      quantity: String(item?.quantity ?? 0),
      warehouseName:
        item?.warehouse?.location ??
        warehouses.find((warehouse) => warehouse.id === Number(warehouseId))
          ?.location ??
        "Bodega",
    });
  }

  async function saveInventory() {
    if (!selectedId || !inventoryEditor) return;
    const quantity = Number(inventoryEditor.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("La existencia debe ser un número entero mayor o igual a cero.");
      return;
    }
    try {
      await apiClient.post("/inventario/ajuste", {
        productId: selectedId,
        warehouseId: Number(inventoryEditor.warehouseId),
        quantity,
        reason: "Ajuste desde la ficha de producto",
      });
      await refreshProduct(selectedId);
      setInventoryEditor(null);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }

  function openPriceEditor(price = null) {
    setError("");
    setPriceEditor(
      price ? toPriceDraft(price) : createPriceDraft(shownProduct),
    );
  }
  async function savePrice() {
    if (!selectedId || !priceEditor) return;
    try {
      const body = buildPriceBody(priceEditor, Boolean(priceEditor.id));
      if (priceEditor.id)
        await apiClient.patch(`/precios-producto/${priceEditor.id}`, body);
      else await apiClient.post(`/productos/${selectedId}/precios`, body);
      await refreshProduct(selectedId);
      setPriceEditor(null);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  async function deletePrice(price) {
    if (
      !price.id ||
      !window.confirm(`¿Deseas desactivar el precio ${price.name}?`)
    )
      return;
    try {
      await apiClient.delete(`/precios-producto/${price.id}`);
      await refreshProduct(selectedId);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  async function markPriceDefault(price) {
    if (!price.id) return;
    try {
      await apiClient.patch(`/precios-producto/${price.id}/default`, {});
      await refreshProduct(selectedId);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }

  function startUnitsEdit() {
    const packaging = shownProduct?.packagingProfile ?? {};
    setUnitsEditor({
      unitsPerPackage: packaging.unitsPerPackage ?? "",
      packagesPerBox: packaging.packagesPerBox ?? "",
      saleByUnitOnly: Boolean(packaging.saleByUnitOnly),
      notes: packaging.notes ?? "",
    });
  }
  async function saveUnits() {
    if (!selectedId || !unitsEditor) return;
    try {
      const saved = await apiClient.patch(`/productos/${selectedId}`, {
        packaging: {
          unitsPerPackage:
            unitsEditor.unitsPerPackage === ""
              ? undefined
              : Number(unitsEditor.unitsPerPackage),
          packagesPerBox:
            unitsEditor.packagesPerBox === ""
              ? undefined
              : Number(unitsEditor.packagesPerBox),
          saleByUnitOnly: unitsEditor.saleByUnitOnly,
          notes: unitsEditor.notes.trim() || undefined,
        },
      });
      updateProduct(selectedId, mapProduct(saved));
      setUnitsEditor(null);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }

  function openBarcodeEditor(barcode = null) {
    setError("");
    setBarcodeEditor(
      barcode
        ? {
            ...barcode,
            code: barcode.code ?? "",
            type: barcode.type ?? inferBarcodeType(barcode.code),
            isPrimary: Boolean(barcode.isPrimary),
          }
        : { code: "", type: "EAN13", isPrimary: false },
    );
  }
  async function saveBarcode() {
    if (!selectedId || !barcodeEditor?.code.trim()) {
      setError("Escribe o escanea un código de barras.");
      return;
    }
    try {
      const body = {
        code: barcodeEditor.code.trim(),
        type: barcodeEditor.type,
        isPrimary: Boolean(barcodeEditor.isPrimary),
      };
      if (barcodeEditor.id)
        await apiClient.patch(`/codigos-barras/${barcodeEditor.id}`, body);
      else
        await apiClient.post(`/productos/${selectedId}/codigos-barras`, body);
      await refreshProduct(selectedId);
      setBarcodeEditor(null);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  async function deleteBarcode(barcode) {
    if (
      !barcode.id ||
      !window.confirm(`¿Deseas desactivar el código ${barcode.code}?`)
    )
      return;
    try {
      await apiClient.delete(`/codigos-barras/${barcode.id}`);
      await refreshProduct(selectedId);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  async function markBarcodePrimary(barcode) {
    if (!barcode.id) return;
    try {
      await apiClient.patch(`/codigos-barras/${barcode.id}/principal`, {});
      await refreshProduct(selectedId);
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }
  function handleDetectedBarcode(result) {
    setCameraOpen(false);
    setReaderOpen(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    openBarcodeEditor({
      code: result.code,
      type: result.type,
      isPrimary: !(shownProduct?.barcodes ?? []).length,
    });
  }

  return (
    <section
      className={`provider-window product-window ${isDragging ? "is-dragging" : ""}`}
      aria-label="Ventana de productos"
      style={windowStyle}
    >
      <header
        className="provider-titlebar drag-handle product-titlebar"
        onPointerDown={handlePointerDown}
        title="Arrastre para mover la ventana"
      >
        <div className="provider-title-mark">
          <Package size={14} />
        </div>
        <strong>PRODUCTOS</strong>
        <button
          type="button"
          className="provider-close"
          aria-label="Cerrar productos"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="provider-content">
        <aside className="provider-list-panel">
          <div className="provider-list-toolbar">
            <label htmlFor="product-search">Buscar</label>
            <div className="provider-search-field">
              <Search size={15} />
              <input
                id="product-search"
                aria-label="Buscar producto"
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
            className="provider-table product-list-table"
            role="table"
            aria-label="Listado de productos"
          >
            <div className="provider-table-head" role="row">
              <span>Código</span>
              <span>Descripción</span>
            </div>
            {filteredProducts.map((product) => (
              <button
                className={
                  product.recordId === selectedId
                    ? "provider-table-row is-selected"
                    : "provider-table-row"
                }
                type="button"
                role="row"
                key={product.recordId}
                onClick={() => selectProduct(product.recordId)}
              >
                <span>{product.code}</span>
                <span>{product.name}</span>
              </button>
            ))}
            {loading && <div className="window-state">Cargando productos…</div>}
            {!loading && !filteredProducts.length && (
              <div className="window-state">No hay productos para mostrar.</div>
            )}
            <div className="provider-empty-rows" aria-hidden="true">
              {Array.from({
                length: Math.max(0, 9 - filteredProducts.length),
              }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
        </aside>
        <div className="provider-detail-panel product-detail-panel">
          <div className="provider-summary-form product-summary-form">
            <SummaryField label="Código" value={shownProduct?.code ?? ""} />
            <SummaryField
              label="Descripción"
              value={shownProduct?.name ?? ""}
            />
            <div className="summary-field summary-type">
              <label>Estado</label>
              <div className="select-like">
                <span>{shownProduct?.active ? "ACTIVO" : "INACTIVO"}</span>
                <ChevronDown size={14} />
              </div>
            </div>
          </div>
          <div className="provider-tabs primary-tabs product-tabs">
            {productTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  className={
                    activeTab === tab.id
                      ? "provider-tab is-active"
                      : "provider-tab"
                  }
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          {shownProduct ? (
            <ProductDetails
              activeTab={activeTab}
              product={shownProduct}
              editing={editing}
              onChange={updateDraft}
              onStartEdit={handleEdit}
              productTypes={productTypes}
              providers={providers}
              warehouses={warehouses}
              onUpload={handleImageUpload}
              onRemoveImage={handleRemoveImage}
              priceEditor={priceEditor}
              onOpenPrice={openPriceEditor}
              onEditPrice={openPriceEditor}
              onChangePrice={setPriceEditor}
              onSavePrice={savePrice}
              onCancelPrice={() => setPriceEditor(null)}
              onDeletePrice={deletePrice}
              onDefaultPrice={markPriceDefault}
              unitsEditor={unitsEditor}
              onStartUnitsEdit={startUnitsEdit}
              onChangeUnits={setUnitsEditor}
              onSaveUnits={saveUnits}
              onCancelUnits={() => setUnitsEditor(null)}
              barcodeEditor={barcodeEditor}
              onOpenBarcode={openBarcodeEditor}
              onEditBarcode={openBarcodeEditor}
              onChangeBarcode={setBarcodeEditor}
              onSaveBarcode={saveBarcode}
              onCancelBarcode={() => setBarcodeEditor(null)}
              onDeleteBarcode={deleteBarcode}
              onPrimaryBarcode={markBarcodePrimary}
              onOpenReader={() => setReaderOpen(true)}
              onOpenCamera={() => setCameraOpen(true)}
              onDetectedBarcode={handleDetectedBarcode}
              inventoryEditor={inventoryEditor}
              onOpenInventory={openInventoryEditor}
              onChangeInventory={setInventoryEditor}
              onSaveInventory={saveInventory}
              onCancelInventory={() => setInventoryEditor(null)}
            />
          ) : (
            <div className="provider-tab-panel empty-provider-panel">
              <strong>Agrega un producto para comenzar.</strong>
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="window-error" role="alert">
          {error}
        </div>
      )}
      <footer className="provider-window-footer">
        <div className="provider-crud-actions">
          {editing ? (
            <button type="button" onClick={handleSave}>
              <Check size={14} /> Guardar
            </button>
          ) : (
            <button type="button" onClick={handleAdd}>
              <Plus size={14} /> Agregar
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={handleEdit}
              disabled={!selectedProduct}
            >
              <Edit3 size={14} /> Modificar
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedProduct}
            >
              <Trash2 size={14} /> Borrar
            </button>
          )}
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(null);
              }}
            >
              <CircleX size={14} /> Cancelar
            </button>
          )}
        </div>
        <div className="provider-navigation-actions">
          <button
            type="button"
            className="muted-action"
            onClick={() => moveSelection(-1)}
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <button
            type="button"
            className="muted-action"
            onClick={() => moveSelection(1)}
          >
            Próximo <ChevronRight size={14} />
          </button>
          <button type="button" className="exit-action" onClick={onClose}>
            <CircleX size={14} /> Salir
          </button>
        </div>
      </footer>
      <BarcodeReaderDialog
        open={readerOpen}
        onOpenChange={setReaderOpen}
        onDetected={handleDetectedBarcode}
      />
      <BarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onDetected={handleDetectedBarcode}
      />
    </section>
  );
}

function ProductDetails({
  activeTab,
  product,
  editing,
  onChange,
  onStartEdit,
  productTypes,
  providers,
  warehouses,
  onUpload,
  onRemoveImage,
  ...actions
}) {
  if (activeTab === "prices")
    return <PricesPanel product={product} {...actions} />;
  if (activeTab === "units")
    return <UnitsPanel product={product} {...actions} />;
  if (activeTab === "inventory")
    return (
      <InventoryPanel
        product={product}
        warehouses={warehouses}
        inventoryEditor={actions.inventoryEditor}
        onOpenInventory={actions.onOpenInventory}
        onChangeInventory={actions.onChangeInventory}
        onSaveInventory={actions.onSaveInventory}
        onCancelInventory={actions.onCancelInventory}
      />
    );
  if (activeTab === "barcodes")
    return <BarcodePanel product={product} {...actions} />;
  return (
    <div className="provider-main-details product-main-details">
      <ProductImage
        product={product}
        editing={editing}
        onUpload={onUpload}
        onRemoveImage={onRemoveImage}
      />
      <ProductField
        label="Tipo de producto"
        value={product.type}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("productTypeId", value)}
        options={productTypes.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        select
      />
      <div className="detail-field active-field">
        <label>Activo</label>
        <span className="checkbox-value">
          <span
            className={
              product.active ? "fake-checkbox" : "fake-checkbox is-empty"
            }
          >
            {product.active && <Check size={12} />}
          </span>
          {product.active ? "Sí" : "No"}
        </span>
      </div>
      <ProductField
        label="Nombre"
        value={product.name}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("name", value)}
        wide
      />
      <ProductField
        label="Descripción"
        value={product.description}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("description", value)}
        wide
      />
      <ProductField
        label="Marca"
        value={product.brand}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("brand", value)}
      />
      <ProductField
        label="Proveedor principal"
        value={product.provider}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("providerId", value)}
        options={providers.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        select
      />
      <ProductField
        label="Unidad"
        value={product.unit}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("unit", value)}
        options={units.map((value) => ({ value, label: value }))}
        select
      />
      <ProductField
        label="Impuesto"
        value={`${product.taxRate}`}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("taxRate", value)}
      />
      <ProductField
        label="Stock mínimo"
        value={String(product.minimumStock)}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("minimumStock", value)}
      />
      <ProductField
        label="Stock máximo"
        value={String(product.maximumStock ?? "")}
        editing={editing}
        onStartEdit={onStartEdit}
        onChange={(value) => onChange("maximumStock", value)}
      />
      <ProductField
        label="Stock total"
        value={String(product.stock)}
        onStartEdit={onStartEdit}
      />
      <ProductField
        label="Precio de costo"
        value={formatCurrency(product.cost)}
        accent
        onStartEdit={onStartEdit}
      />
      <ProductField
        label="Valor inventario"
        value={formatCurrency(product.cost * product.stock)}
        accent
        onStartEdit={onStartEdit}
      />
      <ProductField
        label="Bodega"
        value={product.warehouse}
        wide
        onStartEdit={onStartEdit}
      />
    </div>
  );
}

function InventoryPanel({
  product,
  warehouses,
  inventoryEditor,
  onOpenInventory,
  onChangeInventory,
  onSaveInventory,
  onCancelInventory,
}) {
  const inventory = product.warehouses ?? [];

  return (
    <div className="provider-tab-panel data-panel inventory-panel">
      <PanelHeading
        title="Inventario por bodega"
        description="El valor del inventario se calcula con el precio de costo, no con el stock total."
        action={
          <button
            type="button"
            className="inline-action"
            onClick={() => onOpenInventory()}
          >
            <Edit3 size={14} /> Ajustar existencias
          </button>
        }
      />
      <div className="provider-data-table-wrap">
        <div className="provider-table-caption">
          Existencias por bodega · doble clic para editar
        </div>
        {inventory.length ? (
          <table className="provider-data-table inventory-data-table">
            <thead>
              <tr>
                <th>Bodega</th>
                <th>Stock</th>
                <th>Mínimo</th>
                <th>Máximo</th>
                <th>Precio de costo</th>
                <th>Valor inventario</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const itemWarehouseId = Number(item.warehouseId);
                const isEditing =
                  Number(inventoryEditor?.warehouseId) === itemWarehouseId;
                return (
                  <tr
                    key={itemWarehouseId}
                    className={isEditing ? "is-inline-editing" : undefined}
                    onDoubleClick={() => onOpenInventory(item)}
                    title="Doble clic para editar existencias"
                  >
                    <td>
                      {item.warehouse?.location ?? `Bodega #${itemWarehouseId}`}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          className="table-edit-input"
                          type="number"
                          min="0"
                          step="1"
                          autoFocus
                          value={inventoryEditor.quantity}
                          onChange={(event) =>
                            onChangeInventory((current) => ({
                              ...current,
                              quantity: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        (item.quantity ?? 0)
                      )}
                    </td>
                    <td>{product.minimumStock}</td>
                    <td>{product.maximumStock ?? "—"}</td>
                    <td>{formatCurrency(product.cost)}</td>
                    <td>
                      {formatCurrency(
                        product.cost * Number(item.quantity ?? 0),
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="table-empty">
            No hay existencias por bodega. Puedes crear la primera con “Ajustar
            existencias”.
          </div>
        )}
      </div>
      {inventoryEditor && (
        <div className="inline-editor inventory-editor">
          <div className="inline-editor-title">
            <strong>Ajustar existencia</strong>
            <button
              type="button"
              aria-label="Cerrar editor de inventario"
              onClick={onCancelInventory}
            >
              <X size={14} />
            </button>
          </div>
          <div className="inventory-editor-fields">
            <EditorSelect
              label="Bodega"
              value={String(inventoryEditor.warehouseId)}
              options={warehouses.map((warehouse) => ({
                value: String(warehouse.id),
                label: warehouse.location,
              }))}
              onChange={(value) =>
                onChangeInventory((current) => ({
                  ...current,
                  warehouseId: Number(value),
                  warehouseName:
                    warehouses.find(
                      (warehouse) => warehouse.id === Number(value),
                    )?.location ?? "Bodega",
                }))
              }
            />
            <EditorField
              label="Nueva existencia"
              type="number"
              value={inventoryEditor.quantity}
              onChange={(value) =>
                onChangeInventory((current) => ({
                  ...current,
                  quantity: value,
                }))
              }
            />
          </div>
          <p className="table-hint">
            Se registrará un movimiento de ajuste en el inventario.
          </p>
          <div className="inline-editor-actions">
            <button type="button" onClick={onCancelInventory}>
              Cancelar
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={onSaveInventory}
            >
              <Check size={13} /> Guardar existencia
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PricesPanel({
  product,
  priceEditor,
  onOpenPrice,
  onEditPrice,
  onChangePrice,
  onSavePrice,
  onCancelPrice,
  onDeletePrice,
  onDefaultPrice,
}) {
  return (
    <div className="provider-tab-panel data-panel">
      <PanelHeading
        title="Costos y precios"
        description="Agrega tantos precios como necesites para este producto."
        action={
          <button
            type="button"
            className="inline-action"
            onClick={() => onOpenPrice()}
          >
            <Plus size={14} /> Agregar precio
          </button>
        }
      />
      <div className="cost-summary">
        <CostMetric label="Costo actual" value={product.cost} />
        <CostMetric label="Costo promedio" value={averageCost(product.costs)} />
        <CostMetric
          label="Costo anterior"
          value={previousCost(product.costs, product.cost)}
        />
      </div>
      <ProductDataTable
        caption={`Precios de ${product.name}`}
        columns={[
          "Nombre",
          "Precio",
          "Unidad",
          "Cantidad",
          "Principal",
          "Estado",
        ]}
        rows={(product.prices ?? []).map((price) => [
          price.name,
          formatCurrency(Number(price.price)),
          price.unit,
          String(price.quantity ?? 1),
          price.isDefault ? "Sí" : "No",
          price.isActive === false ? "Inactivo" : "Activo",
        ])}
        rowKeys={(product.prices ?? []).map((price) => price.id)}
        onRowDoubleClick={(index) => onEditPrice(product.prices[index])}
        empty="No hay precios registrados."
      />
      <p className="table-hint">Doble clic sobre una fila para editarla.</p>
      {priceEditor && (
        <PriceEditor
          editor={priceEditor}
          onChange={onChangePrice}
          onSave={onSavePrice}
          onCancel={onCancelPrice}
          onDelete={onDeletePrice}
          onDefault={onDefaultPrice}
        />
      )}
    </div>
  );
}
function PriceEditor({
  editor,
  onChange,
  onSave,
  onCancel,
  onDelete,
  onDefault,
}) {
  return (
    <div className="inline-editor">
      <div className="inline-editor-title">
        <strong>{editor.id ? "Modificar precio" : "Nuevo precio"}</strong>
        <button
          type="button"
          aria-label="Cerrar editor de precio"
          onClick={onCancel}
        >
          <X size={14} />
        </button>
      </div>
      <div className="inline-editor-grid">
        <EditorField
          label="Nombre"
          value={editor.name}
          onChange={(value) =>
            onChange((current) => ({ ...current, name: value }))
          }
        />
        <EditorField
          label="Precio"
          type="number"
          value={editor.price}
          onChange={(value) =>
            onChange((current) => ({ ...current, price: value }))
          }
        />
        <EditorSelect
          label="Unidad"
          value={editor.unit}
          options={units}
          onChange={(value) =>
            onChange((current) => ({ ...current, unit: value }))
          }
        />
        <EditorField
          label="Cantidad"
          type="number"
          value={editor.quantity}
          onChange={(value) =>
            onChange((current) => ({ ...current, quantity: value }))
          }
        />
        <EditorField
          label="Vigente desde"
          type="date"
          value={editor.startsAt}
          onChange={(value) =>
            onChange((current) => ({ ...current, startsAt: value }))
          }
        />
        <EditorField
          label="Vigente hasta"
          type="date"
          value={editor.endsAt}
          onChange={(value) =>
            onChange((current) => ({ ...current, endsAt: value }))
          }
        />
      </div>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={editor.isDefault}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              isDefault: event.target.checked,
            }))
          }
        />{" "}
        Precio principal
      </label>
      <div className="inline-editor-actions">
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        {editor.id && (
          <button
            type="button"
            onClick={() => onDelete(editor)}
            className="danger-action"
          >
            <Trash2 size={13} /> Desactivar
          </button>
        )}
        {editor.id && !editor.isDefault && (
          <button type="button" onClick={() => onDefault(editor)}>
            Marcar principal
          </button>
        )}
        <button type="button" onClick={onSave} className="primary-action">
          <Check size={13} /> Guardar precio
        </button>
      </div>
    </div>
  );
}

function UnitsPanel({
  product,
  unitsEditor,
  onStartUnitsEdit,
  onChangeUnits,
  onSaveUnits,
  onCancelUnits,
}) {
  const packaging = product.packagingProfile ?? {};
  const values = unitsEditor ?? packaging;
  return (
    <div className="provider-tab-panel data-panel">
      <PanelHeading
        title="Unidades y empaque"
        description="Configuración de venta detallada del producto."
        action={
          unitsEditor ? (
            <button
              type="button"
              className="inline-action"
              onClick={onSaveUnits}
            >
              <Check size={14} /> Guardar unidades
            </button>
          ) : (
            <button
              type="button"
              className="inline-action"
              onClick={onStartUnitsEdit}
            >
              <Edit3 size={14} /> Modificar
            </button>
          )
        }
      />
      <div className="units-form">
        <EditorSelect
          label="Unidad detallada"
          value={product.unit}
          options={units}
          disabled
        />
        <EditorField
          label="Unidades por empaque"
          type="number"
          value={values.unitsPerPackage ?? ""}
          disabled={!unitsEditor}
          onChange={(value) =>
            onChangeUnits((current) => ({ ...current, unitsPerPackage: value }))
          }
        />
        <EditorField
          label="Empaques por caja"
          type="number"
          value={values.packagesPerBox ?? ""}
          disabled={!unitsEditor}
          onChange={(value) =>
            onChangeUnits((current) => ({ ...current, packagesPerBox: value }))
          }
        />
        <EditorField
          label="Notas"
          value={values.notes ?? ""}
          disabled={!unitsEditor}
          onChange={(value) =>
            onChangeUnits((current) => ({ ...current, notes: value }))
          }
          wide
        />
        <label className="inline-check">
          <input
            type="checkbox"
            checked={Boolean(values.saleByUnitOnly)}
            disabled={!unitsEditor}
            onChange={(event) =>
              onChangeUnits((current) => ({
                ...current,
                saleByUnitOnly: event.target.checked,
              }))
            }
          />{" "}
          Vender únicamente por unidad
        </label>
      </div>
      <div className="unit-price-list">
        <div className="provider-table-caption">
          Precios por unidad configurados
        </div>
        {product.prices?.length ? (
          <table className="provider-data-table">
            <thead>
              <tr>
                <th>Precio</th>
                <th>Unidad</th>
                <th>Cantidad</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {product.prices.map((price) => (
                <tr key={price.id}>
                  <td>{price.name}</td>
                  <td>{price.unit}</td>
                  <td>{price.quantity ?? 1}</td>
                  <td>{formatCurrency(Number(price.price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="table-empty">
            Configura los precios en la pestaña Precios.
          </div>
        )}
      </div>
      {unitsEditor && (
        <button type="button" className="cancel-inline" onClick={onCancelUnits}>
          Cancelar cambios
        </button>
      )}
    </div>
  );
}

function BarcodePanel({
  product,
  barcodeEditor,
  onOpenBarcode,
  onEditBarcode,
  onChangeBarcode,
  onSaveBarcode,
  onCancelBarcode,
  onDeleteBarcode,
  onPrimaryBarcode,
  onOpenReader,
  onOpenCamera,
  onDetectedBarcode,
}) {
  return (
    <div className="provider-tab-panel data-panel">
      <PanelHeading
        title="Códigos de barras"
        description="Compatible con lector físico, cámara e imagen."
        action={
          <div className="barcode-actions">
            <button
              type="button"
              className="inline-action"
              onClick={onOpenCamera}
            >
              <Camera size={14} /> Cámara
            </button>
            <button
              type="button"
              className="inline-action"
              onClick={onOpenReader}
            >
              <ScanLine size={14} /> Lector físico
            </button>
            <label className="inline-action">
              <Upload size={14} /> Leer imagen
              <input
                type="file"
                accept="image/*"
                className="hidden-file"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    onDetectedBarcode(await readBarcodeFromImage(file));
                  } catch (error) {
                    onDetectedBarcode({
                      code: "",
                      type: "OTHER",
                      error: error.message,
                    });
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="inline-action"
              onClick={() => onOpenBarcode()}
            >
              <Plus size={14} /> Agregar
            </button>
          </div>
        }
      />
      <ProductDataTable
        caption={`Códigos registrados para ${product.name}`}
        columns={["Código", "Tipo", "Principal", "Estado"]}
        rows={(product.barcodes ?? []).map((barcode) => [
          barcode.code,
          barcodeTypeLabel(barcode.type),
          barcode.isPrimary ? "Sí" : "No",
          barcode.isActive === false ? "Inactivo" : "Activo",
        ])}
        rowKeys={(product.barcodes ?? []).map((barcode) => barcode.id)}
        onRowDoubleClick={(index) => onEditBarcode(product.barcodes[index])}
        empty="No hay códigos de barras registrados."
      />
      <p className="table-hint">
        Doble clic sobre una fila para editarla. El lector físico funciona como
        teclado.
      </p>
      {barcodeEditor?.error && (
        <div className="inline-error">{barcodeEditor.error}</div>
      )}
      {barcodeEditor && (
        <BarcodeEditor
          editor={barcodeEditor}
          onChange={onChangeBarcode}
          onSave={onSaveBarcode}
          onCancel={onCancelBarcode}
          onDelete={onDeleteBarcode}
          onPrimary={onPrimaryBarcode}
        />
      )}
    </div>
  );
}
function BarcodeEditor({
  editor,
  onChange,
  onSave,
  onCancel,
  onDelete,
  onPrimary,
}) {
  return (
    <div className="inline-editor">
      <div className="inline-editor-title">
        <strong>{editor.id ? "Modificar código" : "Nuevo código"}</strong>
        <button
          type="button"
          aria-label="Cerrar editor de código"
          onClick={onCancel}
        >
          <X size={14} />
        </button>
      </div>
      <div className="inline-editor-grid">
        <EditorField
          label="Código"
          value={editor.code}
          onChange={(value) =>
            onChange((current) => ({
              ...current,
              code: value,
              type:
                current.type === "EAN13" && value.length !== 13
                  ? inferBarcodeType(value)
                  : current.type,
            }))
          }
        />
        <EditorSelect
          label="Tipo"
          value={editor.type}
          options={barcodeTypes.map(([value]) => value)}
          onChange={(value) =>
            onChange((current) => ({ ...current, type: value }))
          }
        />
      </div>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={Boolean(editor.isPrimary)}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              isPrimary: event.target.checked,
            }))
          }
        />{" "}
        Código principal
      </label>
      <div className="inline-editor-actions">
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        {editor.id && (
          <button
            type="button"
            onClick={() => onDelete(editor)}
            className="danger-action"
          >
            <Trash2 size={13} /> Desactivar
          </button>
        )}
        {editor.id && !editor.isPrimary && (
          <button type="button" onClick={() => onPrimary(editor)}>
            Marcar principal
          </button>
        )}
        <button type="button" onClick={onSave} className="primary-action">
          <Check size={13} /> Guardar código
        </button>
      </div>
    </div>
  );
}

function BarcodeReaderDialog({ open, onOpenChange, onDetected }) {
  const inputRef = useRef(null);
  const [code, setCode] = useState("");
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);
  if (!open) return null;
  function submit(event) {
    event.preventDefault();
    const normalized = code.trim();
    if (normalized) {
      onDetected({ code: normalized, type: inferBarcodeType(normalized) });
      setCode("");
    }
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="barcode-dialog" onSubmit={submit}>
        <div className="inline-editor-title">
          <strong>Leer con lector físico</strong>
          <button type="button" onClick={() => onOpenChange(false)}>
            <X size={14} />
          </button>
        </div>
        <p>
          Conecta el lector y escanea sobre este campo. El equipo lo recibe como
          teclado.
        </p>
        <input
          ref={inputRef}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Escanea aquí…"
          autoComplete="off"
        />
        <div className="inline-editor-actions">
          <button type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button type="submit" className="primary-action">
            <ScanLine size={13} /> Usar código
          </button>
        </div>
      </form>
    </div>
  );
}
function BarcodeScannerDialog({ open, onOpenChange, onDetected }) {
  const videoRef = useRef(null);
  const [message, setMessage] = useState("Preparando cámara…");
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    scanBarcodeFromVideo(videoRef.current, { signal: controller.signal })
      .then(onDetected)
      .catch((error) => {
        if (error?.name !== "AbortError") setMessage(error.message);
      });
    return () => controller.abort();
  }, [open, onDetected]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="barcode-dialog camera-dialog">
        <div className="inline-editor-title">
          <strong>Escanear con cámara</strong>
          <button type="button" onClick={() => onOpenChange(false)}>
            <X size={14} />
          </button>
        </div>
        <video
          ref={videoRef}
          className="barcode-video"
          muted
          playsInline
          autoPlay
        />
        <p>
          <Camera size={13} /> {message}
        </p>
        <div className="inline-editor-actions">
          <button type="button" onClick={() => onOpenChange(false)}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelHeading({ title, description, action }) {
  return (
    <div className="product-panel-heading">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {action}
    </div>
  );
}
function CostMetric({ label, value }) {
  return (
    <div className="cost-metric">
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}
function averageCost(costs) {
  const values = (costs ?? [])
    .map((item) => Number(item.cost))
    .filter((value) => Number.isFinite(value));
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}
function previousCost(costs, current) {
  const previous = (costs ?? []).find(
    (item) => Number(item.cost) !== Number(current),
  );
  return previous?.cost ?? 0;
}
function ProductImage({ product, editing, onUpload, onRemoveImage }) {
  return (
    <div className="product-image-field">
      <label>Imagen</label>
      <div className="product-image-box">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={`Producto ${product.name}`} />
        ) : (
          <ImagePlus size={26} />
        )}
        <span>{product.imageUrl ? "Imagen del producto" : "Sin imagen"}</span>
      </div>
      {editing && (
        <div className="product-image-actions">
          <label className="image-upload-button">
            <Upload size={13} /> Cargar
            <input type="file" accept="image/*" onChange={onUpload} />
          </label>
          {product.imageUrl && (
            <button type="button" onClick={onRemoveImage}>
              Quitar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function ProductDataTable({
  caption,
  columns,
  rows,
  rowKeys,
  onRowDoubleClick,
  empty,
}) {
  return (
    <div className="provider-data-table-wrap">
      <div className="provider-table-caption">{caption}</div>
      {rows.length ? (
        <table className="provider-data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowKeys?.[rowIndex] ?? `${row[0]}-${rowIndex}`}
                onDoubleClick={() => onRowDoubleClick?.(rowIndex)}
                title={onRowDoubleClick ? "Doble clic para editar" : undefined}
              >
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="table-empty">{empty}</div>
      )}
    </div>
  );
}
function SummaryField({ label, value }) {
  return (
    <div className="summary-field">
      <label>{label}</label>
      <input value={value ?? ""} readOnly />
    </div>
  );
}
function ProductField({
  label,
  value,
  editing,
  onChange,
  select = false,
  options = [],
  wide = false,
  accent = false,
  onStartEdit,
}) {
  return (
    <div
      className={`detail-field ${wide ? "wide-field" : ""} ${onStartEdit && !editing ? "edit-on-double-click" : ""}`}
      onDoubleClick={editing ? undefined : onStartEdit}
      title={onStartEdit && !editing ? "Doble clic para editar" : undefined}
    >
      <label>{label}</label>
      {editing && onChange ? (
        select ? (
          <select
            className="detail-input"
            value={
              options.find((option) => String(option.label) === String(value))
                ?.value ??
              value ??
              ""
            }
            onChange={(event) => onChange(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={`detail-input ${accent ? "is-accent" : ""}`}
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      ) : (
        <div
          className={`detail-control ${select ? "select-like" : ""} ${accent ? "is-accent" : ""}`}
        >
          <span>{value || " "}</span>
          {select && <ChevronDown size={13} />}
        </div>
      )}
    </div>
  );
}
function EditorField({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  wide = false,
}) {
  return (
    <label className={`editor-field ${wide ? "editor-field-wide" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  );
}
function EditorSelect({ label, value, options, onChange, disabled = false }) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option) => {
          const optionValue =
            typeof option === "object" ? option.value : option;
          const optionLabel =
            typeof option === "object" ? option.label : option;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}
function mapProduct(product) {
  const warehouses = product.warehouses ?? [];
  const stock = warehouses.reduce(
    (sum, item) => sum + Number(item.quantity ?? 0),
    0,
  );
  const cost = Number(
    product.costs?.find((item) => item.isActive !== false)?.cost ?? 0,
  );
  const barcode =
    product.barcodes?.find((item) => item.isPrimary) ?? product.barcodes?.[0];
  return {
    ...emptyProduct,
    ...product,
    recordId: product.id,
    code: barcode?.code ?? String(product.id).padStart(6, "0"),
    name: product.name ?? "",
    description: product.description ?? "",
    type: product.productType?.name ?? "",
    productTypeId: product.productTypeId,
    providerId: product.providerId,
    provider: product.provider?.name ?? product.primaryProvider?.name ?? "",
    brand: product.brand ?? "",
    unit: product.unit ?? "UND",
    taxRate: Number(product.taxRate ?? 0),
    minimumStock: Number(product.minimumStock ?? 0),
    maximumStock: product.maximumStock ?? "",
    stock,
    cost,
    active: product.isActive !== false,
    warehouse: warehouses[0]?.warehouse?.location ?? "",
    warehouses,
    barcodes: product.barcodes ?? [],
    prices: product.prices ?? [],
    packagingProfile: product.packagingProfile ?? null,
    imageUrl: product.imageUrl ?? "",
  };
}
function toPriceDraft(price) {
  return {
    ...price,
    price: String(price.price ?? ""),
    quantity: String(price.quantity ?? 1),
    unit: price.unit ?? "UND",
    startsAt: toDateInput(price.startsAt),
    endsAt: toDateInput(price.endsAt),
    isDefault: Boolean(price.isDefault),
    isActive: price.isActive !== false,
  };
}
function createPriceDraft(product) {
  return {
    name: `Precio ${(product?.prices?.length ?? 0) + 1}`,
    price: "1",
    unit: product?.unit ?? "UND",
    quantity: "1",
    startsAt: "",
    endsAt: "",
    isDefault: !(product?.prices ?? []).length,
    isActive: true,
  };
}
function buildPriceBody(editor, isUpdate) {
  const body = {
    name: editor.name.trim(),
    price: Number(editor.price),
    unit: editor.unit,
    quantity: Number(editor.quantity) || 1,
    isDefault: Boolean(editor.isDefault),
    isActive: editor.isActive !== false,
  };
  if (editor.startsAt || isUpdate)
    body.startsAt = editor.startsAt
      ? new Date(`${editor.startsAt}T00:00:00`).toISOString()
      : null;
  if (editor.endsAt || isUpdate)
    body.endsAt = editor.endsAt
      ? new Date(`${editor.endsAt}T00:00:00`).toISOString()
      : null;
  return body;
}
function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}
function inferBarcodeType(code) {
  const value = String(code ?? "").trim();
  if (/^https?:\/\//i.test(value)) return "QR";
  if (/^\d{13}$/.test(value)) return "EAN13";
  if (/^\d{8}$/.test(value)) return "EAN8";
  if (/^\d{12}$/.test(value)) return "UPC_A";
  if (/^\d{6,7}$/.test(value)) return "UPC_E";
  if (/^[A-Z0-9\-._/]+$/i.test(value) && /[A-Z\-._/]/i.test(value))
    return "CODE128";
  return "OTHER";
}
function barcodeTypeLabel(type) {
  return barcodeTypes.find(([value]) => value === type)?.[1] ?? type ?? "Otro";
}
function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
function formatCurrency(value) {
  return `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
}

async function readBarcodeFromImage(file) {
  if (!(file instanceof File)) throw new Error("Selecciona una imagen válida");
  const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const reader = new BrowserMultiFormatReader();
  const objectUrl = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(objectUrl);
    const code = result.getText();
    const rawFormat = BarcodeFormat[result.getBarcodeFormat?.()];
    const formatMap = {
      EAN_13: "EAN13",
      EAN_8: "EAN8",
      UPC_A: "UPC_A",
      UPC_E: "UPC_E",
      CODE_128: "CODE128",
      QR_CODE: "QR",
    };
    return { code, type: formatMap[rawFormat] ?? inferBarcodeType(code) };
  } catch {
    throw new Error("No se pudo leer un código de barras en la imagen");
  } finally {
    reader.reset?.();
    URL.revokeObjectURL(objectUrl);
  }
}
async function scanBarcodeFromVideo(videoElement, options = {}) {
  if (!videoElement)
    throw new Error("No se pudo abrir la vista previa de la cámara");
  const [{ BrowserMultiFormatReader }, { BarcodeFormat }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const reader = new BrowserMultiFormatReader();
  return new Promise((resolve, reject) => {
    let controls;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      controls?.stop?.();
      reader.reset?.();
      options.signal?.removeEventListener("abort", abortHandler);
      callback(value);
    };
    const abortHandler = () =>
      finish(reject, new DOMException("Escaneo cancelado", "AbortError"));
    options.signal?.addEventListener("abort", abortHandler, { once: true });
    reader
      .decodeFromVideoDevice(options.deviceId, videoElement, (result) => {
        if (!result) return;
        const code = result.getText();
        const rawFormat = BarcodeFormat[result.getBarcodeFormat?.()];
        const formatMap = {
          EAN_13: "EAN13",
          EAN_8: "EAN8",
          UPC_A: "UPC_A",
          UPC_E: "UPC_E",
          CODE_128: "CODE128",
          QR_CODE: "QR",
        };
        finish(resolve, {
          code,
          type: formatMap[rawFormat] ?? inferBarcodeType(code),
        });
      })
      .then((nextControls) => {
        controls = nextControls;
      })
      .catch(() =>
        finish(reject, new Error("No se pudo iniciar la cámara para escanear")),
      );
  });
}
