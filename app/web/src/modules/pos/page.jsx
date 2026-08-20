import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  LogOut,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/auth/auth-context'
import { BrandMark } from '@/components/brand/brand-mark'
import { ProductImage } from '@/components/product-image'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatInvoiceSource, formatNumber, formatRole } from '@/lib/format'
import { cn } from '@/lib/utils'

function PosSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr] xl:h-[calc(100vh-4.5rem)]">
      <Skeleton className="h-full rounded-[2rem] min-h-[600px] xl:min-h-0" />
      <Skeleton className="h-full rounded-[2rem] min-h-[600px] xl:min-h-0" />
    </div>
  )
}

function getActivePrices(product) {
  return (product?.prices ?? []).filter((price) => price.isActive)
}

function getDefaultPrice(product) {
  return getActivePrices(product).find((price) => price.isDefault) ?? getActivePrices(product)[0] ?? null
}

function getWarehouseStock(product, warehouseId) {
  if (!warehouseId) {
    return (product?.warehouses ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
  }
  const entry = (product?.warehouses ?? []).find((w) => w.warehouseId === warehouseId)
  return entry ? Number(entry.quantity ?? 0) : 0
}

function getStockToneForWarehouse(product, warehouseId) {
  const stock = getWarehouseStock(product, warehouseId)
  const minimumStock = Number(product.minimumStock ?? 0)

  if (stock <= minimumStock) {
    return {
      label: 'Bajo',
      className: 'border-destructive/25 bg-destructive/10 text-destructive',
    }
  }

  if (stock <= Math.max(minimumStock + 4, 12)) {
    return {
      label: 'Medio',
      className: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }

  return {
    label: 'Disponible',
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  }
}

function getPackagingLabel(product) {
  const profile = product?.packagingProfile
  if (!profile?.unitsPerPackage && !profile?.packagesPerBox) return null
  const packageText = profile.unitsPerPackage ? `1 paquete = ${profile.unitsPerPackage} und.` : null
  const boxText = profile.packagesPerBox && profile.unitsPerPackage ? `1 caja = ${profile.packagesPerBox} paquetes` : null
  return [packageText, boxText].filter(Boolean).join(' · ')
}

function getPriceUnitLabel(price) {
  if (!price?.unit || price.unit === 'UND') return 'unidad'
  return `${price.quantity ?? 1} ${String(price.unit).toLowerCase()}`
}

function getInvoiceActorLabel(invoice) {
  if (invoice.source === 'APP_MOVIL') {
    return 'App movil'
  }

  if (invoice.createdByRole || invoice.createdByUsername) {
    return [invoice.createdByRole ? formatRole(invoice.createdByRole) : null, invoice.createdByUsername]
      .filter(Boolean)
      .join(' · ')
  }

  return formatInvoiceSource(invoice.source)
}

function printReceipt(sale) {
  if (!sale) {
    return
  }

  const receiptWindow = window.open('', '_blank', 'width=460,height=720')
  if (!receiptWindow) {
    return
  }

  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${item.product.name}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
          <td style="text-align:right">${formatCurrency(item.total)}</td>
        </tr>
      `,
    )
    .join('')

  receiptWindow.document.write(`
    <html>
      <head>
        <title>${sale.consecutive}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1,h2,p { margin: 0; }
          .muted { color: #64748b; }
          .section { margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          td, th { padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .total { font-size: 18px; font-weight: 700; }
        </style>
      </head>
      <body>
        <h2>Mundo Tienda Montes de Maria</h2>
        <p class="muted">POS comercial</p>
        <div class="section">
          <p><strong>Factura:</strong> ${sale.consecutive}</p>
          <p><strong>Cliente:</strong> ${sale.client.firstName} ${sale.client.lastName}</p>
          <p><strong>Fecha:</strong> ${formatDate(sale.createdAt)}</p>
          <p><strong>Origen:</strong> ${formatInvoiceSource(sale.source)}</p>
          <p><strong>Realizada por:</strong> ${getInvoiceActorLabel(sale)}</p>
          <p><strong>Modo:</strong> ${sale.saleMode === 'credito' ? 'Credito' : 'Contado'}</p>
        </div>
        <div class="section">
          <table>
            <thead>
              <tr>
                <th style="text-align:left">Producto</th>
                <th style="text-align:center">Cant.</th>
                <th style="text-align:right">Unit.</th>
                <th style="text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="section">
          <p>Subtotal: ${formatCurrency(sale.subtotal)}</p>
          <p>IVA: ${formatCurrency(sale.taxes)}</p>
          <p class="total">Total: ${formatCurrency(sale.total)}</p>
        </div>
      </body>
    </html>
  `)
  receiptWindow.document.close()
  receiptWindow.focus()
  receiptWindow.print()
}

export function PosPage() {
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [productTypeId, setProductTypeId] = useState(null)
  const [visibleLimit, setVisibleLimit] = useState(24)
  const [saleMode, setSaleMode] = useState('contado')
  const [selectedClientId, setSelectedClientId] = useState('NO_CLIENT')
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(() => user?.sub ?? null)
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const due = new Date()
    due.setDate(due.getDate() + 15)
    return due.toISOString().slice(0, 10)
  })
  const [cart, setCart] = useState([])
  const [lastSale, setLastSale] = useState(null)
  const [rightTab, setRightTab] = useState('ticket')
  const [referralDiscount, setReferralDiscount] = useState('0')

  // States for updating/creating price
  const [editingPrice, setEditingPrice] = useState(null) // holds { productId, priceId, name, price, product }
  const [newPriceName, setNewPriceName] = useState('')
  const [newPriceValue, setNewPriceValue] = useState('')
  const [newPriceUnit, setNewPriceUnit] = useState('UND')
  const [priceChangeReason, setPriceChangeReason] = useState('')
  const [priceDialogMode, setPriceDialogMode] = useState('edit') // 'edit' or 'create'

  // Warehouse selection
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null)

  const selectedClientNumericId =
    selectedClientId && selectedClientId !== 'NO_CLIENT' ? Number(selectedClientId) : null

  const assignedWarehouseId = user?.role === 'BODEGA' ? Number(user.warehouseId ?? 0) || null : null
  const effectiveWarehouseId = assignedWarehouseId ?? selectedWarehouseId

  useEffect(() => {
    setVisibleLimit(24)
  }, [deferredSearch, productTypeId, selectedWarehouseId])

  useEffect(() => {
    if (user?.sub && !selectedUserId) {
      setSelectedUserId(user.sub)
    }
  }, [user, selectedUserId])

  const posQuery = useQuery({
    queryKey: ['pos-data'],
    queryFn: async () => {
      const [productTypes, clients, accounts, invoices, users, products, warehouses] = await Promise.all([
        apiClient.getAllPages('/tipos-producto'),
        apiClient.getAllPages('/clientes'),
        apiClient.getAllPages('/cuentas-bancarias'),
        apiClient.getAllPages('/facturas'),
        apiClient.getAllPages('/usuarios'),
        apiClient.getAllPages('/productos', { estado: 'activos', stockStatus: 'CON_STOCK' }),
        apiClient.getAllPages('/bodegas'),
      ])

      return { productTypes, clients, accounts, invoices, users, products, warehouses }
    },
  })

  const referralBalanceQuery = useQuery({
    queryKey: ['pos-cliente-estadisticas-referidos', selectedClientNumericId],
    queryFn: () => apiClient.get(`/clientes/${selectedClientNumericId}/estadisticas-referidos`),
    enabled: Boolean(selectedClientNumericId),
  })

  const specialOffersQuery = useQuery({
    queryKey: ['pos-ofertas-precio-especial', selectedClientNumericId, cart.map((item) => `${item.productId}:${item.quantity}`).join('|')],
    queryFn: () => apiClient.post('/ofertas/aplicables', {
      clientId: selectedClientNumericId,
      items: cart.map((item) => {
        const price = getDefaultPrice(item.product)
        return {
          productId: item.productId,
          productPriceId: item.productPriceId,
          quantity: item.quantity,
          unitPrice: price ? Number(price.price) : undefined,
        }
      }),
    }),
    enabled: Boolean(selectedClientNumericId && cart.length),
    staleTime: 15_000,
  })

  const handleSearchChange = (value) => {
    setSearch(value)
    if (value.trim() !== '') {
      setProductTypeId(null)
    }
  }

  const handleCategoryClick = (id) => {
    setProductTypeId(id)
    setSearch('')
  }

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 120) {
      setVisibleLimit((prev) => Math.min(totalProducts, prev + 24))
    }
  }

  const openEditPriceDialog = (product, price) => {
    setEditingPrice({
      productId: product.id,
      priceId: price.id,
      name: price.name,
      price: price.price,
      product,
    })
    setPriceDialogMode('edit')
    setNewPriceName(price.name)
    setNewPriceValue(String(price.price))
    setNewPriceUnit(price.unit ?? 'UND')
    setPriceChangeReason('')
  }

  const updatePriceMutation = useMutation({
    mutationFn: async () => {
      if (!editingPrice) return

      if (priceDialogMode === 'edit') {
        const updated = await apiClient.patch(`/precios-producto/${editingPrice.priceId}`, {
          price: Number(newPriceValue),
          reason: priceChangeReason || 'Ajuste desde el POS',
        })
        return { mode: 'edit', data: updated }
      } else {
        const created = await apiClient.post(`/productos/${editingPrice.productId}/precios`, {
          name: newPriceName,
          price: Number(newPriceValue),
          unit: newPriceUnit,
          quantity: 1,
          isActive: true,
          isDefault: false,
        })
        return { mode: 'create', data: created }
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pos-data'] })

      if (result.mode === 'edit') {
        setCart((current) =>
          current.map((item) => {
            if (item.productId === editingPrice.productId) {
              const updatedPrices = item.product.prices.map((p) =>
                p.id === editingPrice.priceId ? { ...p, price: Number(newPriceValue) } : p,
              )
              return {
                ...item,
                product: { ...item.product, prices: updatedPrices },
              }
            }
            return item
          }),
        )
        toast.success('Precio registrado actualizado correctamente')
      } else {
        const newPriceRecord = result.data
        setCart((current) =>
          current.map((item) => {
            if (item.productId === editingPrice.productId) {
              const updatedPrices = [...item.product.prices, newPriceRecord]
              return {
                ...item,
                product: { ...item.product, prices: updatedPrices },
              }
            }
            return item
          }),
        )
        toast.success('Nuevo precio registrado creado correctamente')
      }
      setEditingPrice(null)
    },
    onError: (err) => {
      toast.error('Error al guardar precio: ' + err.message)
    },
  })

  const productTypes = useMemo(() => posQuery.data?.productTypes ?? [], [posQuery.data?.productTypes])
  const clients = useMemo(() => posQuery.data?.clients ?? [], [posQuery.data?.clients])
  const accounts = useMemo(() => (posQuery.data?.accounts ?? []).filter((account) => account.isActive !== false), [posQuery.data?.accounts])
  const recentInvoices = useMemo(() => (posQuery.data?.invoices ?? []).slice(0, 6), [posQuery.data?.invoices])
  const users = useMemo(() => {
    const rawUsers = posQuery.data?.users ?? []
    return rawUsers.filter((u) => u.isActive && ['ADMIN', 'CAJERO', 'VENDEDOR'].includes(u.role))
  }, [posQuery.data?.users])

  const warehouses = useMemo(() => (posQuery.data?.warehouses ?? []).filter((w) => w.isActive !== false), [posQuery.data?.warehouses])

  const products = useMemo(() => {
    const raw = posQuery.data?.products ?? []
    return raw.filter((p) => getDefaultPrice(p) !== null)
  }, [posQuery.data?.products])

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      // Filter out products with no stock in the selected warehouse (or total stock if none selected)
      const stock = getWarehouseStock(product, effectiveWarehouseId)
      if (stock <= 0) {
        return false
      }

      const matchesCategory = !productTypeId ? true : product.productTypeId === productTypeId

      const haystack = [product.name, product.brand, product.description, product.productType?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch = haystack.includes(deferredSearch.toLowerCase())

      return matchesCategory && matchesSearch
    })
  }, [products, productTypeId, deferredSearch, effectiveWarehouseId])

  const totalProducts = visibleProducts.length

  const productsData = useMemo(() => {
    return visibleProducts.slice(0, visibleLimit)
  }, [visibleProducts, visibleLimit])

  const activeClientId = selectedClientId ?? 'NO_CLIENT'
  const activeAccountId = selectedAccountId ?? accounts.find((account) => account.isActive !== false)?.id ?? null

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      let targetClientId = activeClientId

      if (activeClientId === 'NO_CLIENT') {
        let consumerFinal = clients.find((c) => c.identification === 'CONSUMIDOR_FINAL')
        if (!consumerFinal) {
          try {
            consumerFinal = await apiClient.post('/clientes', {
              identification: 'CONSUMIDOR_FINAL',
              firstName: 'Consumidor',
              lastName: 'Final',
              clientType: 'MINORISTA',
            })
            queryClient.invalidateQueries({ queryKey: ['pos-data'] })
          } catch (err) {
            throw new Error('No se pudo crear el cliente Consumidor Final: ' + err.message)
          }
        }
        targetClientId = consumerFinal.id
      }

      if (!targetClientId) {
        throw new Error('Selecciona un cliente para continuar')
      }

      if (!cart.length) {
        throw new Error('Agrega al menos un producto al ticket')
      }

      if (user.role === 'BODEGA' && !assignedWarehouseId) {
        throw new Error('Tu usuario Bodega no tiene una bodega asignada')
      }

      if (cart.some((item) => !item.warehouseId)) {
        throw new Error('Selecciona la bodega de salida para cada producto')
      }

      if (saleMode === 'contado' && !activeAccountId) {
        throw new Error('Selecciona una cuenta bancaria para registrar el recaudo')
      }

      if (saleMode === 'credito' && !creditDueDate) {
        throw new Error('Selecciona una fecha de vencimiento para el credito')
      }

      const invoicePayload = {
        clientId: targetClientId,
        referralDiscount: Number(referralDiscount || 0),
        createdByUserId: selectedUserId ?? undefined,
        warehouseId: [...new Set(cartItems.map((item) => item.warehouseId).filter(Boolean))].length === 1
          ? cartItems.find((item) => item.warehouseId)?.warehouseId
          : undefined,
        source: 'POS',
        saleMode: saleMode === 'credito' ? 'CREDITO' : 'CONTADO',
        items: cart.map((item) => ({
          productId: item.productId,
          productPriceId: item.productPriceId,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
          ...(item.customUnitPrice !== undefined ? { unitPrice: item.customUnitPrice } : {}),
        })),
      }

      const invoice = await apiClient.post('/facturas', invoicePayload)

      if (saleMode === 'contado') {
        await apiClient.post('/movimientos-bancarios/ingreso', {
          bankAccountId: activeAccountId,
          amount: Number(invoice.total),
          description: `Recaudo POS ${invoice.consecutive}`,
          invoiceId: invoice.id,
        })
      }

      if (saleMode === 'credito') {
        await apiClient.post(`/facturas/${invoice.id}/credito`, {
          dueDate: creditDueDate,
        })
      }

      return invoice
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['pos-data'] })
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      queryClient.invalidateQueries({ queryKey: ['reportes-overview'] })
      queryClient.invalidateQueries({ queryKey: ['movimientos-bancarios'] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] })
      queryClient.invalidateQueries({ queryKey: ['creditos'] })
      queryClient.invalidateQueries({ queryKey: ['facturas-productos'] })
      setLastSale({ ...invoice, saleMode })
      setCart([])
      setReferralDiscount('0')
      setRightTab('history')
    },
  })

  const cartItems = useMemo(
    () =>
      cart
        .map((item) => {
          const product = item.product
          if (!product) {
            return null
          }
          const price = getActivePrices(product).find((entry) => entry.id === item.productPriceId) ?? getDefaultPrice(product)

          if (!product || !price) {
            return null
          }

          const specialPrice = specialOffersQuery.data?.items?.find((entry) => entry.productId === item.productId)?.effectiveUnitPrice
          const salePrice = item.customUnitPrice ?? (specialPrice !== null && specialPrice !== undefined ? Number(specialPrice) : Number(price.price))
          const subtotal = salePrice * item.quantity
          const taxes = subtotal * (Number(product.taxRate ?? 0) / 100)
          const total = subtotal + taxes

          return {
            ...item,
            product,
            price,
            salePrice,
            subtotal,
            taxes,
            total,
          }
        })
        .filter(Boolean),
    [cart, specialOffersQuery.data],
  )

  const totals = cartItems.reduce(
    (accumulator, item) => {
      accumulator.subtotal += item.subtotal
      accumulator.taxes += item.taxes
      accumulator.total += item.total
      accumulator.items += item.quantity
      return accumulator
    },
    { subtotal: 0, taxes: 0, total: 0, items: 0 },
  )

  const availableReferralDiscount = Number(referralBalanceQuery.data?.descuentoDisponible ?? 0)


  function addProduct(product) {
    const defaultPrice = getDefaultPrice(product)
    if (!defaultPrice) {
      return
    }

    setRightTab('ticket')
    const productWarehouseId = effectiveWarehouseId ?? product.warehouses?.find((item) => Number(item.quantity ?? 0) > 0)?.warehouseId
    setCart((current) => {
      const existing = current.find(
        (item) => item.productId === product.id && item.productPriceId === defaultPrice.id && item.warehouseId === productWarehouseId,
      )

      if (existing) {
        return current.map((item) =>
          item === existing ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }

      return [...current, { productId: product.id, productPriceId: defaultPrice.id, warehouseId: productWarehouseId, quantity: 1, product }]
    })
  }

  function updateQuantity(productId, productPriceId, warehouseId, nextQuantity) {
    if (nextQuantity <= 0) {
      setCart((current) =>
        current.filter(
          (item) => !(item.productId === productId && item.productPriceId === productPriceId && item.warehouseId === warehouseId),
        ),
      )
      return
    }

    setCart((current) =>
      current.map((item) =>
        item.productId === productId && item.productPriceId === productPriceId && item.warehouseId === warehouseId
          ? { ...item, quantity: nextQuantity }
          : item,
      ),
    )
  }

  function updatePrice(productId, currentPriceId, warehouseId, nextPriceId) {
    setCart((current) =>
      current.map((item) =>
        item.productId === productId && item.productPriceId === currentPriceId && item.warehouseId === warehouseId
          ? { ...item, productPriceId: Number(nextPriceId), customUnitPrice: undefined }
          : item,
      ),
    )
  }

  function updateCustomPrice(productId, productPriceId, warehouseId, value) {
    const parsedValue = value === '' ? undefined : Number(value)
    setCart((current) => current.map((item) => (
      item.productId === productId && item.productPriceId === productPriceId && item.warehouseId === warehouseId
        ? { ...item, customUnitPrice: parsedValue }
        : item
    )))
  }

  function updateWarehouse(productId, productPriceId, currentWarehouseId, nextWarehouseId) {
    setCart((current) => current.map((item) => (
      item.productId === productId && item.productPriceId === productPriceId && item.warehouseId === currentWarehouseId
        ? { ...item, warehouseId: Number(nextWarehouseId) }
        : item
    )))
  }

  async function handleCheckout() {
    await toast.promise(checkoutMutation.mutateAsync(), {
      loading: 'Procesando venta en POS...',
      success: 'Venta registrada correctamente',
      error: (error) => error.message,
    })
  }

  if (posQuery.isLoading) {
    return <PosSkeleton />
  }

  if (posQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
        {posQuery.error.message}
      </div>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr] xl:h-[calc(100vh-4.5rem)] xl:max-h-[calc(100vh-4.5rem)] overflow-hidden">
      {/* Left Column (Catalog) */}
      <div className="flex flex-col h-full overflow-hidden gap-4 min-h-0">
        <Card className="shrink-0 border-border/70 bg-card/96 shadow-xl shadow-primary/8">
          <CardContent className="grid gap-5 p-6 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <BrandMark compact />
                <div>
                  <Badge className="mb-2 bg-primary/12 text-primary hover:bg-primary/12">POS independiente</Badge>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                    Punto de venta rápido
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Caja visual para vender por imagen, facturar y registrar recaudos con la API actual.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {user.role === 'ADMIN' ? (
                  <Button asChild variant="outline">
                    <Link to="/dashboard">
                      <ArrowLeft className="mr-2 size-4" />
                      Volver al admin
                    </Link>
                  </Button>
                ) : null}
                <ThemeToggle />
                <Button variant="outline" onClick={logout}>
                  <LogOut className="mr-2 size-4" />
                  Salir
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="Buscar por producto, marca..."
                  className="h-11 rounded-xl pl-9 w-full text-sm md:text-base"
                />
              </div>
              <Select
                value={effectiveWarehouseId ? String(effectiveWarehouseId) : 'ALL_WAREHOUSES'}
                disabled={Boolean(assignedWarehouseId)}
                onValueChange={(value) => {
                  setSelectedWarehouseId(value === 'ALL_WAREHOUSES' ? null : Number(value))
                  setVisibleLimit(24)
                }}
              >
                <SelectTrigger className="h-11 rounded-xl bg-background/50 text-sm font-medium cursor-pointer">
                  <SelectValue placeholder="Todas las Bodegas (Stock Global)" />
                </SelectTrigger>
                <SelectContent>
                  {!assignedWarehouseId ? <SelectItem value="ALL_WAREHOUSES" className="text-sm">Todas las Bodegas (Stock Global)</SelectItem> : null}
                  {(assignedWarehouseId ? warehouses.filter((warehouse) => warehouse.id === assignedWarehouseId) : warehouses).map((w) => (
                    <SelectItem key={w.id} value={String(w.id)} className="text-sm">
                      {w.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1 w-full shrink-0">
                <Button
                  type="button"
                  variant={!productTypeId ? 'default' : 'outline'}
                  onClick={() => handleCategoryClick(null)}
                  className="rounded-full shrink-0 h-9"
                >
                  Todos
                </Button>
                {productTypes.map((pt) => (
                  <Button
                    key={pt.id}
                    type="button"
                    variant={productTypeId === pt.id ? 'default' : 'outline'}
                    onClick={() => handleCategoryClick(pt.id)}
                    className="rounded-full shrink-0 h-9"
                  >
                    {pt.name}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scrollable Catalog Grid */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 pb-4 select-none flex flex-col justify-between" onScroll={handleScroll}>
          {posQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-64 rounded-[1.5rem]" />
              ))}
            </div>
          ) : posQuery.isError ? (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">
              {posQuery.error.message}
            </div>
          ) : productsData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Search className="size-8 mb-2 opacity-50" />
              <p className="font-semibold text-sm">No se encontraron productos</p>
              <p className="text-xs">Prueba con otra búsqueda o categoría.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {productsData.map((product) => {
                const defaultPrice = getDefaultPrice(product)
                const totalStock = getWarehouseStock(product, effectiveWarehouseId)
                const stockTone = getStockToneForWarehouse(product, effectiveWarehouseId)

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    disabled={!defaultPrice || totalStock <= 0}
                    className={cn(
                      'rounded-[1.25rem] border border-border/70 bg-card p-3 text-left shadow-sm shadow-primary/5 transition hover:border-primary/35 hover:bg-primary/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 flex flex-col justify-between h-64 md:h-72 cursor-pointer',
                    )}
                  >
                    <ProductImage
                      src={product.imageUrl}
                      alt={product.name}
                      className="aspect-[4/3] w-full rounded-[1.25rem] object-cover"
                      iconClassName="size-7"
                    />
                    <div className="mt-4 flex items-start justify-between gap-3 w-full">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 font-semibold text-sm md:text-base tracking-tight text-foreground">{product.name}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground mt-0.5">
                          {product.brand} · {product.productType?.name ?? 'Sin tipo'}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] md:text-xs shrink-0 px-2 py-0.5", stockTone.className)}>
                        {stockTone.label}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3 w-full">
                      <div>
                        <p className="text-base md:text-lg font-bold text-foreground">
                          {defaultPrice ? `${formatCurrency(defaultPrice.price)} / ${getPriceUnitLabel(defaultPrice)}` : 'Sin precio'}
                        </p>
                        <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">Stock: {formatNumber(totalStock)}</p>
                        {getPackagingLabel(product) ? <p className="text-[10px] text-primary mt-1">{getPackagingLabel(product)}</p> : null}
                      </div>
                      <div className="rounded-xl bg-primary px-3.5 py-2 text-xs md:text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/10 hover:bg-primary/90 transition-colors">
                        Agregar
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Status indicators and Lazy load button */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/40 pt-4 mt-6 gap-4 shrink-0">
            <p className="text-xs md:text-sm font-medium text-muted-foreground">
              Mostrando <span className="font-semibold text-foreground">{productsData.length}</span> de <span className="font-semibold text-foreground">{totalProducts}</span> productos
            </p>
            {totalProducts > visibleLimit && (
              <Button
                type="button"
                variant="outline"
                className="h-10 px-5 rounded-xl cursor-pointer hover:bg-primary/5 hover:text-primary border-primary/20 text-xs md:text-sm font-semibold transition-all duration-200"
                onClick={() => setVisibleLimit((prev) => Math.min(totalProducts, prev + 24))}
              >
                Cargar más productos
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Right Column (Ticket & History Tabs) */}
      <div className="xl:h-full xl:overflow-hidden min-h-0 flex flex-col">
        <Card className="flex flex-col h-full border-border/70 bg-card/96 shadow-xl shadow-primary/8 overflow-hidden">
          {/* Tabs header */}
          <CardHeader className="pb-3 border-b border-border/40 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <Tabs value={rightTab} onValueChange={setRightTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="ticket" className="flex items-center gap-2 cursor-pointer">
                    <ShoppingCart className="size-4" />
                    <span>Ticket Activo</span>
                    {totals.items > 0 && (
                      <Badge className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground font-semibold rounded-full border-0">
                        {totals.items}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex items-center gap-2 cursor-pointer">
                    <ReceiptText className="size-4" />
                    <span>Historial Ventas</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>

          {/* Tab Content */}
          {rightTab === 'ticket' ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Client and settings (static top) */}
              <div className="p-4 md:p-6 pb-3 grid gap-4 shrink-0 border-b border-border/30">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Cliente</Label>
                  <Select
                    value={selectedClientId ? String(selectedClientId) : 'NO_CLIENT'}
                    onValueChange={(value) => setSelectedClientId(value === 'NO_CLIENT' ? 'NO_CLIENT' : Number(value))}
                  >
                    <SelectTrigger className="h-10 rounded-xl bg-background/50">
                      <SelectValue placeholder="Selecciona un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NO_CLIENT">Sin cliente (Consumidor Final)</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={String(client.id)}>
                          {`${client.firstName} ${client.lastName} · ${client.identification}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Vendedor / Cajero de la caja</Label>
                  <Select
                    value={selectedUserId ? String(selectedUserId) : undefined}
                    onValueChange={(value) => setSelectedUserId(Number(value))}
                  >
                    <SelectTrigger className="h-10 rounded-xl bg-background/50">
                      <SelectValue placeholder="Selecciona el vendedor/cajero" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => {
                        const displayName = u.employee
                          ? `${u.employee.firstName} ${u.employee.lastName}`
                          : u.username
                        return (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {`${displayName} (${formatRole(u.role)})`}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Modo de venta</Label>
                    <Tabs value={saleMode} onValueChange={setSaleMode} className="w-full">
                      <TabsList className="grid grid-cols-2 h-9">
                        <TabsTrigger value="contado" className="text-xs cursor-pointer">Contado</TabsTrigger>
                        <TabsTrigger value="credito" className="text-xs cursor-pointer">Crédito</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {saleMode === 'contado' ? (
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground">Cuenta bancaria</Label>
                      <Select
                        value={activeAccountId ? String(activeAccountId) : undefined}
                        onValueChange={(value) => setSelectedAccountId(Number(value))}
                      >
                        <SelectTrigger className="h-9 rounded-xl bg-background/50">
                          <SelectValue placeholder="Cuenta" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={String(account.id)}>
                              {`${account.name} · ${account.bankName}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground">Vencimiento crédito</Label>
                      <Input
                        type="date"
                        value={creditDueDate}
                        onChange={(event) => setCreditDueDate(event.target.value)}
                        className="h-9 rounded-xl bg-background/50 text-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-1.5 rounded-xl border border-border/50 bg-muted/10 p-3">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Descuento de red opcional</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      max={availableReferralDiscount || undefined}
                      value={referralDiscount}
                      onChange={(event) => setReferralDiscount(event.target.value)}
                      className="h-9 rounded-xl bg-background/50 text-xs"
                      placeholder="0"
                    />
                    <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                      Disponible: {formatCurrency(availableReferralDiscount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cart items list (scrollable middle) */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 space-y-3">
                {cartItems.length ? (
                  cartItems.map((item) => {
                    const activePrices = getActivePrices(item.product)

                    return (
                      <div key={`${item.productId}:${item.productPriceId}:${item.warehouseId ?? 'none'}`} className="rounded-2xl border border-border/50 bg-muted/15 p-4 hover:bg-muted/25 transition-colors">
                        <div className="flex items-start gap-4">
                          <ProductImage src={item.product.imageUrl} alt={item.product.name} className="size-20 rounded-xl shrink-0" iconClassName="size-6" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-1 font-semibold text-sm md:text-base text-foreground">{item.product.name}</p>
                                <p className="line-clamp-1 text-xs text-muted-foreground mt-0.5">{item.product.brand}</p>
                                {getPackagingLabel(item.product) ? <p className="mt-1 text-[10px] text-primary">{getPackagingLabel(item.product)}</p> : null}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl shrink-0 cursor-pointer"
                                onClick={() => updateQuantity(item.productId, item.productPriceId, item.warehouseId, 0)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>

                            <div className="mt-4 grid gap-2.5">
                              <div className="flex items-center gap-2">
                                <Select
                                  value={String(item.price.id)}
                                  onValueChange={(value) => updatePrice(item.productId, item.productPriceId, item.warehouseId, value)}
                                >
                                  <SelectTrigger className="h-10 text-xs md:text-sm rounded-xl flex-1 bg-background/50 cursor-pointer">
                                    <SelectValue placeholder="Precio" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {activePrices.map((price) => (
                                      <SelectItem key={price.id} value={String(price.id)} className="text-xs md:text-sm">
                                        {`${price.name} · ${formatCurrency(price.price)} / ${getPriceUnitLabel(price)}`}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-10 shrink-0 hover:bg-primary/5 hover:text-primary rounded-xl border-border/70 cursor-pointer"
                                  onClick={() => openEditPriceDialog(item.product, item.price)}
                                  title="Editar precio registrado"
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              </div>

                              <div className="grid gap-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
                                <Label className="text-[11px] font-semibold text-primary">Precio acordado para este cliente</Label>
                                {item.customUnitPrice === undefined && Number(item.salePrice) < Number(item.price.price) ? (
                                  <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Oferta de precio especial aplicada</p>
                                ) : null}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.customUnitPrice ?? ''}
                                    placeholder={String(item.price.price)}
                                    onChange={(event) => updateCustomPrice(item.productId, item.productPriceId, item.warehouseId, event.target.value)}
                                    className="h-9 rounded-xl bg-background/80 text-sm font-semibold"
                                  />
                                  <span className="shrink-0 text-[11px] text-muted-foreground">por {getPriceUnitLabel(item.price)}</span>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-primary/10 pt-2 text-[10px]">
                                  <span className="font-medium text-muted-foreground">Total de línea</span>
                                  <span className="font-bold text-foreground">{formatCurrency(item.total)}</span>
                                </div>
                                <p className="text-[10px] leading-relaxed text-muted-foreground">
                                  Deja vacío para usar el precio registrado.
                                </p>
                              </div>

                              <div className="grid gap-1.5">
                                <Label className="text-[11px] text-muted-foreground">Bodega de salida</Label>
                                <Select
                                  value={item.warehouseId ? String(item.warehouseId) : undefined}
                                  onValueChange={(value) => updateWarehouse(item.productId, item.productPriceId, item.warehouseId, value)}
                                  disabled={Boolean(assignedWarehouseId)}
                                >
                                  <SelectTrigger className="h-9 rounded-xl bg-background/50 text-xs"><SelectValue placeholder="Selecciona bodega" /></SelectTrigger>
                                  <SelectContent>
                                    {(assignedWarehouseId ? warehouses.filter((warehouse) => warehouse.id === assignedWarehouseId) : warehouses.filter((warehouse) => item.product.warehouses?.some((stock) => stock.warehouseId === warehouse.id && Number(stock.quantity ?? 0) > 0))).map((warehouse) => (
                                      <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouse.location}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-1">
                                <div className="flex items-center gap-1.5 bg-background border border-border/70 rounded-xl p-1 shadow-sm">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="size-8 p-0 hover:bg-muted rounded-lg shrink-0 cursor-pointer"
                                    onClick={() => updateQuantity(item.productId, item.productPriceId, item.warehouseId, item.quantity - 1)}
                                  >
                                    <Minus className="size-3.5" />
                                  </Button>
                                  <div className="min-w-8 text-center text-xs md:text-sm font-bold text-foreground">
                                    {formatNumber(item.quantity)}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="size-8 p-0 hover:bg-muted rounded-lg shrink-0 cursor-pointer"
                                    onClick={() => updateQuantity(item.productId, item.productPriceId, item.warehouseId, item.quantity + 1)}
                                  >
                                    <Plus className="size-3.5" />
                                  </Button>
                                </div>

                                <div className="text-right">
                                  <p className="text-[10px] text-muted-foreground leading-none mb-1">Subtotal</p>
                                  <p className="font-bold text-xs md:text-sm text-foreground">{formatCurrency(item.total)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center flex flex-col items-center justify-center h-full min-h-[220px]">
                    <ShoppingCart className="size-8 text-muted-foreground/50 mb-3 animate-pulse" />
                    <p className="font-semibold text-sm text-foreground">Carrito vacío</p>
                    <p className="mt-1 text-xs text-muted-foreground max-w-[200px] mx-auto">
                      Toca un producto del catálogo para empezar a vender.
                    </p>
                  </div>
                )}
              </div>

              {/* Totals and checkout button (static bottom) */}
              <div className="shrink-0 p-4 md:p-6 bg-muted/20 border-t border-border/40 grid gap-4">
                <div className="grid gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium text-foreground">{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">IVA</span>
                    <span className="font-medium text-foreground">{formatCurrency(totals.taxes)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Descuento red</span>
                    <span className="font-medium text-foreground">-{formatCurrency(Number(referralDiscount || 0))}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-border/30 pt-2 mt-1">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="font-extrabold text-base text-primary">{formatCurrency(Math.max(0, totals.total - Number(referralDiscount || 0)))}</span>
                  </div>
                </div>

                <Button
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/10 hover:shadow-primary/20 active:scale-[0.98] transition-all duration-200 cursor-pointer shrink-0"
                  onClick={handleCheckout}
                  disabled={!cartItems.length || checkoutMutation.isPending}
                >
                  <ReceiptText className="mr-2 size-4" />
                  {checkoutMutation.isPending ? 'Procesando venta...' : 'Facturar Venta'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* History list (scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 space-y-4">
                {/* Last Sale Box */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold tracking-wider text-primary uppercase">Última Venta</h3>
                  {lastSale ? (
                    <div className="rounded-2xl border border-border/50 bg-primary/5 p-4 text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm text-foreground">
                          {lastSale.client.firstName} {lastSale.client.lastName}
                        </p>
                        <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">
                          {lastSale.consecutive}
                        </Badge>
                      </div>
                        <div className="text-muted-foreground space-y-1">
                          <p>Fecha: {formatDate(lastSale.createdAt)}</p>
                          <p>Origen: {formatInvoiceSource(lastSale.source)}</p>
                          <p>Realizada por: {getInvoiceActorLabel(lastSale)}</p>
                          <p>Modo: {lastSale.saleMode === 'credito' ? 'Venta a crédito registrada' : 'Venta de contado'}</p>
                          <p className="font-semibold text-foreground text-sm pt-1">Total: {formatCurrency(lastSale.total)}</p>
                        </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-9 rounded-xl border-primary/20 hover:bg-primary/5 hover:text-primary transition-all duration-200 cursor-pointer"
                        onClick={() => printReceipt(lastSale)}
                      >
                        Imprimir comprobante
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-5 text-xs text-muted-foreground text-center">
                      Cuando completes una venta, podrás imprimir el comprobante desde aquí.
                    </div>
                  )}
                </div>

                <Separator className="bg-border/40" />

                {/* Recent Invoices list */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold tracking-wider text-primary uppercase">Facturas Recientes</h3>
                  {recentInvoices.length ? (
                    recentInvoices.map((invoice) => (
                      <div key={invoice.id} className="rounded-2xl border border-border/50 bg-muted/15 p-4 text-xs hover:bg-muted/25 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                         <div>
                            <p className="font-semibold text-sm text-foreground">{invoice.consecutive}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {invoice.client.firstName} {invoice.client.lastName}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatInvoiceSource(invoice.source)} · {getInvoiceActorLabel(invoice)}
                            </p>
                          </div>
                          <Badge variant={invoice.status === 'ACTIVA' ? 'default' : 'secondary'} className="text-[10px]">
                            {invoice.status === 'ACTIVA' ? 'Activa' : 'Anulada'}
                          </Badge>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{formatDate(invoice.createdAt)}</span>
                          <span className="font-semibold text-foreground">{formatCurrency(invoice.total)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground text-center">No hay facturas recientes cargadas.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={editingPrice !== null} onOpenChange={(open) => !open && setEditingPrice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Administrar precios del producto</DialogTitle>
            <DialogDescription>
              Configura los precios para <strong>{editingPrice?.product?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={priceDialogMode}
            onValueChange={(val) => {
              setPriceDialogMode(val)
              if (val === 'create') {
                setNewPriceName('')
                setNewPriceValue('')
                setNewPriceUnit('UND')
              } else {
                setNewPriceName(editingPrice?.name ?? '')
                setNewPriceValue(String(editingPrice?.price ?? ''))
                setNewPriceUnit(editingPrice?.unit ?? 'UND')
              }
            }}
            className="w-full mt-2"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4 h-9">
              <TabsTrigger value="edit" className="text-xs cursor-pointer">Modificar actual</TabsTrigger>
              <TabsTrigger value="create" className="text-xs cursor-pointer">Crear nuevo precio</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="price-name" className="text-xs font-semibold text-muted-foreground">
                Nombre del precio
              </Label>
              <Input
                id="price-name"
                value={priceDialogMode === 'edit' ? (editingPrice?.name ?? '') : newPriceName}
                onChange={(e) => priceDialogMode === 'create' && setNewPriceName(e.target.value)}
                disabled={priceDialogMode === 'edit'}
                placeholder="Ej. Distribuidor, Oferta Fin de Semana"
                className={cn("h-10 rounded-xl", priceDialogMode === 'edit' && "bg-muted text-muted-foreground")}
                                />
                              </div>

                              <div className="grid gap-1.5">
              <Label htmlFor="price-value" className="text-xs font-semibold text-muted-foreground">
                Valor del precio ($)
              </Label>
              <Input
                id="price-value"
                type="number"
                value={newPriceValue}
                onChange={(e) => setNewPriceValue(e.target.value)}
                placeholder="Ej. 15000"
                className="h-10 rounded-xl"
              />
            </div>

            {priceDialogMode === 'edit' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="price-reason" className="text-xs font-semibold text-muted-foreground">
                  Motivo del cambio
                </Label>
                <Input
                  id="price-reason"
                  value={priceChangeReason}
                  onChange={(e) => setPriceChangeReason(e.target.value)}
                  placeholder="Ej. Ajuste de lista, alza de proveedor..."
                  className="h-10 rounded-xl"
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="price-unit" className="text-xs font-semibold text-muted-foreground">
                  Unidad
                </Label>
                <Select value={newPriceUnit} onValueChange={setNewPriceUnit}>
                  <SelectTrigger id="price-unit" className="h-10 rounded-xl bg-background/50">
                    <SelectValue placeholder="Selecciona la unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UND">Unidad (UND)</SelectItem>
                    <SelectItem value="KG">Kilogramo (KG)</SelectItem>
                    <SelectItem value="LT">Litro (LT)</SelectItem>
                    <SelectItem value="GR">Gramo (GR)</SelectItem>
                    <SelectItem value="ML">Mililitro (ML)</SelectItem>
                    <SelectItem value="MTS">Metro (MTS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditingPrice(null)} className="rounded-xl h-10">
              Cancelar
            </Button>
            <Button
              onClick={() => updatePriceMutation.mutate()}
              disabled={
                updatePriceMutation.isPending ||
                !newPriceValue ||
                Number(newPriceValue) <= 0 ||
                (priceDialogMode === 'create' && !newPriceName.trim())
              }
              className="rounded-xl h-10 bg-primary text-primary-foreground font-semibold cursor-pointer"
            >
              {updatePriceMutation.isPending ? 'Guardando...' : 'Guardar precio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
