import { useDeferredValue, useMemo, useState } from 'react'
import { matchSorter } from 'match-sorter'
import { Search } from 'lucide-react'

import { ProductImage } from '@/components/product-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

function getPrimaryBarcode(product) {
  return product?.barcodes?.find((barcode) => barcode.isPrimary) ?? product?.barcodes?.[0] ?? null
}

function getTotalStock(product) {
  return (product?.warehouses ?? []).reduce((total, item) => total + Number(item.quantity ?? 0), 0)
}

export function ProductVisualPicker({
  products,
  selectedProductId,
  onSelectProduct,
  onAction,
  actionLabel = 'Seleccionar',
  title = 'Catalogo visual',
  description = 'Busca por nombre, marca, categoria o codigo y elige por foto.',
  searchPlaceholder = 'Buscar producto...',
  emptyTitle = 'No hay productos para este filtro',
  emptyDescription = 'Ajusta la busqueda para ver otras coincidencias.',
  maxHeightClassName = 'h-[360px]',
  searchValue,
  onSearchValueChange,
  disableLocalSearch = false,
  totalCount,
  footerContent,
}) {
  const [search, setSearch] = useState('')
  const resolvedSearch = searchValue ?? search
  const deferredSearch = useDeferredValue(resolvedSearch)

  const filteredProducts = useMemo(() => {
    if (disableLocalSearch) {
      return products
    }

    if (!deferredSearch.trim()) {
      return products
    }

    return matchSorter(products, deferredSearch, {
      keys: [
        'name',
        'brand',
        'description',
        (product) => product.productType?.name,
        (product) => product.barcodes?.map((barcode) => barcode.code).join(' '),
      ],
    })
  }, [deferredSearch, disableLocalSearch, products])

  return (
    <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/15 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={resolvedSearch}
            onChange={(event) => {
              if (onSearchValueChange) {
                onSearchValueChange(event.target.value)
                return
              }

              setSearch(event.target.value)
            }}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
        <span>Selecciona por foto o usa la busqueda difusa.</span>
        <span>{formatNumber(totalCount ?? filteredProducts.length)} productos</span>
      </div>

      <ScrollArea className={cn(maxHeightClassName, 'pr-4')}>
        {filteredProducts.length ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const primaryBarcode = getPrimaryBarcode(product)
              const isSelected = product.id === selectedProductId

              return (
                <div
                  key={product.id}
                  className={cn(
                    'grid min-w-0 gap-3 rounded-2xl border border-border/70 bg-card p-4 transition hover:border-primary/35 hover:shadow-sm hover:shadow-primary/10',
                    isSelected && 'border-primary/50 ring-2 ring-primary/15',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectProduct?.(product.id)}
                    className="grid gap-3 text-left"
                  >
                    <ProductImage
                      src={product.imageUrl}
                      alt={product.name}
                      className="aspect-[4/3] w-full rounded-xl"
                      iconClassName="size-6"
                    />
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-medium text-foreground">{product.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {product.brand} · {product.productType?.name ?? 'Sin tipo'}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">Stock {formatNumber(getTotalStock(product))}</Badge>
                      {primaryBarcode ? (
                        <Badge variant="outline" className="max-w-full truncate">
                          {primaryBarcode.code}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Sin codigo</Badge>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {product.barcodes?.length ? `${formatNumber(product.barcodes.length)} codigos` : 'Sin codigos registrados'}
                    </p>
                    {onAction ? (
                      <Button type="button" size="sm" onClick={() => onAction(product)}>
                        {actionLabel}
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant={isSelected ? 'default' : 'outline'} onClick={() => onSelectProduct?.(product.id)}>
                        {isSelected ? 'Seleccionado' : actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 p-6 text-center">
            <p className="font-medium text-foreground">{emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
          </div>
        )}
      </ScrollArea>

      {footerContent}
    </div>
  )
}
