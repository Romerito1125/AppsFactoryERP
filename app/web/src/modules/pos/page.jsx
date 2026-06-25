import { useDeferredValue, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  LogOut,
  Minus,
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
import { apiClient } from '@/lib/api-client'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
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

function getTotalStock(product) {
  return (product?.warehouses ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
}

function getStockTone(product) {
  const stock = getTotalStock(product)
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
    label: 'OK',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  }
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
  const [category, setCategory] = useState('TODOS')
  const [saleMode, setSaleMode] = useState('contado')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const due = new Date()
    due.setDate(due.getDate() + 15)
    return due.toISOString().slice(0, 10)
  })
  const [cart, setCart] = useState([])
  const [lastSale, setLastSale] = useState(null)
  const [rightTab, setRightTab] = useState('ticket')

  const posQuery = useQuery({
    queryKey: ['pos-data'],
    queryFn: async () => {
      const [products, clients, accounts, invoices] = await Promise.all([
        apiClient.get('/productos'),
        apiClient.get('/clientes'),
        apiClient.get('/cuentas-bancarias'),
        apiClient.get('/facturas'),
      ])

      return { products, clients, accounts, invoices }
    },
  })

  const products = useMemo(() => posQuery.data?.products ?? [], [posQuery.data?.products])
  const clients = useMemo(() => posQuery.data?.clients ?? [], [posQuery.data?.clients])
  const accounts = useMemo(() => (posQuery.data?.accounts ?? []).filter((account) => account.isActive !== false), [posQuery.data?.accounts])
  const recentInvoices = useMemo(() => (posQuery.data?.invoices ?? []).slice(0, 6), [posQuery.data?.invoices])

  const activeClientId = selectedClientId ?? clients[0]?.id ?? null
  const activeAccountId = selectedAccountId ?? accounts.find((account) => account.isActive !== false)?.id ?? null

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!activeClientId) {
        throw new Error('Selecciona un cliente para continuar')
      }

      if (!cart.length) {
        throw new Error('Agrega al menos un producto al ticket')
      }

      if (saleMode === 'contado' && !activeAccountId) {
        throw new Error('Selecciona una cuenta bancaria para registrar el recaudo')
      }

      if (saleMode === 'credito' && !creditDueDate) {
        throw new Error('Selecciona una fecha de vencimiento para el credito')
      }

      const invoicePayload = {
        clientId: activeClientId,
        source: 'POS',
        items: cart.map((item) => ({
          productId: item.productId,
          productPriceId: item.productPriceId,
          quantity: item.quantity,
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
      setRightTab('history')
    },
  })

  const categories = useMemo(
    () => ['TODOS', ...new Set(products.map((product) => product.productType?.name).filter(Boolean))],
    [products],
  )

  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesCategory = category === 'TODOS' ? true : product.productType?.name === category
        const haystack = [product.name, product.brand, product.description, product.productType?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return matchesCategory && haystack.includes(deferredSearch.toLowerCase())
      }),
    [category, deferredSearch, products],
  )

  const cartItems = useMemo(
    () =>
      cart
        .map((item) => {
          const product = products.find((entry) => entry.id === item.productId)
          const price = getActivePrices(product).find((entry) => entry.id === item.productPriceId) ?? getDefaultPrice(product)

          if (!product || !price) {
            return null
          }

          const subtotal = Number(price.price) * item.quantity
          const taxes = subtotal * (Number(product.taxRate ?? 0) / 100)
          const total = subtotal + taxes

          return {
            ...item,
            product,
            price,
            subtotal,
            taxes,
            total,
          }
        })
        .filter(Boolean),
    [cart, products],
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


  function addProduct(product) {
    const defaultPrice = getDefaultPrice(product)
    if (!defaultPrice) {
      return
    }

    setRightTab('ticket')
    setCart((current) => {
      const existing = current.find(
        (item) => item.productId === product.id && item.productPriceId === defaultPrice.id,
      )

      if (existing) {
        return current.map((item) =>
          item === existing ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }

      return [...current, { productId: product.id, productPriceId: defaultPrice.id, quantity: 1 }]
    })
  }

  function updateQuantity(productId, productPriceId, nextQuantity) {
    if (nextQuantity <= 0) {
      setCart((current) =>
        current.filter(
          (item) => !(item.productId === productId && item.productPriceId === productPriceId),
        ),
      )
      return
    }

    setCart((current) =>
      current.map((item) =>
        item.productId === productId && item.productPriceId === productPriceId
          ? { ...item, quantity: nextQuantity }
          : item,
      ),
    )
  }

  function updatePrice(productId, currentPriceId, nextPriceId) {
    setCart((current) =>
      current.map((item) =>
        item.productId === productId && item.productPriceId === currentPriceId
          ? { ...item, productPriceId: Number(nextPriceId) }
          : item,
      ),
    )
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

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por producto, marca o categoria..."
                  className="h-11 rounded-xl pl-9"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1 max-w-full shrink-0">
                {categories.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={category === item ? 'default' : 'outline'}
                    onClick={() => setCategory(item)}
                    className="rounded-full shrink-0 h-9"
                  >
                    {item === 'TODOS' ? 'Todos' : item}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scrollable Catalog Grid */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 pb-4 select-none">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {visibleProducts.map((product) => {
              const defaultPrice = getDefaultPrice(product)
              const stockTone = getStockTone(product)
              const totalStock = getTotalStock(product)

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  disabled={!defaultPrice || totalStock <= 0}
                  className={cn(
                    'rounded-[1.5rem] border border-border/70 bg-card p-4 text-left shadow-sm shadow-primary/5 transition hover:border-primary/35 hover:bg-primary/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55',
                  )}
                >
                  <ProductImage
                    src={product.imageUrl}
                    alt={product.name}
                    className="aspect-[4/3] w-full rounded-[1.25rem]"
                    iconClassName="size-7"
                  />
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="line-clamp-1 font-medium text-foreground">{product.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {product.brand} · {product.productType?.name ?? 'Sin tipo'}
                      </p>
                    </div>
                    <Badge variant="outline" className={stockTone.className}>
                      {stockTone.label}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {defaultPrice ? formatCurrency(defaultPrice.price) : 'Sin precio'}
                      </p>
                      <p className="text-xs text-muted-foreground">Stock {formatNumber(totalStock)}</p>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      Agregar
                    </div>
                  </div>
                </button>
              )
            })}
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
                    value={activeClientId ? String(activeClientId) : undefined}
                    onValueChange={(value) => setSelectedClientId(Number(value))}
                  >
                    <SelectTrigger className="h-10 rounded-xl bg-background/50">
                      <SelectValue placeholder="Selecciona un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={String(client.id)}>
                          {`${client.firstName} ${client.lastName} · ${client.identification}`}
                        </SelectItem>
                      ))}
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
              </div>

              {/* Cart items list (scrollable middle) */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 space-y-3">
                {cartItems.length ? (
                  cartItems.map((item) => {
                    const activePrices = getActivePrices(item.product)

                    return (
                      <div key={`${item.productId}:${item.productPriceId}`} className="rounded-2xl border border-border/50 bg-muted/15 p-3 hover:bg-muted/25 transition-colors">
                        <div className="flex items-start gap-3">
                          <ProductImage src={item.product.imageUrl} alt={item.product.name} className="size-16 rounded-xl shrink-0" iconClassName="size-4" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-1 font-semibold text-sm text-foreground">{item.product.name}</p>
                                <p className="line-clamp-1 text-[11px] text-muted-foreground">{item.product.brand}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0"
                                onClick={() => updateQuantity(item.productId, item.productPriceId, 0)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>

                            <div className="mt-3 grid gap-2">
                              <Select
                                value={String(item.price.id)}
                                onValueChange={(value) => updatePrice(item.productId, item.productPriceId, value)}
                              >
                                <SelectTrigger className="h-8 text-xs rounded-lg">
                                  <SelectValue placeholder="Precio" />
                                </SelectTrigger>
                                <SelectContent>
                                  {activePrices.map((price) => (
                                    <SelectItem key={price.id} value={String(price.id)} className="text-xs">
                                      {`${price.name} · ${formatCurrency(price.price)}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 bg-background border border-border/70 rounded-lg p-0.5 shadow-sm">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="size-7 p-0 hover:bg-muted rounded-md shrink-0"
                                    onClick={() => updateQuantity(item.productId, item.productPriceId, item.quantity - 1)}
                                  >
                                    <Minus className="size-3" />
                                  </Button>
                                  <div className="min-w-8 text-center text-xs font-semibold text-foreground">
                                    {formatNumber(item.quantity)}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="size-7 p-0 hover:bg-muted rounded-md shrink-0"
                                    onClick={() => updateQuantity(item.productId, item.productPriceId, item.quantity + 1)}
                                  >
                                    <Plus className="size-3" />
                                  </Button>
                                </div>

                                <div className="text-right">
                                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Total</p>
                                  <p className="font-semibold text-xs text-foreground">{formatCurrency(item.total)}</p>
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
                  <div className="flex items-center justify-between text-sm border-t border-border/30 pt-2 mt-1">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="font-extrabold text-base text-primary">{formatCurrency(totals.total)}</span>
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
    </div>
  )
}
