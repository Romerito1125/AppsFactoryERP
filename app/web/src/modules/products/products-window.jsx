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
  Tag,
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
  };
}

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
  canAccess,
}) {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(initialProductId ?? null);
  const [searchTerm, setSearchTerm] = useState("");
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
          setDraft({ ...firstProduct });
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

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const isFavorite = favoriteSet.has(String(product.recordId));
        const matchesFilter =
          statusFilter === "favoritos"
            ? isFavorite
            : statusFilter === "todos" ||
              (statusFilter === "activos" ? product.active : !product.active);
        return (
          matchesFilter &&
          `${product.code} ${product.name} ${product.brand}`
            .toLowerCase()
            .includes(searchTerm.trim().toLowerCase())
        );
      }),
    [favoriteSet, products, searchTerm, statusFilter],
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
      setDraft({ ...product });
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
    const draftCode = draft.code.trim();
    const currentCode = selectedProduct?.code ?? "";
    const costValue = Number(draft.cost);
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
      taxRate: Number(draft.taxRate) || 0,
      unit: draft.unit,
      brand: draft.brand.trim(),
      minimumStock: Number(draft.minimumStock) || 0,
      maximumStock:
        draft.maximumStock === "" ? undefined : Number(draft.maximumStock),
      isActive: Boolean(draft.active),
      ...(selectedId === null && draft.warehouseId
        ? {
            warehouses: [
              {
                warehouseId: Number(draft.warehouseId),
                quantity: Number(draft.initialStock) || 0,
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
      setActiveTab("main");
      if (wasCreating) {
        setSelectedId(null);
        setDraft(createEmptyProductDraft(productTypes, providers, warehouses));
        setEditing(true);
        setNotice("Producto guardado. Listo para registrar el siguiente.");
      } else {
        setSelectedId(normalized.recordId);
        setDraft({ ...normalized });
        setEditing(false);
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
          ? { ...nextProduct }
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
              ? { ...nextProduct }
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
      setDraft((current) => (current ? { ...current, ...refreshed } : current));
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
    const quantity = Number(inventoryEditor.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("La existencia debe ser un número entero mayor o igual a cero.");
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
      setError("Guarda el producto antes de registrar un precio.");
      return;
    }
    setError("");
    setPriceEditor(
      price ? toPriceDraft(price) : createPriceDraft(shownProduct),
    );
  }
  async function savePrice() {
    if (!canEdit) return;
    if (!selectedId || !priceEditor || actionLoading) return;
    const priceValue = Number(priceEditor.price);
    const quantityValue = Number(priceEditor.quantity);
    if (!priceEditor.name?.trim() || priceEditor.name.trim().length < 2) {
      setError("El nombre del precio debe tener al menos 2 caracteres.");
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
    setActionLoading("price");
    setError("");
    try {
      const body = buildPriceBody(priceEditor);
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
              label="Descripción"
              value={shownProduct?.description ?? ""}
              editing={editing && canEdit}
              onChange={(value) => updateDraft("description", value)}
              error={fieldErrors?.description}
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
                if (selectedProduct) setDraft({ ...selectedProduct });
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
  warehouses,
  tags,
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
        canInventoryEdit={actions.canInventoryEdit}
        canEdit={actions.canEdit}
        onCreateWarehouse={actions.onCreateWarehouse}
        actionLoading={actions.actionLoading}
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
        label="Descripción"
        value={product.description}
        editing={editing}
        onChange={(value) => onChange("description", value)}
        wide
      />
      <ProductField
        label="Marca"
        value={product.brand}
        editing={editing}
        onChange={(value) => onChange("brand", value)}
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
        label="Categorías / subcategorías"
        value={product.tagIds ?? []}
        editing={editing}
        providers={tags ?? []}
        onChange={(value) => onChange("tagIds", value)}
        optionLabelKey="name"
      />
      <ProductField
        label="Unidad"
        value={product.unit}
        editing={editing}
        onChange={(value) => onChange("unit", value)}
        options={units.map((value) => ({ value, label: value }))}
        select
      />
      <ProductField
        label="Impuesto"
        value={`${product.taxRate}`}
        editing={editing}
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
        label="Costo de adquisición"
        type="number"
        value={String(product.cost ?? 0)}
        editing={editing}
        onChange={(value) => onChange("cost", value)}
        error={fieldErrors?.cost}
        displayValue={formatCurrency(product.cost)}
        accent
      />
      <ProductField
        label="Valor inventario"
        value={formatCurrency(product.cost * product.stock)}
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
        description="El valor del inventario usa el costo de adquisición y las existencias."
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
                <th>Costo adquisición</th>
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
  priceEditor,
  onOpenPrice,
  onEditPrice,
  onChangePrice,
  onSavePrice,
  onCancelPrice,
  onDeletePrice,
  onDefaultPrice,
  canEdit = true,
  actionLoading = "",
}) {
  const canManagePrices = canEdit && Boolean(product.recordId);
  const allPrices = product.prices ?? [];
  const activePriceCount = allPrices.filter(isCurrentPrice).length;
  return (
    <div className="provider-tab-panel data-panel">
      <PanelHeading
        title="Costos y precios"
        description="Compara el costo de adquisición con los precios de venta."
        action={
          <button
            type="button"
            className="inline-action"
            onClick={() => onOpenPrice()}
            disabled={!canManagePrices || Boolean(actionLoading)}
          >
            <Plus size={14} /> Agregar precio
          </button>
        }
      />
      {!product.recordId && (
        <p className="table-hint">
          Guarda primero el producto para registrar sus precios.
        </p>
      )}
      <div className="cost-summary">
        <CostMetric label="Costo adquisición" value={product.cost} />
        <CostMetric label="Costo promedio" value={averageCost(product.costs)} />
        <CostMetric
          label="Costo anterior"
          value={previousCost(product.costs, product.cost)}
        />
      </div>
      <ProductDataTable
        caption={`Precios de ${product.name} · ${activePriceCount} activos de ${allPrices.length}`}
        columns={[
          "Nombre",
          "Antes IVA",
          "Después IVA",
          "Unidad",
          "Cantidad",
          "Ganancia",
          "Margen",
          "Principal",
          "Estado",
        ]}
        rows={allPrices.map((price) => {
          const profit = productProfit?.prices?.find(
            (item) => Number(item.priceId) === Number(price.id),
          );
          return [
            price.name,
            formatCurrency(Number(profit?.priceBeforeTax ?? price.price)),
            formatCurrency(
              Number(
                profit?.priceAfterTax ??
                  Number(price.price) * (1 + Number(product.taxRate ?? 0) / 100),
              ),
            ),
            price.unit,
            String(price.quantity ?? 1),
            profit?.profitAmount == null
              ? "—"
              : formatCurrency(Number(profit.profitAmount)),
            profit?.profitPercentage == null
              ? "—"
              : `${profit.profitPercentage}%`,
            price.isDefault ? "Sí" : "No",
            isCurrentPrice(price) ? "Activo" : "Inactivo",
          ];
        })}
        rowKeys={allPrices.map((price) => price.id)}
        onRowDoubleClick={(index) => onEditPrice(allPrices[index])}
        empty="No hay precios registrados."
        />
      {productProfit?.prices?.some((price) => price.warning) && (
        <p className="table-hint product-margin-warning">
          {productProfit.prices.find((price) => price.warning)?.warning}
        </p>
      )}
      {productProfit?.warning && (
        <p className="table-hint">{productProfit.warning}</p>
      )}
      <p className="table-hint">Doble clic sobre una fila para editarla.</p>
      {priceEditor && (
        <PriceEditor
          editor={priceEditor}
          onChange={onChangePrice}
          onSave={onSavePrice}
          onCancel={onCancelPrice}
          onDelete={onDeletePrice}
          onDefault={onDefaultPrice}
          canEdit={canEdit}
          actionLoading={actionLoading}
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
  canEdit = true,
  actionLoading = "",
}) {
  const isSaving = actionLoading === "price";
  const isDeleting = actionLoading === "price-delete";
  const isMarkingDefault = actionLoading === "price-default";
  const isBusy = Boolean(actionLoading);
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
          disabled={isBusy}
          onChange={(value) =>
            onChange((current) => ({ ...current, name: value }))
          }
        />
        <EditorField
          label="Precio"
          type="number"
          value={editor.price}
          disabled={isBusy}
          onChange={(value) =>
            onChange((current) => ({ ...current, price: value }))
          }
        />
        <EditorSelect
          label="Unidad"
          value={editor.unit}
          options={units}
          disabled={isBusy}
          onChange={(value) =>
            onChange((current) => ({ ...current, unit: value }))
          }
        />
        <EditorField
          label="Cantidad"
          type="number"
          value={editor.quantity}
          disabled={isBusy}
          onChange={(value) =>
            onChange((current) => ({ ...current, quantity: value }))
          }
        />
      </div>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={editor.isDefault}
          disabled={isBusy}
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
        {editor.id && !editor.isDefault && (
          <button
            type="button"
            onClick={() => onDefault(editor)}
            disabled={!canEdit || isBusy}
          >
            {isMarkingDefault && (
              <LoaderCircle className="button-spinner" size={13} />
            )}
            {isMarkingDefault ? "Guardando…" : "Marcar principal"}
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
          {isSaving ? "Guardando…" : "Guardar precio"}
        </button>
      </div>
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

function ProviderMultiSelectField({
  label,
  value = [],
  editing,
  providers = [],
  onChange,
  optionLabelKey = "name",
}) {
  const selectedIds = value.map((providerId) => String(providerId));
  const selectedNames = providers
    .filter((provider) => selectedIds.includes(String(provider.id)))
    .map((provider) => provider[optionLabelKey]);

  return (
    <div className="detail-field provider-secondary-field">
      <label>{label}</label>
      {editing ? (
        <select
          multiple
          className="detail-input provider-multi-select"
          value={selectedIds}
          aria-label={label}
          onChange={(event) =>
            onChange?.(
              Array.from(event.target.selectedOptions, (option) => option.value),
            )
          }
        >
          {providers.length ? (
            providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider[optionLabelKey]}
              </option>
            ))
          ) : (
            <option disabled value="">
              No hay opciones activas
            </option>
          )}
        </select>
      ) : (
        <div className="detail-control provider-secondary-value">
          <span>{selectedNames.length ? selectedNames.join(", ") : "Ninguno"}</span>
        </div>
      )}
      {editing && providers.length > 1 && (
        <small className="field-help">Mantén Ctrl/Cmd para seleccionar varios.</small>
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

function toPriceDraft(price) {
  return {
    ...price,
    price: String(price.price ?? ""),
    quantity: String(price.quantity ?? 1),
    unit: price.unit ?? "UND",
    isDefault: Boolean(price.isDefault),
    isActive: price.isActive !== false,
  };
}
function isCurrentPrice(price, now = new Date()) {
  return (
    price?.isActive !== false &&
    (!price?.startsAt || new Date(price.startsAt) <= now) &&
    (!price?.endsAt || new Date(price.endsAt) >= now)
  );
}
function createPriceDraft(product) {
  return {
    name: `Precio ${(product?.prices?.length ?? 0) + 1}`,
    price: "1",
    unit: product?.unit ?? "UND",
    quantity: "1",
    isDefault: !(product?.prices ?? []).length,
    isActive: true,
  };
}
function buildPriceBody(editor) {
  return {
    name: editor.name.trim(),
    price: Number(editor.price),
    unit: editor.unit,
    quantity: Number(editor.quantity) || 1,
    isDefault: Boolean(editor.isDefault),
    isActive: editor.isActive !== false,
    startsAt: null,
    endsAt: null,
  };
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
  return (draft.tagIds ?? []).map(String).sort().join(",") !==
    (product.tagIds ?? []).map(String).sort().join(",");
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
    ["taxRate", "El impuesto debe ser un número mayor o igual a cero."],
    ["minimumStock", "El stock mínimo debe ser un entero mayor o igual a cero."],
    ["cost", "El precio de costo debe ser un número mayor o igual a cero."],
    ["initialStock", "El stock inicial debe ser un entero mayor o igual a cero."],
  ];
  for (const [field, message] of numericFields) {
    const value = Number(product[field]);
    if (!Number.isFinite(value) || value < 0 || (field !== "taxRate" && !Number.isInteger(value)))
      errors[field] = message;
  }
  if (product.maximumStock !== "" && product.maximumStock !== null) {
    const maximumStock = Number(product.maximumStock);
    if (!Number.isInteger(maximumStock) || maximumStock < 0)
      errors.maximumStock = "El stock máximo debe ser un entero mayor o igual a cero.";
  }
  if (Number(product.initialStock) > 0 && !product.warehouseId)
    errors.warehouseId = "Selecciona una bodega para registrar el stock inicial.";
  return errors;
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
