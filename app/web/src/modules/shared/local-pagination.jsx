import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const DEFAULT_ITEMS_PER_PAGE = 10

export function useLocalPagination(items, itemsPerPage = DEFAULT_ITEMS_PER_PAGE) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return items.slice(startIndex, startIndex + itemsPerPage)
  }, [currentPage, items, itemsPerPage])

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return {
    currentPage,
    setCurrentPage,
    paginatedItems,
    totalItems,
    totalPages,
    startItem,
    endItem,
    resetPage: () => setCurrentPage(1),
  }
}

export function LocalPagination({
  currentPage,
  totalPages,
  totalItems,
  startItem,
  endItem,
  singularLabel,
  pluralLabel,
  onPageChange,
}) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t border-border/60 px-2 py-4 sm:flex-row">
      <div className="text-xs text-muted-foreground">
        Mostrando <span className="font-semibold text-foreground">{startItem}</span> a{' '}
        <span className="font-semibold text-foreground">{endItem}</span> de{' '}
        <span className="font-semibold text-foreground">{totalItems}</span>{' '}
        {totalItems === 1 ? singularLabel : pluralLabel}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage === 1}
          className="h-8 rounded-lg px-3 text-xs"
        >
          Anterior
        </Button>

        {Array.from({ length: totalPages }).map((_, index) => {
          const pageNumber = index + 1

          if (
            totalPages > 5 &&
            pageNumber !== 1 &&
            pageNumber !== totalPages &&
            Math.abs(pageNumber - currentPage) > 1
          ) {
            if (pageNumber === 2 && currentPage > 3) {
              return (
                <span key="left-ellipsis" className="px-1.5 text-xs text-muted-foreground">
                  ...
                </span>
              )
            }

            if (pageNumber === totalPages - 1 && currentPage < totalPages - 2) {
              return (
                <span key="right-ellipsis" className="px-1.5 text-xs text-muted-foreground">
                  ...
                </span>
              )
            }

            return null
          }

          return (
            <Button
              key={pageNumber}
              variant={currentPage === pageNumber ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPageChange(pageNumber)}
              className={cn(
                'size-8 rounded-lg p-0 text-xs font-medium transition-all duration-250',
                currentPage === pageNumber &&
                  'bg-primary text-primary-foreground shadow-xs shadow-primary/20',
              )}
            >
              {pageNumber}
            </Button>
          )
        })}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="h-8 rounded-lg px-3 text-xs"
        >
          Siguiente
        </Button>
      </div>
    </div>
  )
}
