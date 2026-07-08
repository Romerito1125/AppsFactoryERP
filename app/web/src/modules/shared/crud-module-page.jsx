import { useDeferredValue, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  getRecordStatus,
  getRecordStatusVariant,
  matchesSearch,
  statusOptions,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { ModuleDetailsDrawer } from '@/modules/shared/module-details-drawer'
import { ModuleFormDialog } from '@/modules/shared/module-form-dialog'
import { LocalPagination } from '@/modules/shared/local-pagination'

const EMPTY_RECORDS = []

function ModuleSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-2xl" />
    </div>
  )
}

export function CrudModulePage({ config, lookups = {}, lookupsLoading = false }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('activos')
  const [filters, setFilters] = useState(() => config.getInitialFilters?.() ?? {})
  const [currentPage, setCurrentPage] = useState(1)
  const [formState, setFormState] = useState({ open: false, mode: 'create', record: null })
  const [detailRecord, setDetailRecord] = useState(null)
  const [actionState, setActionState] = useState(null)
  const deferredSearch = useDeferredValue(search)
  const ITEMS_PER_PAGE = config.itemsPerPage ?? 20

  const queryKey = [config.key, status, deferredSearch, currentPage, ITEMS_PER_PAGE, filters]

  const recordsQuery = useQuery({
    queryKey,
    queryFn: () =>
        config.fetchRecords({
          status,
          search: deferredSearch,
          page: currentPage,
          limit: ITEMS_PER_PAGE,
          filters,
        }),
    placeholderData: (previousData) => previousData,
  })

  function updateFilters(nextFilters) {
    setFilters((current) => {
      const resolved = typeof nextFilters === 'function' ? nextFilters(current) : nextFilters
      return resolved
    })
    setCurrentPage(1)
  }

  const createMutation = useMutation({
    mutationFn: config.createRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.key] })
      setFormState({ open: false, mode: 'create', record: null })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => config.updateRecord(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.key] })
      setFormState({ open: false, mode: 'create', record: null })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (record) => config.archiveRecord(record.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.key] })
      setActionState(null)
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (record) => config.reactivateRecord(record.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.key] })
      setActionState(null)
    },
  })

  const payload = recordsQuery.data
  const isPaginatedResponse = !Array.isArray(payload) && Array.isArray(payload?.data)
  const records = isPaginatedResponse ? payload.data : payload ?? EMPTY_RECORDS

  const visibleRecords = useMemo(() => {
    const locallyFiltered =
      config.statusFilter === 'local'
        ? records.filter((record) => {
            if (status === 'todos') {
              return true
            }

            return status === 'activos' ? record.isActive : !record.isActive
          })
        : records

    if (isPaginatedResponse) {
      return locallyFiltered
    }

    return locallyFiltered.filter((record) => matchesSearch(record, deferredSearch, config.searchResolver))
  }, [config.searchResolver, config.statusFilter, deferredSearch, isPaginatedResponse, records, status])

  const totalItems = isPaginatedResponse ? Number(payload.total ?? 0) : visibleRecords.length
  const totalPages = isPaginatedResponse
    ? Math.max(1, Number(payload.totalPages ?? 1))
    : Math.max(1, Math.ceil(visibleRecords.length / ITEMS_PER_PAGE))

  const paginatedRecords = useMemo(() => {
    if (isPaginatedResponse) {
      return visibleRecords
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return visibleRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [ITEMS_PER_PAGE, currentPage, isPaginatedResponse, visibleRecords])

  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1
  const endIndex = isPaginatedResponse
    ? Math.min(startIndex + paginatedRecords.length - 1, totalItems)
    : Math.min(currentPage * ITEMS_PER_PAGE, totalItems)

  const summaryCards = config.getSummaryCards({
    records: paginatedRecords,
    rawRecords: records,
    totalRecords: totalItems,
    currentPage,
  })

  function openCreateDialog() {
    setFormState({ open: true, mode: 'create', record: null })
  }

  function invalidateRecords() {
    queryClient.invalidateQueries({ queryKey: [config.key] })
  }

  async function handleSave(payload) {
    if (formState.mode === 'create') {
      await toast.promise(createMutation.mutateAsync(payload), {
        loading: `Creando ${config.singularLabel.toLowerCase()}...`,
        success: `${config.singularLabel} creado correctamente`,
        error: (error) => error.message,
      })
      return
    }

    await toast.promise(
      updateMutation.mutateAsync({ id: formState.record.id, payload }),
      {
        loading: `Actualizando ${config.singularLabel.toLowerCase()}...`,
        success: `${config.singularLabel} actualizado correctamente`,
        error: (error) => error.message,
      },
    )
  }

  async function handleConfirmAction() {
    if (!actionState) {
      return
    }

    if (actionState.type === 'archive') {
      await toast.promise(archiveMutation.mutateAsync(actionState.record), {
        loading: config.archiveLoadingLabel,
        success: config.archiveSuccessLabel,
        error: (error) => error.message,
      })
      return
    }

    await toast.promise(reactivateMutation.mutateAsync(actionState.record), {
      loading: config.reactivateLoadingLabel,
      success: config.reactivateSuccessLabel,
      error: (error) => error.message,
    })
  }

  if (recordsQuery.isLoading || lookupsLoading) {
    return <ModuleSkeleton />
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/12 text-primary hover:bg-primary/12">
            {config.badgeLabel}
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {config.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            {config.description}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {config.renderHeaderActions?.({
            lookups,
            status,
            filters,
            openCreateDialog,
            invalidateRecords,
          })}
          <Button className="rounded-full px-5" onClick={openCreateDialog}>
            <Plus className="mr-2 size-4" />
            {config.createButtonLabel}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.24 }}
          >
            <Card className="border-border/70 bg-card/92 shadow-sm shadow-primary/5">
              <CardHeader>
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className="text-2xl font-semibold">{card.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{card.help}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="border-border/70 bg-card/94 shadow-sm shadow-primary/5">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>{config.tableTitle}</CardTitle>
            <CardDescription>{config.tableDescription}</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 md:flex-row lg:w-auto">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder={config.searchPlaceholder}
                className="pl-9"
              />
            </div>
            {config.renderTableFilters?.({
              filters,
              updateFilters,
              lookups,
              records,
            })}
            {config.statusFilter ? (
              <Select
                value={status}
                onValueChange={(val) => {
                  setStatus(val)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-full md:w-[170px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {recordsQuery.isError ? (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              {recordsQuery.error.message}
            </div>
          ) : null}

          {!recordsQuery.isError ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {config.columns.map((column) => (
                      <TableHead key={column.key}>{column.label}</TableHead>
                    ))}
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRecords.length ? (
                    paginatedRecords.map((record) => (
                      <TableRow key={record.id}>
                        {config.columns.map((column) => (
                          <TableCell
                            key={column.key}
                            className={cn(column.className, 'align-top')}
                          >
                            {column.render(record)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" className="rounded-full">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">Abrir acciones</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setDetailRecord(record)}>
                                <Eye className="mr-2 size-4" />
                                Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setFormState({ open: true, mode: 'edit', record })
                                }
                              >
                                <Pencil className="mr-2 size-4" />
                                Editar
                              </DropdownMenuItem>
                              {record.isActive === false ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setActionState({ type: 'reactivate', record })
                                  }
                                >
                                  <RotateCcw className="mr-2 size-4" />
                                  Reactivar
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => setActionState({ type: 'archive', record })}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 size-4" />
                                  Desactivar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={config.columns.length + 1} className="py-12 text-center">
                        <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6">
                          <Power className="mx-auto mb-3 size-8 text-primary" />
                          <p className="font-medium text-foreground">{config.emptyTitle}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{config.emptyDescription}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

               <LocalPagination
                 currentPage={currentPage}
                 totalPages={totalPages}
                 totalItems={totalItems}
                 startItem={startIndex}
                 endItem={endIndex}
                 singularLabel={config.singularLabel.toLowerCase()}
                 pluralLabel={config.title.toLowerCase()}
                 onPageChange={setCurrentPage}
               />
             </>
           ) : null}
        </CardContent>
      </Card>

      <ModuleFormDialog
        open={formState.open}
        onOpenChange={(open) => setFormState((current) => ({ ...current, open }))}
        mode={formState.mode}
        config={config}
        record={formState.record}
        lookups={lookups}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleSave}
      />

      <ModuleDetailsDrawer
        open={Boolean(detailRecord)}
        onOpenChange={(open) => !open && setDetailRecord(null)}
        title={detailRecord ? config.getDetailTitle(detailRecord) : ''}
        description={detailRecord ? config.getDetailDescription(detailRecord) : ''}
        badge={
          detailRecord
            ? {
                label: getRecordStatus(detailRecord),
                variant: getRecordStatusVariant(detailRecord),
              }
            : null
        }
        fields={detailRecord ? config.getDetailSections(detailRecord) : []}
      />

      <AlertDialog open={Boolean(actionState)} onOpenChange={(open) => !open && setActionState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionState?.type === 'reactivate'
                ? `Reactivar ${config.singularLabel.toLowerCase()}`
                : `Desactivar ${config.singularLabel.toLowerCase()}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionState?.type === 'reactivate'
                ? config.reactivateConfirmationLabel
                : config.archiveConfirmationLabel}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
