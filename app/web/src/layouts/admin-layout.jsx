import { motion } from 'framer-motion'
import { Bell, CalendarDays, Search } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { navigationItems, getNavigationItem } from '@/app/navigation'
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
import { Input } from '@/components/ui/input'
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
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset" className="px-3 py-4">
      <SidebarHeader className="px-2 pb-4">
        <div className="rounded-[1.75rem] border border-sidebar-border/60 bg-linear-to-br from-sidebar-accent/90 to-sidebar/70 p-4 shadow-xl shadow-black/10 ring-1 ring-white/5">
          <BrandMark compact className="items-center gap-4" />
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/6 px-3 py-2 text-left backdrop-blur">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-sidebar-foreground/60 uppercase">
              Panel administrativo
            </p>
            <p className="mt-1 text-sm font-medium text-sidebar-foreground">
              Operacion general MMM
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarGroup className="gap-3">
          <SidebarGroupLabel className="px-3 text-[11px] font-semibold tracking-[0.22em] text-sidebar-foreground/55 uppercase">
            Navegacion
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navigationItems.map((item) => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          cn(
                            'group flex min-h-[3.4rem] items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200',
                            'hover:bg-white/7 hover:text-sidebar-primary-foreground',
                            isActive
                              ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-primary/20'
                              : 'text-sidebar-foreground/92',
                          )
                        }
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/8 transition-colors group-hover:bg-white/12">
                          <Icon className="size-4.5" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                          <span className="text-sm font-medium leading-none">{item.label}</span>
                          <span className="truncate text-[11px] leading-none text-sidebar-foreground/68">
                            {item.description}
                          </span>
                        </div>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="px-2 pt-4">
        <div className="rounded-[1.5rem] border border-sidebar-border/60 bg-white/6 p-4 text-sm backdrop-blur">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-sidebar-foreground/60 uppercase">
            Empresa
          </p>
          <p className="mt-2 font-medium text-sidebar-foreground">Mundo Tienda MMM</p>
          <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/72">
            Gestion comercial, inventario y facturacion desde un solo lugar.
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

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': '19rem',
        '--sidebar-width-icon': '5rem',
      }}
    >
      <AppSidebar />
      <SidebarInset className="overflow-hidden bg-[radial-gradient(circle_at_top,#eff7ff,transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,250,1))] dark:bg-[radial-gradient(circle_at_top,#132235,transparent_35%),linear-gradient(180deg,rgba(12,18,28,0.96),rgba(8,12,20,1))]">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="rounded-full" />
              <div>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="text-xs uppercase tracking-[0.18em] text-primary">
                      Administrador
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{currentItem.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                  {currentItem.label}
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[240px] max-w-sm flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  readOnly
                  value="Centro de control comercial"
                  className="rounded-full bg-background pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1">
                  <CalendarDays className="size-3.5" />
                  {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
                    new Date(),
                  )}
                </Badge>
                <Button variant="outline" size="icon-sm" className="rounded-full">
                  <Bell className="size-4" />
                  <span className="sr-only">Notificaciones</span>
                </Button>
                <ThemeToggle />
                <Avatar className="size-9 border border-primary/15 shadow-sm shadow-primary/10">
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                    MMM
                  </AvatarFallback>
                </Avatar>
              </div>
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
