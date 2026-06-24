import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CalendarDays, ChevronDown, LogOut, Search, Store, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/auth-context'
import { getNavigationItem, navigationGroups } from '@/app/navigation'
import { BrandMark } from '@/components/brand/brand-mark'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

function AppSidebar() {
  const { state, toggleSidebar } = useSidebar()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)

  // Initialize expandedGroup state from localStorage or active route
  const [expandedGroup, setExpandedGroup] = useState(() => {
    const saved = localStorage.getItem('sidebar_expanded_group')
    if (saved) {
      return saved === 'none' ? null : saved
    }

    // Fallback: find the group containing the active path
    const activeGroup = navigationGroups.find((group) =>
      group.items.some((item) => location.pathname.startsWith(item.path))
    )
    return activeGroup ? activeGroup.label : (navigationGroups[0]?.label || null)
  })

  // Persist expandedGroup state
  useEffect(() => {
    localStorage.setItem('sidebar_expanded_group', expandedGroup || 'none')
  }, [expandedGroup])

  // Automatically focus search input when sidebar expands if a search query exists
  useEffect(() => {
    if (state === 'expanded' && searchQuery !== '') {
      searchInputRef.current?.focus()
    }
  }, [state, searchQuery])

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return navigationGroups

    const normalizedQuery = searchQuery.toLowerCase().trim()
    return navigationGroups
      .map((group) => {
        const matchedItems = group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(normalizedQuery) ||
            item.description.toLowerCase().includes(normalizedQuery)
        )
        return {
          ...group,
          items: matchedItems,
        }
      })
      .filter((group) => group.items.length > 0)
  }, [searchQuery])

  const toggleGroup = (label) => {
    setExpandedGroup((prev) => (prev === label ? null : label))
  }

  const isSidebarCollapsed = state === 'collapsed'
  const hasResults = filteredGroups.length > 0

  return (
    <Sidebar collapsible="icon" variant="inset" className="px-2 py-3 transition-all duration-300 group-data-[state=collapsed]:px-1 group-data-[state=collapsed]:py-2">
      <SidebarHeader className="px-1 pb-3 transition-all duration-300 group-data-[state=collapsed]:px-0 group-data-[state=collapsed]:pb-0">
        <div className="rounded-[1.25rem] border border-sidebar-border/60 bg-linear-to-br from-sidebar-accent/85 to-sidebar/70 p-3 shadow-lg shadow-black/8 ring-1 ring-white/5 transition-all duration-300 group-data-[state=collapsed]:border-0 group-data-[state=collapsed]:bg-transparent group-data-[state=collapsed]:p-0 group-data-[state=collapsed]:shadow-none group-data-[state=collapsed]:ring-0">
          <BrandMark compact className="items-center gap-3 group-data-[state=collapsed]:justify-center" />
          <div className="mt-3 rounded-xl border border-white/8 bg-white/6 px-3 py-2 text-left backdrop-blur transition-all duration-300 group-data-[state=collapsed]:hidden">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-sidebar-foreground/60 uppercase">
              Admin MMM
            </p>
            <p className="mt-1 text-xs font-medium text-sidebar-foreground/85">
              Comercial, operacion y finanzas
            </p>
          </div>
        </div>
      </SidebarHeader>

      {/* Search Input Section */}
      <div className="px-1 py-1">
        {isSidebarCollapsed ? (
          <button
            onClick={() => {
              toggleSidebar()
              setTimeout(() => {
                searchInputRef.current?.focus()
              }, 120)
            }}
            className="mx-auto flex size-10 items-center justify-center rounded-xl bg-white/5 text-sidebar-foreground/60 hover:bg-white/10 hover:text-sidebar-foreground transition-all duration-200 cursor-pointer"
            title="Buscar módulo"
          >
            <Search className="size-4.5" />
          </button>
        ) : (
          <div className="relative flex items-center rounded-xl border border-sidebar-border/40 bg-white/4 px-2.5 py-1.5 shadow-inner transition-all hover:bg-white/6 focus-within:border-sidebar-primary/50 focus-within:ring-2 focus-within:ring-sidebar-primary/20">
            <Search className="size-4 shrink-0 text-sidebar-foreground/45 mr-2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar módulo..."
              className="w-full bg-transparent text-xs text-sidebar-foreground placeholder-sidebar-foreground/40 outline-hidden border-none p-0 focus:ring-0"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="rounded-full p-0.5 text-sidebar-foreground/40 hover:bg-white/10 hover:text-sidebar-foreground transition-all cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <SidebarContent className="px-1 mt-2">
        {hasResults ? (
          filteredGroups.map((group) => {
            const isExpanded =
              isSidebarCollapsed ||
              expandedGroup === group.label ||
              searchQuery.trim() !== ''

            const content = (
              <SidebarGroupContent>
                <SidebarMenu className="gap-1 group-data-[state=collapsed]:gap-2 mt-1">
                  {group.items.map((item) => {
                    const Icon = item.icon

                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton asChild tooltip={item.label}>
                          <NavLink
                            to={item.path}
                            className={({ isActive }) =>
                              cn(
                                'group/link flex min-h-[2.85rem] items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-200 relative overflow-hidden',
                                isActive
                                  ? 'bg-linear-to-r from-sidebar-primary to-sidebar-primary/95 text-sidebar-primary-foreground shadow-md shadow-primary/25'
                                  : 'text-sidebar-foreground/90 hover:bg-white/6 hover:text-sidebar-foreground',
                                'group-data-[state=collapsed]:size-10! group-data-[state=collapsed]:min-h-0! group-data-[state=collapsed]:p-0! group-data-[state=collapsed]:justify-center group-data-[state=collapsed]:rounded-xl'
                              )
                            }
                          >
                            {({ isActive }) => (
                              <>
                                <div className={cn(
                                  "flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 group-data-[state=collapsed]:size-8",
                                  isActive 
                                    ? "bg-white/12" 
                                    : "bg-white/8 group-hover/link:bg-white/12 group-hover/link:scale-105 group-data-[state=collapsed]:bg-transparent"
                                )}>
                                  <Icon className={cn(
                                    "size-4 transition-transform duration-200 group-data-[state=collapsed]:size-5",
                                    !isActive && "group-hover/link:scale-110"
                                  )} />
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 transition-all duration-200 group-data-[state=collapsed]:hidden">
                                  <span className="text-sm font-medium leading-none">{item.label}</span>
                                  <span className={cn(
                                    "truncate text-[10px] leading-none",
                                    isActive ? "text-sidebar-primary-foreground/75" : "text-sidebar-foreground/68"
                                  )}>
                                    {item.description}
                                  </span>
                                </div>
                              </>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            )

            return (
              <SidebarGroup
                key={group.label}
                className="gap-1 py-1.5 transition-all duration-300 group-data-[state=collapsed]:px-1 group-data-[state=collapsed]:py-1"
              >
                {!isSidebarCollapsed ? (
                  <>
                    <SidebarGroupLabel asChild className="transition-all duration-300 h-9 text-sidebar-foreground/68 hover:text-sidebar-foreground hover:bg-white/5 px-3 rounded-lg">
                      <button
                        onClick={() => toggleGroup(group.label)}
                        className="flex w-full items-center justify-between text-left text-xs font-bold tracking-[0.14em] uppercase transition-all cursor-pointer"
                      >
                        <span>{group.label}</span>
                        <ChevronDown
                          className={cn(
                            'size-4 transition-transform duration-300 text-sidebar-foreground/50',
                            isExpanded ? 'rotate-0' : '-rotate-95'
                          )}
                        />
                      </button>
                    </SidebarGroupLabel>
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          {content}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                  <>
                    <SidebarGroupLabel className="px-3 text-xs font-semibold tracking-[0.14em] text-sidebar-foreground/50 uppercase transition-all duration-300 group-data-[state=collapsed]:opacity-0">
                      {group.label}
                    </SidebarGroupLabel>
                    {content}
                  </>
                )}
              </SidebarGroup>
            )
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="flex size-9 items-center justify-center rounded-full bg-white/5 mb-2.5 text-sidebar-foreground/40">
              <Search className="size-4.5" />
            </div>
            <p className="text-xs font-semibold text-sidebar-foreground/80">
              Sin resultados
            </p>
            <p className="mt-1 text-[10px] text-sidebar-foreground/50 leading-relaxed max-w-[130px]">
              No encontramos "{searchQuery}"
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-3 rounded-lg bg-sidebar-primary/20 px-2.5 py-1 text-[11px] font-medium text-sidebar-primary hover:bg-sidebar-primary/30 transition-all cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        )}
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="px-1 pt-3 transition-all duration-300 group-data-[state=collapsed]:p-0">
        <div className="rounded-[1rem] border border-sidebar-border/60 bg-white/6 p-3 text-sm backdrop-blur transition-all duration-300 group-data-[state=collapsed]:hidden">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-sidebar-foreground/60 uppercase">
            Empresa
          </p>
          <p className="mt-1.5 text-sm font-medium text-sidebar-foreground">Mundo Tienda MMM</p>
          <p className="mt-1 text-[11px] leading-relaxed text-sidebar-foreground/72">
            Navegacion agrupada para moverse rapido entre modulos.
          </p>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

export function AdminLayout() {
  const location = useLocation()
  const currentItem = getNavigationItem(location.pathname)
  const { user, logout } = useAuth()
  const initials = user?.displayName
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() ?? 'MM'

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': '16rem',
        '--sidebar-width-icon': '4rem',
      }}
    >
      <AppSidebar />
      <SidebarInset className="overflow-hidden bg-[radial-gradient(circle_at_top,#eff7ff,transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,250,1))] dark:bg-[radial-gradient(circle_at_top,#132235,transparent_35%),linear-gradient(180deg,rgba(12,18,28,0.96),rgba(8,12,20,1))]">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 px-4 py-3.5 backdrop-blur-md md:px-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-300">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="rounded-full border border-border/60 bg-background/50 shadow-xs backdrop-blur hover:bg-accent hover:text-accent-foreground transition-all duration-300 hover:scale-105 active:scale-95" />
              <div>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/90">
                      Administrador
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="text-muted-foreground/40" />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/85">{currentItem.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <h1 className="mt-0.5 text-lg font-bold tracking-tight text-foreground sm:text-xl md:text-2xl bg-linear-to-r from-foreground to-foreground/80 bg-clip-text">
                  {currentItem.label}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <Badge variant="outline" className="gap-2 rounded-full border-primary/10 bg-primary/5 px-3.5 py-1.5 text-xs font-medium text-primary shadow-xs transition-all hover:bg-primary/10">
                <CalendarDays className="size-3.5 text-primary animate-pulse" />
                {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date())}
              </Badge>
              <Button asChild variant="outline" className="rounded-full border-border/80 bg-background/50 backdrop-blur shadow-xs">
                <Link to="/pos">
                  <Store className="mr-2 size-4" />
                  POS
                </Link>
              </Button>
              <Button variant="outline" size="icon-sm" className="rounded-full border-border/80 bg-background/50 backdrop-blur shadow-xs hover:bg-accent hover:text-accent-foreground hover:scale-105 active:scale-95 transition-all duration-300 relative">
                <Bell className="size-4" />
                <span className="absolute top-1 right-1 flex size-2 rounded-full bg-primary animate-pulse" />
                <span className="sr-only">Notificaciones</span>
              </Button>
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-foreground">{user?.displayName ?? 'Administrador'}</p>
                <p className="text-xs text-muted-foreground">{user?.username ?? 'sesion activa'}</p>
              </div>
              <Avatar className="size-9 border-2 border-primary/20 shadow-md shadow-primary/5 transition-all duration-300">
                <AvatarFallback className="bg-primary/10 font-bold text-primary text-xs">{initials}</AvatarFallback>
              </Avatar>
              <Button variant="outline" size="icon-sm" className="rounded-full" onClick={logout}>
                <LogOut className="size-4" />
                <span className="sr-only">Cerrar sesion</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 md:px-6 md:py-6 lg:px-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
