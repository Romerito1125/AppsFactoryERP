import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Edit3,
  Heart,
  ImagePlus,
  Info,
  LayoutGrid,
  List,
  LoaderCircle,
  Package,
  Plus,
  ScanLine,
  Search,
  Star,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { SearchOptionsMenu } from "@/components/desktop/search-options-menu";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";

const units = ["UND", "KG", "G", "LB", "L", "ML", "CAJA", "PAQUETE"];
const PRICE_LEVELS = [0, 1, 2, 3];
const CREATE_PRODUCT_TYPE_VALUE = "__crear_tipo_producto__";
const CREATE_WAREHOUSE_VALUE = "__crear_bodega__";
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
  providerIds: [],
  tagIds: [],
  brand: "",
  unit: "UND",
  taxRate: 0,
  minimumStock: 0,
  maximumStock: "",
  stock: 0,
  cost: 0,
  initialStock: 0,
  active: true,
  warehouseId: "",
  warehouse: "",
  warehouses: [],
  barcodes: [],
  prices: [],
  packagingProfile: null,
  imageUrl: "",
};

function createEmptyProductDraft(productTypes = [], providers = [], warehouses = []) {
  const defaultProductType = productTypes[0];
  const defaultProvider = providers[0];
  const defaultWarehouse = warehouses[0];
  return {
    ...emptyProduct,
    productTypeId: defaultProductType?.id ?? "",
    providerId: defaultProvider?.id ?? "",
    type: defaultProductType?.name ?? "",
    provider: defaultProvider?.name ?? "",
    providerIds: [],
    warehouseId: defaultWarehouse?.id ?? "",
    warehouse: defaultWarehouse?.location ?? "",
    prices: createInitialPriceDrafts(defaultProductType?.unit ?? "UND"),
  };
}

const productTabs = [
  { id: "main", label: "Datos principales", icon: Info },
  { id: "inventory", label: "Inventario", icon: Warehouse },
  { id: "barcodes", label: "Códigos de barras", icon: ScanLine },
];
export function ProductsWindow({
  onClose,
  onRequestLogin,
  initialProductId = null,
  canAccess,
}) {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(initialProductId ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [productView, setProductView] = useState("grid");
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteLoadingId, setFavoriteLoadingId] = useState(null);
  const [activeTab, setActiveTab] = useState("main");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [productTypes, setProductTypes] = useState([]);
  const [providers, setProviders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [tags, setTags] = useState([]);
  const [productProfit, setProductProfit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageRemoving, setImageRemoving] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [catalogDialog, setCatalogDialog] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
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

  useEffect(
    () => () => {
      if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    },
    [pendingImage],
  );

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) return undefined;
    apiClient
      .get(`/productos/${selectedId}/utilidades`)
      .then((profit) => {
        if (!cancelled) setProductProfit(profit);
      })
      .catch(() => {
        if (!cancelled) setProductProfit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      apiClient.getAllPages("/productos", { estado: "todos" }),
      apiClient.getAllPages("/tipos-producto", { estado: "activos" }),
      apiClient.getAllPages("/proveedores", { estado: "activos" }),
      apiClient.getAllPages("/bodegas", { estado: "activos" }),
      apiClient.getAllPages("/etiquetas", { estado: "activos" }),
      apiClient.get("/productos/favoritos/mios"),
    ])
      .then(
        ([
          productResult,
          typeResult,
          providerResult,
          warehouseResult,
          tagResult,
          favoriteResult,
        ]) => {
        if (cancelled) return;
        if (productResult.status === "rejected") throw productResult.reason;
        const next = productResult.value.map(mapProduct);
        const favoriteItems =
          favoriteResult.status === "fulfilled" ? favoriteResult.value : [];
        const requested = next.find(
          (item) => item.recordId === Number(initialProductId),
        );
        const firstProduct = requested ?? next[0];
        setProducts(next);
        setSelectedId(firstProduct?.recordId ?? null);
        if (firstProduct) {
            setDraft(toEditableProduct(firstProduct));
        } else {
          const nextProductTypes =
            typeResult.status === "fulfilled" ? typeResult.value : [];
          const nextProviders =
            providerResult.status === "fulfilled" ? providerResult.value : [];
          const nextWarehouses =
            warehouseResult.status === "fulfilled" ? warehouseResult.value : [];
          setDraft(
            createEmptyProductDraft(
              nextProductTypes,
              nextProviders,
              nextWarehouses,
            ),
          );
        }
        setEditing(true);
        setProductTypes(
          typeResult.status === "fulfilled" ? typeResult.value : [],
        );
        setProviders(
          providerResult.status === "fulfilled" ? providerResult.value : [],
        );
        setWarehouses(
          warehouseResult.status === "fulfilled"
            ? warehouseResult.value
            : [],
        );
        setTags(tagResult.status === "fulfilled" ? tagResult.value : []);
        setFavoriteIds(
          favoriteItems
            .map((product) => String(product.id))
            .filter(Boolean),
        );
        const unavailable = [
          typeResult.status === "rejected" ? "tipos de producto" : null,
          providerResult.status === "rejected" ? "proveedores" : null,
          warehouseResult.status === "rejected" ? "bodegas" : null,
          tagResult.status === "rejected" ? "categorías" : null,
          favoriteResult.status === "rejected" ? "favoritos" : null,
        ].filter(Boolean);
        if (unavailable.length)
          setError(
            `Productos cargados, pero no se pudieron consultar: ${unavailable.join(", ")}.`,
          );
      },
      )
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

  const favoriteSet = useMemo(
    () => new Set(favoriteIds.map((id) => String(id))),
    [favoriteIds],
  );

  const brands = useMemo(
    () =>
      [...new Set(
        products
          .map((product) => String(product.brand ?? "").trim())
          .filter(Boolean),
      )].sort((left, right) => left.localeCompare(right, "es")),
    [products],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const isFavorite = favoriteSet.has(String(product.recordId));
        const matchesFilter =
          statusFilter === "favoritos"
            ? isFavorite
            : statusFilter === "todos" ||
              (statusFilter === "activos" ? product.active : !product.active);
        const matchesBrand = !brandFilter || product.brand === brandFilter;
        return (
          matchesFilter &&
          matchesBrand &&
          `${product.code} ${product.name} ${product.brand}`
            .toLowerCase()
            .includes(searchTerm.trim().toLowerCase())
        );
      }),
    [brandFilter, favoriteSet, products, searchTerm, statusFilter],
  );
  const selectedProduct =
    products.find((product) => product.recordId === selectedId) ?? null;
  const shownProduct = editing ? draft : selectedProduct;
  const canEdit = canAccess?.("PRODUCTS_EDIT") ?? true;
  const canInventoryEdit = canAccess?.("INVENTORY_EDIT") ?? true;
  const hasChanges = useMemo(
    () => hasProductDraftChanges(draft, selectedProduct),
    [draft, selectedProduct],
  );
  const selectedIndex = filteredProducts.findIndex(
    (product) => product.recordId === selectedId,
  );
  const canMovePrevious = selectedIndex > 0;
  const canMoveNext =
    selectedIndex >= 0 && selectedIndex < filteredProducts.length - 1;

  function selectProduct(recordId) {
    setSelectedId(recordId);
    setProductProfit(null);
    setPendingImage(null);
    setEditing(false);
    setDraft(null);
    setPriceEditor(null);
    setUnitsEditor(null);
    setBarcodeEditor(null);
    setInventoryEditor(null);
    setFieldErrors({});
    setError("");
    setNotice("");
    const product = products.find((item) => item.recordId === recordId);
    if (product) {
      setDraft(toEditableProduct(product));
      setEditing(true);
    }
  }
  async function toggleFavorite(recordId) {
    const normalizedId = String(recordId);
    if (favoriteLoadingId) return;
    const isFavorite = favoriteSet.has(normalizedId);
    setFavoriteLoadingId(normalizedId);
    setError("");
    try {
      if (isFavorite)
        await apiClient.delete(`/productos/${recordId}/favorito`);
      else await apiClient.put(`/productos/${recordId}/favorito`);
      setFavoriteIds((current) =>
        isFavorite
          ? current.filter((id) => id !== normalizedId)
          : [...current, normalizedId],
      );
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setFavoriteLoadingId(null);
    }
  }
  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  function updateProduct(recordId, changes) {
    setProducts((current) =>
      current.map((item) =>
        item.recordId === recordId ? { ...item, ...changes } : item,
      ),
    );
    if (recordId === selectedId) {
      setDraft((current) => (current ? { ...current, ...changes } : current));
    }
  }
  function handleRequestError(requestError) {
    setError(requestError.message);
    if (isAuthError(requestError)) onRequestLogin?.();
  }

  function handleAdd() {
    if (!canEdit) return;
    setSelectedId(null);
    setProductProfit(null);
    setPendingImage(null);
    setDraft(createEmptyProductDraft(productTypes, providers, warehouses));
    setEditing(true);
    setActiveTab("main");
    setFieldErrors({});
    setError("");
    setNotice("");
  }

  async function handleCreateProductType(name) {
    const normalizedName = name.trim();
    if (!normalizedName)
      throw new Error("Escribe el nombre del tipo de producto.");
    const created = await apiClient.post("/tipos-producto", {
      name: normalizedName,
    });
    setProductTypes((current) => [...current, created]);
    updateDraft("productTypeId", String(created.id));
    updateDraft("type", created.name);
    return created;
  }

  function requestCreateProductType() {
    setCatalogDialog("product-type");
    setError("");
  }

  async function handleCreateWarehouse(location) {
    const normalizedLocation = location.trim();
    if (!normalizedLocation) throw new Error("Escribe el nombre de la bodega.");
    const created = await apiClient.post("/bodegas", {
      location: normalizedLocation,
    });
    setWarehouses((current) => [...current, created]);
    updateDraft("warehouseId", String(created.id));
    updateDraft("warehouse", created.location);
    setError("");
    return created;
  }

  function requestCreateWarehouse() {
    setCatalogDialog("warehouse");
    setError("");
  }

  async function handleCatalogDialogSave(value) {
    if (catalogDialog === "product-type") await handleCreateProductType(value);
    else await handleCreateWarehouse(value);
    setCatalogDialog(null);
  }

  async function handleSave() {
    if (
      !canEdit ||
      !draft ||
      !hasChanges ||
      saving ||
      deleting ||
      actionLoading
    )
      return;
    setError("");
    setFieldErrors({});
    const validationErrors = validateProductDraft(draft);
    if (selectedId !== null && !draft.code.trim())
      validationErrors.code = "El código es obligatorio.";
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError("Corrige los campos marcados antes de guardar.");
      return;
    }
    setSaving(true);
    const wasCreating = selectedId === null;
    const priceChangeReason = wasCreating
      ? ""
      : requestBulkPriceChangeReason(
          draft.prices,
          selectedProduct?.prices,
          draft.taxRate,
        );
    if (priceChangeReason === null) {
      setSaving(false);
      setError("El cambio de precio requiere una razón.");
      return;
    }
    const draftCode = draft.code.trim();
    const currentCode = selectedProduct?.code ?? "";
    const costValue = parseDecimalInput(draft.cost);
    const currentCost = Number(selectedProduct?.cost ?? 0);
    const activeCost = selectedProduct?.costs?.find(
      (cost) => cost.isActive !== false,
    );
    const body = {
      productTypeId: Number(draft.productTypeId),
      providerId: Number(draft.providerId),
      providerIds: (draft.providerIds ?? [])
        .map((providerId) => Number(providerId))
        .filter((providerId) => Number.isInteger(providerId) && providerId > 0),
      tagIds: (draft.tagIds ?? [])
        .map((tagId) => Number(tagId))
        .filter((tagId) => Number.isInteger(tagId) && tagId > 0),
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      taxRate: parseDecimalInput(draft.taxRate) || 0,
      unit: draft.unit,
      brand: draft.brand.trim(),
      minimumStock: Number(draft.minimumStock) || 0,
      maximumStock:
        draft.maximumStock === ""
          ? undefined
          : parseDecimalInput(draft.maximumStock),
      isActive: Boolean(draft.active),
      ...(wasCreating && getConfiguredPriceBodies(draft.prices, draft.taxRate).length
        ? { prices: getConfiguredPriceBodies(draft.prices, draft.taxRate) }
        : {}),
      ...(selectedId === null && draft.warehouseId
        ? {
            warehouses: [
              {
                warehouseId: Number(draft.warehouseId),
                quantity: parseDecimalInput(draft.initialStock) || 0,
              },
            ],
          }
        : {}),
      ...(selectedId !== null && draft.warehouseId
        ? { warehouseId: Number(draft.warehouseId) }
        : {}),
      ...(wasCreating && draftCode
        ? {
            barcodes: [
              {
                code: draftCode,
                type: inferBarcodeType(draftCode),
                isPrimary: true,
              },
            ],
          }
        : {}),
    };
    try {
      const saved = selectedId
        ? await apiClient.patch(`/productos/${selectedId}`, body)
        : await apiClient.post("/productos", body);
      let normalized = mapProduct(saved);

      if (!wasCreating) {
        await syncProductPrices(
          saved.id,
          draft.prices,
          selectedProduct?.prices ?? [],
          draft.taxRate,
          priceChangeReason,
        );
        normalized = mapProduct(await apiClient.get(`/productos/${saved.id}`));
      }

      // Estas operaciones solo dependen del id creado y pueden ejecutarse
      // simultáneamente. Al final se hace una única lectura consolidada.
      const followUpRequests = [];
      if (!wasCreating && draftCode && draftCode !== currentCode) {
        const currentPrimaryBarcode = selectedProduct?.barcodes?.find(
          (barcode) => barcode.isPrimary,
        );
        followUpRequests.push(
          currentPrimaryBarcode
            ? apiClient.patch(`/codigos-barras/${currentPrimaryBarcode.id}`, {
                code: draftCode,
                type: inferBarcodeType(draftCode),
                isPrimary: true,
              })
            : apiClient.post(`/productos/${saved.id}/codigos-barras`, {
                code: draftCode,
                type: inferBarcodeType(draftCode),
                isPrimary: true,
              }),
        );
      }
      if (
        Number.isFinite(costValue) &&
        costValue > 0 &&
        (wasCreating ||
          costValue !== currentCost ||
          draft.unit !== selectedProduct?.unit)
      ) {
        followUpRequests.push(
          apiClient.post(`/productos/${saved.id}/costos`, {
            cost: costValue,
            unit: draft.unit,
            quantity: 1,
            isActive: true,
          }),
        );
      } else if (
        !wasCreating &&
        costValue === 0 &&
        currentCost > 0 &&
        activeCost
      ) {
        followUpRequests.push(
          apiClient.delete(`/costos-producto/${activeCost.id}`),
        );
      }
      if (wasCreating && pendingImage) {
        const formData = new FormData();
        formData.append("image", pendingImage.file);
        followUpRequests.push(
          apiClient.upload(`/productos/${saved.id}/imagen`, formData),
        );
      }
      if (followUpRequests.length) {
        await Promise.all(followUpRequests);
        normalized = mapProduct(await apiClient.get(`/productos/${saved.id}`));
      }
      setProducts((current) =>
        selectedId
          ? current.map((item) =>
              item.recordId === selectedId ? { ...item, ...normalized } : item,
            )
          : [...current, normalized],
      );
      setPendingImage(null);
      if (wasCreating) {
        setSelectedId(normalized.recordId);
        setDraft(toEditableProduct(normalized));
        setEditing(true);
        setActiveTab("main");
        setNotice("Producto creado. Los cuatro precios quedan disponibles en la misma ficha.");
      } else {
        setSelectedId(normalized.recordId);
        setDraft(toEditableProduct(normalized));
        setEditing(false);
        setActiveTab("main");
        setNotice("Cambios guardados. Puedes continuar con el siguiente producto.");
        // Las utilidades no deben bloquear la confirmación ni el siguiente
        // producto; se actualizan cuando el panel ya está disponible.
        void loadProductProfit(normalized.recordId);
      }
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete() {
    if (!canEdit || deleting || saving || actionLoading) return;
    if (
      selectedId === null ||
      !window.confirm(
        "¿Deseas eliminar definitivamente este producto? Si tiene documentos o movimientos relacionados, se desactivará y conservará su información.",
      )
    )
      return;
    setDeleting(true);
    setError("");
    try {
      await apiClient.delete(`/productos/${selectedId}`);
      const remaining = products.filter((item) => item.recordId !== selectedId);
      setProducts(remaining);
      setFavoriteIds((current) =>
        current.filter((id) => id !== String(selectedId)),
      );
      setPendingImage(null);
      const nextProduct = remaining[0] ?? null;
      setSelectedId(nextProduct?.recordId ?? null);
      setDraft(
        nextProduct
          ? toEditableProduct(nextProduct)
          : createEmptyProductDraft(productTypes, providers, warehouses),
      );
      setEditing(true);
      setFieldErrors({});
    } catch (requestError) {
      if (!isProductRelationError(requestError)) {
        handleRequestError(requestError);
      } else {
        try {
          const deactivated = mapProduct(
            await apiClient.patch(`/productos/${selectedId}/desactivar`, {}),
          );
          const nextProducts = products.map((item) =>
            item.recordId === selectedId ? deactivated : item,
          );
          const remaining = nextProducts.filter(
            (item) => item.recordId !== selectedId,
          );
          setProducts(nextProducts);
          setPendingImage(null);
          const nextProduct = remaining[0] ?? null;
          setSelectedId(nextProduct?.recordId ?? null);
          setDraft(
            nextProduct
              ? toEditableProduct(nextProduct)
              : createEmptyProductDraft(productTypes, providers, warehouses),
          );
          setEditing(true);
          setFieldErrors({});
          setError(
            "El producto tiene documentos o movimientos relacionados y fue desactivado; se conservó su información.",
          );
        } catch (deactivateError) {
          handleRequestError(deactivateError);
        }
      }
    } finally {
      setDeleting(false);
    }
  }
  async function handleImageUpload(event) {
    if (!canEdit) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!selectedId) {
      const previewUrl = URL.createObjectURL(file);
      setPendingImage({ file, previewUrl });
      updateDraft("imageUrl", previewUrl);
      setError("");
      return;
    }
    const formData = new FormData();
    formData.append("image", file);
    setImageUploading(true);
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
    } finally {
      setImageUploading(false);
    }
  }
  async function handleRemoveImage() {
    if (!canEdit) return;
    if (!selectedId) {
      setPendingImage(null);
      updateDraft("imageUrl", "");
      return;
    }
    if (!shownProduct?.imageUrl) return;
    setImageRemoving(true);
    setError("");
    try {
      await apiClient.delete(`/productos/${selectedId}/imagen`);
      updateProduct(selectedId, { imageUrl: "" });
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setImageRemoving(false);
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
    if (recordId === selectedId)
      setDraft((current) =>
        current ? toEditableProduct({ ...current, ...refreshed }) : current,
      );
    await loadProductProfit(recordId);
  }

  async function loadProductProfit(recordId) {
    if (!recordId) {
      setProductProfit(null);
      return;
    }
    try {
      setProductProfit(await apiClient.get(`/productos/${recordId}/utilidades`));
    } catch {
      setProductProfit(null);
    }
  }

  function openInventoryEditor(item = null) {
    if (!canInventoryEdit) return;
    if (!selectedId) {
      setError("Guarda el producto antes de ajustar sus existencias.");
      return;
    }
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
    if (!canInventoryEdit) return;
    if (!selectedId || !inventoryEditor || actionLoading) return;
    const quantity = parseDecimalInput(inventoryEditor.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError("La existencia debe ser un número mayor o igual a cero.");
      return;
    }
    setActionLoading("inventory");
    setError("");
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
    } finally {
      setActionLoading("");
    }
  }

  function openPriceEditor(price = null) {
    if (!canEdit) return;
    if (!selectedId) {
      setError("Guarda primero el producto para agregar sus precios.");
      return;
    }
    const draft = price ? toPriceDraft(price) : createPriceDraft(shownProduct);
    if (!draft) {
      setError("Este producto ya tiene configurados Precio 0, Precio 1, Precio 2 y Precio 3.");
      return;
    }
    setError("");
    setPriceEditor(
      draft,
    );
  }
  async function savePrice() {
    if (!canEdit) return;
    if (!selectedId || !priceEditor || actionLoading) return;
    const priceValue = parseDecimalInput(priceEditor.price);
    const quantityValue = parseDecimalInput(priceEditor.quantity);
    const priceLevel = Number(priceEditor.priceLevel);
    if (!Number.isInteger(priceLevel) || !PRICE_LEVELS.includes(priceLevel)) {
      setError("Selecciona un nivel entre Precio 0 y Precio 3.");
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setError("El precio debe ser un número mayor que cero.");
      return;
    }
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      setError("La cantidad debe ser un número mayor que cero.");
      return;
    }
    const body = buildPriceBody(
      { ...priceEditor, priceLevel },
      shownProduct?.taxRate,
    );
    setActionLoading("price");
    setError("");
    try {
      if (priceEditor.id) {
        const original = shownProduct?.prices?.find(
          (price) => Number(price.id) === Number(priceEditor.id),
        );
        const priceChanged =
          original && Number(original.price) !== Number(priceEditor.price);
        if (priceChanged) {
          const reason = window.prompt(
            "Escribe la razón del cambio de precio para guardarlo en el historial:",
            "",
          );
          if (!reason?.trim()) {
            setActionLoading("");
            setError("El cambio de precio requiere una razón.");
            return;
          }
          body.reason = reason.trim();
        }
        await apiClient.patch(`/precios-producto/${priceEditor.id}`, body);
      } else await apiClient.post(`/productos/${selectedId}/precios`, body);
      await refreshProduct(selectedId);
      setPriceEditor(null);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setActionLoading("");
    }
  }
  async function deletePrice(price) {
    if (!canEdit) return;
    if (actionLoading) return;
    if (
      !price.id ||
      !window.confirm(`¿Deseas desactivar el precio ${price.name}?`)
    )
      return;
    setActionLoading("price-delete");
    setError("");
    try {
      await apiClient.delete(`/precios-producto/${price.id}`);
      await refreshProduct(selectedId);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setActionLoading("");
    }
  }
  async function markPriceDefault(price) {
    if (!canEdit) return;
    if (!price.id || actionLoading) return;
    setActionLoading("price-default");
    setError("");
    try {
      await apiClient.patch(`/precios-producto/${price.id}/default`, {});
      await refreshProduct(selectedId);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setActionLoading("");
    }
  }

  async function saveUnits() {
    if (!canEdit) return;
    if (!selectedId || !unitsEditor || actionLoading) return;
    const hasUnitsPerPackage =
      unitsEditor.unitsPerPackage !== "" &&
      unitsEditor.unitsPerPackage !== null &&
      unitsEditor.unitsPerPackage !== undefined;
    const hasPackagesPerBox =
      unitsEditor.packagesPerBox !== "" &&
      unitsEditor.packagesPerBox !== null &&
      unitsEditor.packagesPerBox !== undefined;
    const unitsPerPackage = Number(unitsEditor.unitsPerPackage);
    const packagesPerBox = Number(unitsEditor.packagesPerBox);
    if (
      (hasUnitsPerPackage &&
        (!Number.isInteger(unitsPerPackage) || unitsPerPackage <= 0)) ||
      (hasPackagesPerBox &&
        (!Number.isInteger(packagesPerBox) || packagesPerBox <= 0))
    ) {
      setError(
        "Las unidades por empaque y los empaques por caja deben ser enteros mayores que cero.",
      );
      return;
    }
    setActionLoading("units");
    setError("");
    try {
      const saved = await apiClient.patch(`/productos/${selectedId}`, {
        packaging: {
          unitsPerPackage:
            !hasUnitsPerPackage
              ? undefined
              : unitsPerPackage,
          packagesPerBox:
            !hasPackagesPerBox
              ? undefined
              : packagesPerBox,
          saleByUnitOnly: unitsEditor.saleByUnitOnly,
          notes: String(unitsEditor.notes ?? "").trim() || undefined,
        },
      });
      updateProduct(selectedId, mapProduct(saved));
      setUnitsEditor(null);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setActionLoading("");
    }
  }

  function openBarcodeEditor(barcode = null) {
    if (!canEdit) return;
    if (!selectedId) {
      setError("Guarda el producto antes de registrar un código de barras.");
      return;
    }
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
    if (!canEdit) return;
    if (!selectedId || !barcodeEditor?.code.trim() || actionLoading) {
      setError("Escribe o escanea un código de barras.");
      return;
    }
    setActionLoading("barcode");
    setError("");
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
    } finally {
      setActionLoading("");
    }
  }
  async function deleteBarcode(barcode) {
    if (!canEdit) return;
    if (actionLoading) return;
    if (
      !barcode.id ||
      !window.confirm(`¿Deseas desactivar el código ${barcode.code}?`)
    )
      return;
    setActionLoading("barcode-delete");
    setError("");
    try {
      await apiClient.delete(`/codigos-barras/${barcode.id}`);
      await refreshProduct(selectedId);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setActionLoading("");
    }
  }
  async function markBarcodePrimary(barcode) {
    if (!canEdit) return;
    if (!barcode.id || actionLoading) return;
    setActionLoading("barcode-default");
    setError("");
    try {
      await apiClient.patch(`/codigos-barras/${barcode.id}/principal`, {});
      await refreshProduct(selectedId);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setActionLoading("");
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
            <select
              className="product-brand-filter"
              aria-label="Filtrar por marca"
              value={brandFilter}
              onChange={(event) => setBrandFilter(event.target.value)}
            >
              <option value="">Todas las marcas</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <SearchOptionsMenu value={statusFilter} onChange={setStatusFilter} />
          </div>
          <div className="product-list-controls">
            <span>
              {filteredProducts.length} producto{filteredProducts.length === 1 ? "" : "s"}
            </span>
            <div className="product-list-control-actions" role="group" aria-label="Vista del listado">
              <button
                type="button"
                className={productView === "list" ? "is-active" : ""}
                aria-label="Vista de lista"
                aria-pressed={productView === "list"}
                title="Vista de lista"
                onClick={() => setProductView("list")}
              >
                <List size={14} />
              </button>
              <button
                type="button"
                className={productView === "grid" ? "is-active" : ""}
                aria-label="Vista de tarjetas"
                aria-pressed={productView === "grid"}
                title="Vista de tarjetas con imagen"
                onClick={() => setProductView("grid")}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                type="button"
                className={statusFilter === "favoritos" ? "is-active favorite-filter" : "favorite-filter"}
                aria-label="Mostrar favoritos"
                aria-pressed={statusFilter === "favoritos"}
                title="Mostrar solo favoritos"
                onClick={() =>
                  setStatusFilter((current) =>
                    current === "favoritos" ? "todos" : "favoritos",
                  )
                }
              >
                <Star size={13} fill={statusFilter === "favoritos" ? "currentColor" : "none"} />
                <span>{favoriteIds.length}</span>
              </button>
            </div>
          </div>
          <div
            className="provider-table product-list-table"
            role="table"
            aria-label="Listado de productos"
          >
            <div className="provider-table-head" role="row">
              <span>Código</span>
              <span>Producto</span>
              <span aria-label="Favorito" />
            </div>
            {productView === "grid" ? (
              <div className="product-card-grid" role="list">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.recordId}
                    product={product}
                    selected={product.recordId === selectedId}
                    favorite={favoriteSet.has(String(product.recordId))}
                    onSelect={selectProduct}
                    onToggleFavorite={toggleFavorite}
                    favoriteLoading={favoriteLoadingId === String(product.recordId)}
                  />
                ))}
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div
                  className={
                    product.recordId === selectedId
                      ? "product-list-row is-selected"
                      : "product-list-row"
                  }
                  role="row"
                  key={product.recordId}
                >
                  <button
                    className={
                      product.recordId === selectedId
                        ? "provider-table-row is-selected"
                        : "provider-table-row"
                    }
                    type="button"
                    onClick={() => selectProduct(product.recordId)}
                  >
                    <span>{product.code}</span>
                    <span>{product.name}</span>
                  </button>
                  <FavoriteButton
                    product={product}
                    favorite={favoriteSet.has(String(product.recordId))}
                    onToggle={toggleFavorite}
                    loading={favoriteLoadingId === String(product.recordId)}
                  />
                </div>
              ))
            )}
            {loading && <div className="window-state">Cargando productos…</div>}
            {!loading && !filteredProducts.length && (
              <div className="window-state">No hay productos para mostrar.</div>
            )}
            {productView === "list" && (
              <div className="provider-empty-rows" aria-hidden="true">
                {Array.from({
                  length: Math.max(0, 9 - filteredProducts.length),
                }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
            )}
          </div>
        </aside>
        <div className="provider-detail-panel product-detail-panel">
          <div className="provider-summary-form product-summary-form">
            <EditableSummaryField
              label="Código"
              value={shownProduct?.code ?? ""}
              editing={editing && canEdit}
              onChange={(value) => updateDraft("code", value)}
              error={fieldErrors?.code}
            />
            <EditableSummaryField
              label="Nombre"
              value={shownProduct?.name ?? ""}
              editing={editing && canEdit}
              onChange={(value) => updateDraft("name", value)}
              error={fieldErrors?.name}
            />
            <div className="summary-field summary-type">
              <label>Estado</label>
              {editing && canEdit ? (
                <select
                  className="detail-input"
                  value={shownProduct?.active ? "true" : "false"}
                  onChange={(event) =>
                    updateDraft("active", event.target.value === "true")
                  }
                >
                  <option value="true">ACTIVO</option>
                  <option value="false">INACTIVO</option>
                </select>
              ) : (
                <input
                  value={shownProduct?.active ? "ACTIVO" : "INACTIVO"}
                  readOnly
                />
              )}
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
              editing={editing && canEdit}
              onChange={updateDraft}
              fieldErrors={fieldErrors}
              productTypes={productTypes}
              providers={providers}
              brands={brands}
              warehouses={warehouses}
              tags={tags}
              productProfit={productProfit}
              onUpload={handleImageUpload}
              onRemoveImage={handleRemoveImage}
              imageUploading={imageUploading}
              imageRemoving={imageRemoving}
              onCreateProductType={requestCreateProductType}
              onCreateWarehouse={requestCreateWarehouse}
              priceEditor={priceEditor}
              onOpenPrice={openPriceEditor}
              onEditPrice={openPriceEditor}
              onChangePrice={setPriceEditor}
              onSavePrice={savePrice}
              onCancelPrice={() => setPriceEditor(null)}
              onDeletePrice={deletePrice}
              onDefaultPrice={markPriceDefault}
              unitsEditor={unitsEditor}
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
              canEdit={canEdit}
              canInventoryEdit={canInventoryEdit}
              actionLoading={actionLoading}
            />
          ) : (
            <div className="provider-tab-panel empty-provider-panel">
              <strong>Agrega un producto para comenzar.</strong>
            </div>
          )}
          {editing && hasChanges && (
            <div className="product-change-actions" role="group" aria-label="Acciones de cambios">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || deleting || Boolean(actionLoading) || !canEdit}
              >
                {saving ? (
                  <LoaderCircle className="button-spinner" size={14} />
                ) : (
                  <Check size={14} />
                )}
                {saving ? "Guardando…" : selectedId !== null ? "Guardar cambios" : "Crear producto"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFieldErrors({});
                if (selectedProduct) setDraft(toEditableProduct(selectedProduct));
                  else {
                    setSelectedId(null);
                    setDraft(
                      createEmptyProductDraft(productTypes, providers, warehouses),
                    );
                    setEditing(true);
                  }
                  setPendingImage(null);
                  setError("");
                  setNotice("");
                }}
                disabled={saving || deleting || Boolean(actionLoading)}
              >
                <CircleX size={14} /> Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
      {notice && (
        <TransientMessage
          className="window-success"
          icon={<Check size={14} />}
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
            onClick={handleAdd}
            disabled={!canEdit || saving || deleting || Boolean(actionLoading)}
          >
            <Plus size={14} /> Agregar
          </button>
          {selectedProduct && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canEdit || deleting || saving || Boolean(actionLoading)}
            >
              {deleting ? (
                <LoaderCircle className="button-spinner" size={14} />
              ) : (
                <Trash2 size={14} />
              )}
              {deleting ? "Eliminando…" : "Borrar"}
            </button>
          )}
        </div>
        <div className="provider-navigation-actions">
          <button
            type="button"
            className="muted-action"
            disabled={!canMovePrevious || editing && hasChanges || saving || deleting || Boolean(actionLoading)}
            onClick={() => moveSelection(-1)}
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <button
            type="button"
            className="muted-action"
            disabled={!canMoveNext || editing && hasChanges || saving || deleting || Boolean(actionLoading)}
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
      <CatalogCreateDialog
        kind={catalogDialog}
        onSave={handleCatalogDialogSave}
        onCancel={() => setCatalogDialog(null)}
      />
    </section>
  );
}

function ProductDetails({
  activeTab,
  product,
  editing,
  onChange,
  fieldErrors,
  productTypes,
  providers,
  brands,
  warehouses,
  tags,
  onUpload,
  onRemoveImage,
  ...actions
}) {
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
        canInventoryEdit={actions.canInventoryEdit}
        canEdit={actions.canEdit}
        onCreateWarehouse={actions.onCreateWarehouse}
        actionLoading={actions.actionLoading}
      />
    );
  if (activeTab === "barcodes")
    return <BarcodePanel product={product} {...actions} />;
  return (
    <div className="product-main-composite">
      <div className="provider-main-details product-main-details">
      <ProductImage
        product={product}
        editing={editing}
        onUpload={onUpload}
        onRemoveImage={onRemoveImage}
        imageUploading={actions.imageUploading}
        imageRemoving={actions.imageRemoving}
        canEdit={actions.canEdit}
      />
      <ProductField
        label="Tipo de producto"
        value={product.type}
        editing={editing}
        onChange={(value) => {
          if (value === CREATE_PRODUCT_TYPE_VALUE) {
            actions.onCreateProductType?.();
            return;
          }
          onChange("productTypeId", value);
          onChange(
            "type",
            productTypes.find((item) => String(item.id) === String(value))
              ?.name ??
              "",
          );
        }}
        error={fieldErrors?.productTypeId}
        options={[
          {
            value: CREATE_PRODUCT_TYPE_VALUE,
            label: "＋ Crear nuevo tipo…",
          },
          ...productTypes.map((item) => ({
            value: item.id,
            label: item.name,
          })),
        ]}
        select
      />
      <BooleanField
        label="Activo"
        checked={product.active}
        editing={editing}
        onChange={(value) => onChange("active", value)}
      />
      <ProductField
        label="Nombre"
        value={product.name}
        editing={editing}
        onChange={(value) => onChange("name", value)}
        error={fieldErrors?.name}
        wide
      />
      <ProductField
        label="Descripción (opcional)"
        value={product.description}
        editing={editing}
        onChange={(value) => onChange("description", value)}
        wide
      />
      <BrandField
        label="Marca"
        value={product.brand}
        editing={editing}
        onChange={(value) => onChange("brand", value)}
        brands={brands}
        error={fieldErrors?.brand}
      />
      <ProductField
        label="Proveedor principal"
        value={product.provider}
        editing={editing}
        onChange={(value) => {
          onChange("providerId", value);
          onChange(
            "provider",
            providers.find((item) => String(item.id) === String(value))?.name ??
              "",
          );
        }}
        error={fieldErrors?.providerId}
        options={providers.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        select
      />
      <div className="product-relation-fields">
        <ProviderMultiSelectField
          label="Proveedores secundarios"
          value={product.providerIds ?? []}
          editing={editing}
          providers={providers.filter(
            (provider) => String(provider.id) !== String(product.providerId),
          )}
          onChange={(value) => onChange("providerIds", value)}
        />
        <ProviderMultiSelectField
          label="Categorías"
          value={product.tagIds ?? []}
          editing={editing}
          providers={tags ?? []}
          onChange={(value) => onChange("tagIds", value)}
          optionLabelKey="name"
        />
      </div>
      <ProductField
        label="Unidad"
        value={product.unit}
        editing={editing}
        onChange={(value) => onChange("unit", value)}
        options={units.map((value) => ({ value, label: value }))}
        select
      />
      <ProductField
        label="IVA de venta (%)"
        value={`${product.taxRate}`}
        editing={editing}
        type="text"
        inputMode="decimal"
        onChange={(value) => onChange("taxRate", value)}
        error={fieldErrors?.taxRate}
      />
      <ProductField
        label="Stock mínimo"
        value={String(product.minimumStock)}
        editing={editing}
        onChange={(value) => onChange("minimumStock", value)}
        error={fieldErrors?.minimumStock}
      />
      <ProductField
        label="Stock máximo"
        value={String(product.maximumStock ?? "")}
        editing={editing}
        onChange={(value) => onChange("maximumStock", value)}
        error={fieldErrors?.maximumStock}
      />
      {!product.recordId && (
        <ProductField
          label="Stock inicial"
          type="number"
          value={String(product.initialStock ?? 0)}
          editing={editing}
          onChange={(value) => onChange("initialStock", value)}
          error={fieldErrors?.initialStock}
        />
      )}
      <ProductField
        label="Stock total (calculado)"
        value={String(product.stock)}
        computed
      />
      <ProductField
        label="Costo adquisición (sin IVA)"
        type="text"
        inputMode="decimal"
        value={String(product.cost ?? 0)}
        editing={editing}
        onChange={(value) => onChange("cost", value)}
        error={fieldErrors?.cost}
        displayValue={formatCurrency(product.cost)}
        accent
      />
      <ProductField
        label="Inventario total (sin IVA)"
        value={formatCurrency(Number(product.cost ?? 0) * Number(product.stock ?? 0))}
        accent
      />
      <ProductField
        label="Bodega"
        value={product.warehouseId}
        displayValue={product.warehouse}
        editing={editing}
        onChange={(value) => {
          if (value === CREATE_WAREHOUSE_VALUE) {
            actions.onCreateWarehouse?.();
            return;
          }
          onChange("warehouseId", value);
          onChange(
            "warehouse",
            warehouses.find((item) => String(item.id) === String(value))
              ?.location ??
              "",
          );
        }}
        options={[
          {
            value: "",
            label: warehouses.length
              ? "Selecciona una bodega"
              : "No hay bodegas activas",
          },
          {
            value: CREATE_WAREHOUSE_VALUE,
            label: "＋ Crear nueva bodega…",
          },
          ...warehouses.map((item) => ({
            value: item.id,
            label: item.location,
          })),
        ]}
        error={fieldErrors?.warehouseId}
        select
      />
      </div>
      <PricesPanel
        product={product}
        productProfit={actions.productProfit}
        editing={editing}
        onChange={onChange}
        fieldErrors={fieldErrors}
        canEdit={actions.canEdit}
        actionLoading={actions.actionLoading}
      />
      <UnitsPanel
        product={product}
        unitsEditor={actions.unitsEditor}
        onChangeUnits={actions.onChangeUnits}
        onSaveUnits={actions.onSaveUnits}
        onCancelUnits={actions.onCancelUnits}
        canEdit={actions.canEdit}
        actionLoading={actions.actionLoading}
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
  canInventoryEdit = true,
  canEdit = true,
  onCreateWarehouse,
  actionLoading = "",
}) {
  const inventory = product.warehouses ?? [];
  const canAdjustInventory = canInventoryEdit && Boolean(product.recordId);

  return (
    <div className="provider-tab-panel data-panel inventory-panel">
      <PanelHeading
        title="Inventario por bodega"
        description="Usa el costo de adquisición sin IVA."
        action={
          <div className="product-panel-heading-actions">
            <button
              type="button"
              className="inline-action"
              onClick={onCreateWarehouse}
              disabled={!canEdit || !onCreateWarehouse}
            >
              <Plus size={14} /> Crear bodega
            </button>
            <button
              type="button"
              className="inline-action"
              onClick={() => onOpenInventory()}
              disabled={!canAdjustInventory || Boolean(actionLoading)}
            >
              {actionLoading === "inventory" ? (
                <LoaderCircle className="button-spinner" size={14} />
              ) : (
                <Edit3 size={14} />
              )}
              {actionLoading === "inventory"
                ? "Guardando…"
                : "Ajustar existencias"}
            </button>
          </div>
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
                <th>Costo adquisición (sin IVA)</th>
                <th>Inventario total (sin IVA)</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const itemWarehouseId = Number(item.warehouseId);
                const isEditing =
                  Number(inventoryEditor?.warehouseId) === itemWarehouseId;
                const quantity = Number(item.quantity ?? 0);
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
                          type="text"
                          inputMode="decimal"
                          min="0"
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
                    <td>{formatCurrency(Number(product.cost ?? 0) * quantity)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="table-empty">
            {product.recordId
              ? "No hay existencias por bodega. Puedes crear la primera con “Ajustar existencias”."
              : "Guarda el producto para poder ajustar sus existencias por bodega."}
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
              type="text"
              inputMode="decimal"
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
              disabled={Boolean(actionLoading)}
            >
              {actionLoading === "inventory" ? (
                <LoaderCircle className="button-spinner" size={13} />
              ) : (
                <Check size={13} />
              )}
              {actionLoading === "inventory"
                ? "Guardando…"
                : "Guardar existencia"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PricesPanel({
  product,
  productProfit,
  canEdit = true,
  actionLoading = "",
  editing = false,
  onChange,
  fieldErrors,
}) {
  const allPrices = product.prices ?? [];
  const hasDefault = allPrices.some((price) => Boolean(price.isDefault));
  const taxRate = parseDecimalInput(product.taxRate);
  const priceRows = PRICE_LEVELS.map((level) => {
    const existing = allPrices.find(
      (candidate) => getPriceLevel(candidate) === level,
    );
    return {
      level,
      price: existing ?? {
        id: null,
        name: priceLabel(level),
        priceLevel: level,
        price: "",
        unit: product.unit ?? "UND",
        quantity: "1",
        isDefault: !hasDefault && level === 0,
        isActive: true,
      },
    };
  });

  function updatePrice(level, changes) {
    const current = allPrices.find(
      (candidate) => getPriceLevel(candidate) === level,
    );
    const nextPrice = {
      ...(current ?? {
        id: null,
        name: priceLabel(level),
        priceLevel: level,
        unit: product.unit ?? "UND",
        quantity: "1",
        isDefault: false,
        isActive: true,
      }),
      ...changes,
      priceLevel: level,
      name: priceLabel(level),
    };
    const nextPrices = current
      ? allPrices.map((price) =>
          getPriceLevel(price) === level ? nextPrice : price,
        )
      : [...allPrices, nextPrice];
    onChange?.(
      "prices",
      changes.isDefault
        ? nextPrices.map((price) => ({
            ...price,
            isDefault: getPriceLevel(price) === level,
          }))
        : nextPrices,
    );
  }

  const configuredCount = priceRows.filter(
    ({ price }) => parseDecimalInput(price.price) > 0,
  ).length;
  return (
    <div className="provider-tab-panel data-panel">
      <PanelHeading
        title="Costos y precios"
        description="Captura los cuatro precios generales en una sola ficha."
      />
      <div className="price-tax-setting">
        <ProductField
          label="IVA de venta (%)"
          value={`${product.taxRate ?? 0}`}
          editing={editing}
          onChange={(value) => onChange?.("taxRate", value)}
          inputMode="decimal"
          error={fieldErrors?.taxRate}
        />
        <p>
          Escribe el precio final que verá el cliente, con IVA incluido. El
          sistema calcula el valor antes de IVA y el IVA cobrado.
        </p>
      </div>
      <div className="cost-summary">
        <CostMetric
          label="Costo adquisición (sin IVA)"
          value={product.cost}
        />
        <CostMetric label="Costo promedio" value={averageCost(product.costs)} />
        <CostMetric
          label="Costo anterior"
          value={previousCost(product.costs, product.cost)}
        />
      </div>
      <p className="table-hint price-bulk-hint">
        Puedes completar Precio 0, Precio 1, Precio 2 y Precio 3 antes de
        guardar. Los campos se guardan juntos con el producto.
      </p>
      <div className="product-price-bulk-wrap">
        <table className="product-price-bulk-table">
          <thead>
            <tr>
              <th>Precio general</th>
              <th>Precio de venta (IVA incluido)</th>
              <th>Precio antes de IVA</th>
              <th>IVA cobrado</th>
              <th>Unidad</th>
              <th>Cantidad</th>
              <th>Ganancia sin IVA</th>
              <th>Margen sin IVA</th>
              <th>Principal</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {priceRows.map(({ level, price }) => {
              const metrics = calculatePricePreview(price, product, productProfit, taxRate);
              const disabled = !canEdit || Boolean(actionLoading);
              return (
                <tr key={level}>
                  <td className="price-level-cell">{priceLabel(level)}</td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={price.price ?? ""}
                      placeholder="0"
                      disabled={disabled}
                      onChange={(event) =>
                        updatePrice(level, { price: event.target.value })
                      }
                      aria-label={`${priceLabel(level)} precio de venta con IVA`}
                    />
                  </td>
                  <td>
                    <div className="price-input-preview">
                      <strong>{metrics.net == null ? "—" : formatCurrency(metrics.net)}</strong>
                      <small>Calculado automáticamente</small>
                    </div>
                  </td>
                  <td>{metrics.tax == null ? "—" : formatCurrency(metrics.tax)}</td>
                  <td>
                    <select
                      value={price.unit ?? product.unit ?? "UND"}
                      disabled={disabled}
                      onChange={(event) =>
                        updatePrice(level, { unit: event.target.value })
                      }
                    >
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={price.quantity ?? "1"}
                      disabled={disabled}
                      onChange={(event) =>
                        updatePrice(level, { quantity: event.target.value })
                      }
                      aria-label={`${priceLabel(level)} cantidad`}
                    />
                  </td>
                  <td>{metrics.profit == null ? "—" : formatCurrency(metrics.profit)}</td>
                  <td>{metrics.margin == null ? "—" : `${formatDecimal(metrics.margin)}%`}</td>
                  <td className="price-default-cell">
                    <input
                      type="radio"
                      name="product-default-price"
                      checked={Boolean(price.isDefault)}
                      disabled={disabled || metrics.gross == null}
                      onChange={() => updatePrice(level, { isDefault: true })}
                      aria-label={`Usar ${priceLabel(level)} como principal`}
                    />
                  </td>
                  <td>
                    <label className="inline-check compact-check">
                      <input
                        type="checkbox"
                        checked={price.isActive !== false}
                        disabled={disabled}
                        onChange={(event) =>
                          updatePrice(level, { isActive: event.target.checked })
                        }
                      />
                      Activo
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {productProfit?.prices?.some((price) => price.warning) && (
        <p className="table-hint product-margin-warning">
          {productProfit.prices.find((price) => price.warning)?.warning}
        </p>
      )}
      {productProfit?.warning && (
        <p className="table-hint">{productProfit.warning}</p>
      )}
      <p className="table-hint">
        {configuredCount} de 4 precios configurados. La ganancia sin IVA
        compara el precio antes de IVA contra el costo de adquisición sin IVA.
      </p>
    </div>
  );
}

function UnitsPanel({
  product,
  unitsEditor,
  onChangeUnits,
  onSaveUnits,
  onCancelUnits,
  canEdit = true,
  actionLoading = "",
}) {
  const packaging = product.packagingProfile ?? {};
  const values = unitsEditor ?? packaging;
  const canManageUnits = canEdit && Boolean(product.recordId);
  return (
    <div className="provider-tab-panel data-panel">
      <PanelHeading
        title="Unidades y empaque"
        description="Configuración de venta detallada del producto."
      />
      {!product.recordId && (
        <p className="table-hint">
          Guarda primero el producto para configurar sus unidades y empaque.
        </p>
      )}
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
           disabled={!canManageUnits || Boolean(actionLoading)}
           onChange={(value) =>
             onChangeUnits((current) => ({
               ...packaging,
               ...current,
               unitsPerPackage: value,
             }))
           }
        />
        <EditorField
           label="Empaques por caja"
           type="number"
           value={values.packagesPerBox ?? ""}
           disabled={!canManageUnits || Boolean(actionLoading)}
           onChange={(value) =>
             onChangeUnits((current) => ({
               ...packaging,
               ...current,
               packagesPerBox: value,
             }))
           }
        />
        <EditorField
           label="Notas"
           value={values.notes ?? ""}
           disabled={!canManageUnits || Boolean(actionLoading)}
           onChange={(value) =>
             onChangeUnits((current) => ({
               ...packaging,
               ...current,
               notes: value,
             }))
           }
          wide
        />
        <label className="inline-check">
          <input
            type="checkbox"
            checked={Boolean(values.saleByUnitOnly)}
            disabled={!canManageUnits || Boolean(actionLoading)}
            onChange={(event) =>
              onChangeUnits((current) => ({
                ...packaging,
                ...current,
                saleByUnitOnly: event.target.checked,
              }))
            }
          />{" "}
          Vender únicamente por unidad
          </label>
      </div>
      {unitsEditor && (
        <div className="units-change-actions inline-editor-actions">
          <button type="button" onClick={onCancelUnits}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSaveUnits}
            className="primary-action"
            disabled={!canManageUnits || Boolean(actionLoading)}
          >
            {actionLoading === "units" ? (
              <LoaderCircle className="button-spinner" size={13} />
            ) : (
              <Check size={13} />
            )}
            {actionLoading === "units" ? "Guardando…" : "Guardar unidades"}
          </button>
        </div>
      )}
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
              {PRICE_LEVELS.map((level) => {
                const price = product.prices.find(
                  (candidate) => getPriceLevel(candidate) === level,
                );
                return (
                <tr key={level}>
                  <td>{priceLabel(level)}</td>
                  <td>{price?.unit ?? "—"}</td>
                  <td>{price?.quantity ?? "—"}</td>
                  <td>{price ? formatCurrency(Number(price.price)) : "No configurado"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="table-empty">
            Configura los precios en la pestaña Precios.
          </div>
        )}
      </div>
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
  canEdit = true,
  actionLoading = "",
}) {
  const canManageBarcodes = canEdit && Boolean(product.recordId);
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
              disabled={!canManageBarcodes || Boolean(actionLoading)}
            >
              <Camera size={14} /> Cámara
            </button>
            <button
              type="button"
              className="inline-action"
              onClick={onOpenReader}
              disabled={!canManageBarcodes || Boolean(actionLoading)}
            >
              <ScanLine size={14} /> Lector físico
            </button>
            <label
              className={`inline-action ${!canManageBarcodes ? "is-disabled" : ""}`}
            >
              <Upload size={14} /> Leer imagen
              <input
                type="file"
                accept="image/*"
                className="hidden-file"
                disabled={!canManageBarcodes || Boolean(actionLoading)}
                onChange={async (event) => {
                  if (!canEdit) return;
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
              disabled={!canManageBarcodes || Boolean(actionLoading)}
            >
              <Plus size={14} /> Agregar
            </button>
          </div>
        }
      />
      {!product.recordId && (
        <p className="table-hint">
          Guarda primero el producto para registrar códigos de barras.
        </p>
      )}
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
          canEdit={canEdit}
          actionLoading={actionLoading}
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
  canEdit = true,
  actionLoading = "",
}) {
  const isSaving = actionLoading === "barcode";
  const isDeleting = actionLoading === "barcode-delete";
  const isMarkingPrimary = actionLoading === "barcode-default";
  const isBusy = Boolean(actionLoading);
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
          disabled={isBusy}
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
          disabled={isBusy}
          onChange={(value) =>
            onChange((current) => ({ ...current, type: value }))
          }
        />
      </div>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={Boolean(editor.isPrimary)}
          disabled={isBusy}
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
            disabled={!canEdit || isBusy}
          >
            {isDeleting ? (
              <LoaderCircle className="button-spinner" size={13} />
            ) : (
              <Trash2 size={13} />
            )}
            {isDeleting ? "Desactivando…" : "Desactivar"}
          </button>
        )}
        {editor.id && !editor.isPrimary && (
          <button
            type="button"
            onClick={() => onPrimary(editor)}
            disabled={!canEdit || isBusy}
          >
            {isMarkingPrimary ? "Guardando…" : "Marcar principal"}
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          className="primary-action"
          disabled={!canEdit || isBusy}
        >
          {isSaving ? (
            <LoaderCircle className="button-spinner" size={13} />
          ) : (
            <Check size={13} />
          )}
          {isSaving ? "Guardando…" : "Guardar código"}
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

function ProductCard({
  product,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
  favoriteLoading,
}) {
  return (
    <article
      className={`product-card ${selected ? "is-selected" : ""}`}
      role="listitem"
    >
      <button
        type="button"
        className="product-card-select"
        onClick={() => onSelect(product.recordId)}
        aria-label={`Abrir producto ${product.name}`}
      >
        <ProductThumbnail product={product} />
        <span className="product-card-copy">
          <strong>{product.name || "Producto sin nombre"}</strong>
          <span>{product.code}</span>
          <small>
            Stock {product.stock ?? 0} · {formatCurrency(product.cost)}
          </small>
        </span>
      </button>
      <FavoriteButton
        product={product}
        favorite={favorite}
        onToggle={onToggleFavorite}
        loading={favoriteLoading}
      />
    </article>
  );
}

function FavoriteButton({ product, favorite, onToggle, loading = false }) {
  const unavailable = product.active === false && !favorite;
  return (
    <button
      type="button"
      className={`product-favorite-button ${favorite ? "is-active" : ""} ${unavailable ? "is-disabled" : ""}`}
      aria-label={
        loading
          ? `Guardando favorito de ${product.name}`
          : unavailable
            ? `Activa ${product.name} para guardarlo como favorito`
          : favorite
              ? `Quitar ${product.name} de favoritos`
              : `Agregar ${product.name} a favoritos`
      }
      aria-pressed={favorite}
      aria-busy={loading}
      title={
        unavailable
          ? "Activa el producto para guardarlo como favorito"
          : favorite
            ? "Quitar de favoritos"
            : "Agregar a favoritos"
      }
      onClick={() => {
        if (!unavailable) onToggle(product.recordId);
      }}
      disabled={loading || unavailable}
    >
      {loading ? (
        <LoaderCircle className="button-spinner" size={14} />
      ) : (
        <Heart size={15} fill={favorite ? "currentColor" : "none"} />
      )}
    </button>
  );
}

function ProductThumbnail({ product }) {
  return product.imageUrl ? (
    <img
      className="product-card-image"
      src={product.imageUrl}
      alt=""
      loading="lazy"
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  ) : (
    <span className="product-card-image product-card-image-placeholder">
      <Package size={24} />
    </span>
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

function CatalogCreateDialog({ kind, onSave, onCancel }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!kind) return null;
  const isProductType = kind === "product-type";
  const title = isProductType ? "Crear tipo de producto" : "Crear bodega";
  const label = isProductType ? "Nombre" : "Nombre o ubicación";

  async function submit(event) {
    event.preventDefault();
    if (value.trim().length < 2) {
      setError(`Escribe un ${isProductType ? "nombre" : "nombre o ubicación"} válido.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(value);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="barcode-dialog catalog-create-dialog" onSubmit={submit}>
        <div className="inline-editor-title">
          <strong>{title}</strong>
          <button type="button" onClick={onCancel} disabled={saving}>
            <X size={14} />
          </button>
        </div>
        <p>
          El registro se guardará en el catálogo y quedará seleccionado en el
          formulario de productos.
        </p>
        <label className="editor-field editor-field-wide">
          <span>{label}</span>
          <input
            autoFocus
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
            disabled={saving}
          />
        </label>
        {error && <div className="inline-error">{error}</div>}
        <div className="inline-editor-actions">
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="primary-action" disabled={saving}>
            {saving ? (
              <LoaderCircle className="button-spinner" size={13} />
            ) : (
              <Check size={13} />
            )}
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
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
function ProductImage({
  product,
  editing,
  onUpload,
  onRemoveImage,
  imageUploading = false,
  imageRemoving = false,
  canEdit = true,
}) {
  const imageBusy = imageUploading || imageRemoving;
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
      {editing && onUpload && canEdit && (
        <div className="product-image-actions">
          <label className="image-upload-button">
            {imageUploading ? (
              <LoaderCircle className="button-spinner" size={13} />
            ) : (
              <Upload size={13} />
            )}
            {imageUploading ? "Cargando…" : "Cargar"}
            <input
              type="file"
              accept="image/*"
              onChange={onUpload}
              disabled={imageBusy}
            />
          </label>
          {product.imageUrl && (
            <button
              type="button"
              onClick={onRemoveImage}
              disabled={imageBusy}
            >
              {imageRemoving && (
                <LoaderCircle className="button-spinner" size={13} />
              )}
              {imageRemoving ? "Quitando…" : "Quitar"}
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
  className = "",
}) {
  const tableWrapRef = useRef(null);

  useEffect(() => {
    if (className.includes("prices-data-table-wrap")) {
      tableWrapRef.current?.scrollTo({ left: 0, top: 0 });
    }
  }, [caption, className]);

  return (
    <div
      ref={tableWrapRef}
      className={`provider-data-table-wrap ${className}`.trim()}
    >
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
function EditableSummaryField({
  label,
  value,
  editing = false,
  onChange,
  error = "",
}) {
  return (
    <div className={`summary-field ${error ? "has-error" : ""}`}>
      <label>{label}</label>
      <input
        className={error ? "is-invalid" : ""}
        value={value ?? ""}
        readOnly={!editing}
        aria-invalid={Boolean(error)}
        title={error || undefined}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function ProductField({
  label,
  value,
  editing,
  onChange,
  type = "text",
  select = false,
  options = [],
  wide = false,
  accent = false,
  computed = false,
  displayValue,
  error = "",
  inputMode,
}) {
  return (
    <div
      className={`detail-field ${wide ? "wide-field" : ""} ${
        error ? "has-error" : ""
      }`}
    >
      <label>{label}</label>
      {editing && onChange ? (
        select ? (
          <select
            className={`detail-input ${error ? "is-invalid" : ""}`}
            value={
              options.find((option) => String(option.label) === String(value))
                ?.value ??
              value ??
              ""
            }
            aria-invalid={Boolean(error)}
            title={error || undefined}
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
            type={type}
            inputMode={inputMode}
            className={`detail-input ${accent ? "is-accent" : ""} ${
              error ? "is-invalid" : ""
            }`}
            value={value ?? ""}
            aria-invalid={Boolean(error)}
            title={error || undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      ) : (
        <div
          className={`detail-control ${select ? "select-like" : ""} ${accent ? "is-accent" : ""} ${computed ? "is-computed" : ""}`}
        >
          <span>{displayValue ?? (value || " ")}</span>
          {select && <ChevronDown size={13} />}
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function BrandField({ label, value, editing, onChange, brands = [], error = "" }) {
  const inputId = "product-brand-input";
  const listId = "product-brand-options";
  return (
    <div className={`detail-field ${error ? "has-error" : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      {editing ? (
        <input
          id={inputId}
          list={listId}
          className={`detail-input ${error ? "is-invalid" : ""}`}
          value={value ?? ""}
          placeholder="Selecciona o escribe una marca"
          aria-invalid={Boolean(error)}
          title={error || undefined}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <div className="detail-control">
          <span>{value || " "}</span>
        </div>
      )}
      {editing && (
        <datalist id={listId}>
          {brands.map((brand) => (
            <option key={brand} value={brand} />
          ))}
        </datalist>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function ProviderMultiSelectField({
  label,
  value = [],
  editing,
  providers = [],
  onChange,
  optionLabelKey = "name",
}) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  const selectedIds = value.map((providerId) => String(providerId));
  const selectedOptions = selectedIds.map((selectedId) => {
    const option = providers.find((provider) => String(provider.id) === selectedId);
    return option ?? { id: selectedId, [optionLabelKey]: `Opción #${selectedId}` };
  });
  function toggleOption(optionId) {
    const normalizedId = String(optionId);
    onChange?.(
      selectedIds.includes(normalizedId)
        ? selectedIds.filter((selectedId) => selectedId !== normalizedId)
        : [...selectedIds, normalizedId],
    );
  }

  useEffect(() => {
    if (!open) return undefined;
    const closeWhenOutside = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, [open]);

  return (
    <div className="detail-field provider-secondary-field">
      <label>{label}</label>
      {editing ? (
        <div
          ref={fieldRef}
          className={`multi-select-field ${open ? "is-open" : ""}`}
        >
          <button
            type="button"
            className="multi-select-trigger"
            aria-label={label}
            aria-expanded={open}
            title={selectedOptions.map((option) => option[optionLabelKey]).join(", ")}
            onClick={() => setOpen((current) => !current)}
          >
            <span>
              {selectedIds.length
                ? `${selectedIds.length} seleccionada${selectedIds.length === 1 ? "" : "s"}`
                : `Seleccionar ${label.toLowerCase()}`}
            </span>
            <ChevronDown size={13} />
          </button>
          {open && (
            <div
              className="multi-select-menu"
              role="group"
              aria-label={`Opciones de ${label}`}
            >
              {providers.length ? (
                providers.map((provider) => {
                  const optionId = String(provider.id);
                  return (
                    <label className="multi-select-option" key={provider.id}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(optionId)}
                        onChange={() => toggleOption(optionId)}
                      />
                      <span>{provider[optionLabelKey]}</span>
                    </label>
                  );
                })
              ) : (
                <span className="multi-select-empty">No hay opciones activas</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="detail-control provider-secondary-value">
          <span>
            {selectedOptions.length
              ? selectedOptions.map((option) => option[optionLabelKey]).join(", ")
              : "Ninguno"}
          </span>
        </div>
      )}
    </div>
  );
}

function BooleanField({ label, checked, editing, onChange }) {
  return (
    <div className="detail-field active-field">
      <label>{label}</label>
      {editing ? (
        <input
          className="detail-checkbox-input"
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : (
        <span className="checkbox-value">
          <span className={checked ? "fake-checkbox" : "fake-checkbox is-empty"}>
            {checked && <Check size={12} />}
          </span>
          {checked ? "Sí" : "No"}
        </span>
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
  inputMode,
}) {
  return (
    <label className={`editor-field ${wide ? "editor-field-wide" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        inputMode={inputMode}
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
    providerIds: (product.providers ?? [])
      .filter(
        (provider) =>
          !provider.isPrimary &&
          String(provider.id) !== String(product.providerId),
      )
      .map((provider) => provider.id),
    brand: product.brand ?? "",
    unit: product.unit ?? "UND",
    taxRate: Number(product.taxRate ?? 0),
    minimumStock: Number(product.minimumStock ?? 0),
    maximumStock: product.maximumStock ?? "",
    stock,
    cost,
    active: product.isActive !== false,
    warehouseId: warehouses[0]?.warehouseId ?? "",
    warehouse: warehouses[0]?.warehouse?.location ?? "",
    warehouses,
    barcodes: product.barcodes ?? [],
    tagIds: (product.tags ?? []).map((tag) => tag.id),
    prices: product.prices ?? [],
    packagingProfile: product.packagingProfile ?? null,
    imageUrl: product.imageUrl ?? "",
  };
}

function createInitialPriceDrafts(unit = "UND") {
  return PRICE_LEVELS.map((level) => ({
    id: null,
    name: priceLabel(level),
    priceLevel: level,
    price: "",
    unit,
    quantity: "1",
    isDefault: level === 0,
    isActive: true,
  }));
}

function toEditableProduct(product) {
  if (!product) return product;
  return {
    ...product,
    prices: toEditablePrices(product.prices, product.taxRate),
  };
}

function toEditablePrices(prices, taxRate) {
  return (prices ?? []).map((price) => ({
    ...toPriceDraft(price),
    price:
      price.price == null
        ? ""
        : formatInputAmount(grossPriceFromNet(Number(price.price), taxRate)),
  }));
}

function grossPriceFromNet(value, taxRate) {
  const net = Number(value);
  const rate = Number(taxRate) || 0;
  if (!Number.isFinite(net)) return 0;
  return roundMoney(net * (1 + rate / 100));
}

function netPriceFromGross(value, taxRate) {
  const gross = Number(value);
  const rate = Number(taxRate) || 0;
  if (!Number.isFinite(gross)) return 0;
  return roundMoney(gross / (1 + rate / 100));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatInputAmount(value) {
  return Number.isFinite(Number(value)) ? String(roundMoney(value)) : "";
}

function toPriceDraft(price) {
  return {
    ...price,
    originalPriceLevel: getPriceLevel(price) ?? 0,
    priceLevel: getPriceLevel(price) ?? 0,
    name: priceLabel(getPriceLevel(price) ?? 0),
    price: String(price.price ?? ""),
    quantity: String(price.quantity ?? 1),
    unit: price.unit ?? "UND",
    isDefault: Boolean(price.isDefault),
    isActive: price.isActive !== false,
  };
}
function createPriceDraft(product) {
  const usedLevels = new Set(
    (product?.prices ?? [])
      .map(getPriceLevel)
      .filter((level) => level !== null && level !== undefined),
  );
  const priceLevel = PRICE_LEVELS.find((level) => !usedLevels.has(level));
  if (priceLevel === undefined) return null;
  return {
    name: priceLabel(priceLevel),
    priceLevel,
    price: "1",
    unit: product?.unit ?? "UND",
    quantity: "1",
    isDefault: !(product?.prices ?? []).length,
    isActive: true,
  };
}
function buildPriceBody(editor, taxRate = 0) {
  const priceLevel = Number(editor.priceLevel);
  return {
    name: priceLabel(priceLevel),
    priceLevel,
    price: netPriceFromGross(parseDecimalInput(editor.price), taxRate),
    unit: editor.unit,
    quantity: parseDecimalInput(editor.quantity) || 1,
    isDefault: Boolean(editor.isDefault),
    isActive: editor.isActive !== false,
    startsAt: null,
    endsAt: null,
  };
}
function getConfiguredPriceBodies(prices, taxRate) {
  return (prices ?? [])
    .filter((price) => parseDecimalInput(price.price) > 0)
    .map((price) => buildPriceBody(price, taxRate));
}

function requestBulkPriceChangeReason(draftPrices, currentPrices, taxRate) {
  const currentByLevel = new Map(
    (currentPrices ?? []).map((price) => [getPriceLevel(price), price]),
  );
  const changed = (draftPrices ?? []).some((price) => {
    const current = currentByLevel.get(getPriceLevel(price));
    const nextGross = parseDecimalInput(price.price);
    return (
      current &&
      nextGross > 0 &&
      Math.abs(
        netPriceFromGross(nextGross, taxRate) - Number(current.price ?? 0),
      ) > 0.005
    );
  });
  if (!changed) return "";
  const reason = window.prompt(
    "Escribe la razón del cambio de precio para guardarlo en el historial:",
    "",
  );
  return reason?.trim() || null;
}

async function syncProductPrices(
  productId,
  draftPrices,
  currentPrices,
  taxRate,
  priceChangeReason,
) {
  const currentByLevel = new Map(
    (currentPrices ?? []).map((price) => [getPriceLevel(price), price]),
  );
  const requests = (draftPrices ?? [])
    .filter((price) => parseDecimalInput(price.price) > 0)
    .map((price) => {
      const body = buildPriceBody(price, taxRate);
      const current = currentByLevel.get(getPriceLevel(price));
      if (!current)
        return apiClient.post(`/productos/${productId}/precios`, body);
      const amountChanged =
        Math.abs(Number(current.price ?? 0) - body.price) > 0.005;
      const changed =
        amountChanged ||
        String(current.unit ?? "") !== String(body.unit ?? "") ||
        Number(current.quantity ?? 1) !== Number(body.quantity ?? 1) ||
        Boolean(current.isDefault) !== Boolean(body.isDefault) ||
        (current.isActive !== false) !== (body.isActive !== false);
      if (!changed) return null;
      const updateBody = { ...body };
      delete updateBody.startsAt;
      delete updateBody.endsAt;
      return apiClient.patch(`/precios-producto/${current.id}`, {
        ...updateBody,
        ...(amountChanged && priceChangeReason
          ? { reason: priceChangeReason }
          : {}),
      });
    })
    .filter(Boolean);
  if (requests.length) await Promise.all(requests);
}

function calculatePricePreview(price, product, productProfit, taxRate) {
  const gross = parseDecimalInput(price.price);
  if (!Number.isFinite(gross) || gross <= 0)
    return { gross: null, net: null, tax: null, profit: null, margin: null };
  const net = netPriceFromGross(gross, taxRate);
  const tax = roundMoney(gross - net);
  const quantity = parseDecimalInput(price.quantity) || 1;
  const cost = Number(product.cost ?? 0) * quantity;
  const fallbackProfit = productProfit?.prices?.find(
    (item) => Number(item.priceId) === Number(price.id),
  );
  const profit =
    Number.isFinite(cost) && cost > 0
      ? roundMoney(net - cost)
      : fallbackProfit?.profitAmount == null
        ? null
        : Number(fallbackProfit.profitAmount);
  const margin =
    profit == null || net <= 0
      ? fallbackProfit?.profitPercentage == null
        ? null
        : Number(fallbackProfit.profitPercentage)
      : (profit / net) * 100;
  return { gross, net, tax, profit, margin };
}

function getPriceLevel(price) {
  if (price?.priceLevel !== null && price?.priceLevel !== undefined)
    return Number(price.priceLevel);
  const match = String(price?.name ?? "").match(/^precio\s*([0-3])$/i);
  return match ? Number(match[1]) : null;
}
function priceLabel(level) {
  return `Precio ${Number(level)}`;
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
function hasProductDraftChanges(draft, product) {
  if (!draft) return false;
  if (!product) return true;
  const fields = [
    "code",
    "productTypeId",
    "providerId",
    "warehouseId",
    "name",
    "description",
    "taxRate",
    "unit",
    "brand",
    "minimumStock",
    "maximumStock",
    "cost",
    "active",
  ];
  const scalarChanged = fields.some(
    (field) => String(draft[field] ?? "") !== String(product[field] ?? ""),
  );
  if (scalarChanged) return true;
  const draftProviders = (draft.providerIds ?? []).map(String).sort();
  const productProviders = (product.providerIds ?? []).map(String).sort();
  if (draftProviders.join(",") !== productProviders.join(",")) return true;
  if ((draft.tagIds ?? []).map(String).sort().join(",") !==
    (product.tagIds ?? []).map(String).sort().join(",")) return true;
  const normalizePrices = (prices, taxRate, isDraft = false) =>
    (prices ?? [])
      .filter((price) => !isDraft || parseDecimalInput(price.price) > 0)
      .map((price) => ({
        level: getPriceLevel(price),
        price: isDraft
          ? netPriceFromGross(parseDecimalInput(price.price), taxRate)
          : Number(price.price),
        unit: price.unit,
        quantity: Number(price.quantity ?? 1),
        isDefault: Boolean(price.isDefault),
        isActive: price.isActive !== false,
      }))
      .sort(comparePriceDrafts);
  return JSON.stringify(normalizePrices(draft.prices, draft.taxRate, true)) !==
    JSON.stringify(normalizePrices(product.prices, product.taxRate));
}
function validateProductDraft(product) {
  const errors = {};
  if (!product.productTypeId)
    errors.productTypeId = "Selecciona el tipo de producto.";
  if (!product.providerId)
    errors.providerId = "Selecciona el proveedor principal.";
  if (!product.name?.trim()) errors.name = "El nombre es obligatorio.";
  else if (product.name.trim().length < 2)
    errors.name = "El nombre debe tener al menos 2 caracteres.";
  if (!product.brand?.trim()) errors.brand = "La marca es obligatoria.";
  const numericFields = [
    ["taxRate", "El IVA de venta debe ser un número mayor o igual a cero."],
    ["minimumStock", "El stock mínimo debe ser un entero mayor o igual a cero."],
    ["cost", "El precio de costo debe ser un número mayor o igual a cero."],
    ["initialStock", "El stock inicial debe ser un entero mayor o igual a cero."],
  ];
  for (const [field, message] of numericFields) {
    const value = parseDecimalInput(product[field]);
    if (!Number.isFinite(value) || value < 0 || (field !== "taxRate" && field !== "cost" && !Number.isInteger(value)))
      errors[field] = message;
  }
  const taxRate = parseDecimalInput(product.taxRate);
  if (Number.isFinite(taxRate) && taxRate > 100)
    errors.taxRate = "El IVA de venta no puede superar 100%.";
  if (product.maximumStock !== "" && product.maximumStock !== null) {
    const maximumStock = parseDecimalInput(product.maximumStock);
    if (!Number.isInteger(maximumStock) || maximumStock < 0)
      errors.maximumStock = "El stock máximo debe ser un entero mayor o igual a cero.";
  }
  if (parseDecimalInput(product.initialStock) > 0 && !product.warehouseId)
    errors.warehouseId = "Selecciona una bodega para registrar el stock inicial.";
  return errors;
}
function parseDecimalInput(value) {
  if (value === null || value === undefined || String(value).trim() === "")
    return 0;
  return Number(String(value).trim().replace(/,/g, "."));
}
function comparePriceDrafts(left, right) {
  return Number(left.level ?? 0) - Number(right.level ?? 0);
}
function barcodeTypeLabel(type) {
  return barcodeTypes.find(([value]) => value === type)?.[1] ?? type ?? "Otro";
}
function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
function isProductRelationError(error) {
  return /facturas|cotizaciones|compras|ofertas|movimientos|relacionados/i.test(
    error?.message ?? "",
  );
}
function formatCurrency(value) {
  return `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
}
function formatDecimal(value) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(value) || 0);
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
