import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, LockKeyhole, LogIn, User } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { defaultRouteForRole, demoCredentials, useAuth } from '@/auth/auth-context'
import { BrandMark } from '@/components/brand/brand-mark'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { apiClient } from '@/lib/api-client'
import { formatRole } from '@/lib/format'
import { cn } from '@/lib/utils'


function LoginSkeleton() {
  return (
    <div className="flex items-center justify-center w-full min-h-[calc(100vh-6rem)] py-8 md:py-12">
      <div className="w-full max-w-[460px] p-6 space-y-6 rounded-3xl border border-border/40 bg-card/70 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col items-center justify-center space-y-4">
          <Skeleton className="h-20 w-20 rounded-[1.75rem]" />
          <Skeleton className="h-6 w-32 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded-lg" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-12 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <div className="space-y-3 pt-2">
          <Skeleton className="h-3 w-28 mx-auto rounded-lg" />
          <div className="grid grid-cols-2 gap-2.5">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [email, setEmail] = useState('santiago.admin@appsfactory.local')
  const [password, setPassword] = useState('Admin123*')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const accessQuery = useQuery({
    queryKey: ['login-access-data'],
    queryFn: async () => {
      const [users, clients] = await Promise.all([
        apiClient.getAllPages('/usuarios'),
        apiClient.getAllPages('/clientes', { estado: 'todos' }),
      ])

      return { users, clients }
    },
  })

  const demoAccess = useMemo(() => {
    if (!accessQuery.data) {
      return []
    }

    const clientsById = new Map(accessQuery.data.clients.map((client) => [client.id, client]))

    return accessQuery.data.users
      .filter((user) => demoCredentials[user.username])
      .map((user) => {
        const client = clientsById.get(user.clientId)

        return {
          username: user.username,
          password: demoCredentials[user.username],
          role: user.role,
          label:
            `${client?.firstName ?? ''} ${client?.lastName ?? ''}`.trim() ||
            `${user.employee?.firstName ?? ''} ${user.employee?.lastName ?? ''}`.trim() ||
            user.username,
          subtitle: client?.identification ?? user.employee?.identification ?? `Usuario #${user.id}`,
          route: defaultRouteForRole(user.role),
        }
      })
      .sort((left, right) => (left.role === 'ADMIN' ? -1 : right.role === 'ADMIN' ? 1 : left.label.localeCompare(right.label)))
  }, [accessQuery.data])

  async function handleSubmit(event) {
    event.preventDefault()

    setIsSubmitting(true)

    try {
      const authResponse = await apiClient.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      })

      const displayName =
        `${authResponse.client?.firstName ?? ''} ${authResponse.client?.lastName ?? ''}`.trim() ||
        `${authResponse.employee?.firstName ?? ''} ${authResponse.employee?.lastName ?? ''}`.trim()
      const sessionUser = authResponse.user ?? {}

      login({
        accessToken: authResponse.accessToken,
        id: sessionUser.id,
        username: sessionUser.username,
        role: authResponse.role,
        clientId: sessionUser.clientId ?? authResponse.client?.id ?? null,
        displayName: displayName || sessionUser.username,
        identification: authResponse.client?.identification ?? null,
        loginAt: new Date().toISOString(),
      })

      const redirectTo = location.state?.from?.pathname
      navigate(redirectTo ?? defaultRouteForRole(authResponse.role), { replace: true })
      toast.success(`Sesion iniciada como ${displayName || sessionUser.username}`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (accessQuery.isLoading) {
    return <LoginSkeleton />
  }

  if (accessQuery.isError) {
    return (
      <div className="flex items-center justify-center w-full min-h-[calc(100vh-6rem)] p-4">
        <div className="w-full max-w-[460px] rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive text-center">
          <p className="font-semibold mb-2">Error al cargar datos de acceso</p>
          <p className="opacity-90">{accessQuery.error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center w-full min-h-[calc(100vh-6rem)] py-8 md:py-12">
      <Card className="w-full max-w-[460px] border-border/60 bg-card/70 backdrop-blur-xl shadow-2xl rounded-3xl relative overflow-hidden">
        {/* Glow effects */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(247,139,45,0.08),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(54,169,255,0.06),transparent_40%)]" />
        
        {/* Floating Theme Toggle */}
        <div className="absolute top-5 right-5 z-10">
          <ThemeToggle />
        </div>

        <CardContent className="p-6 md:p-8 flex flex-col gap-6">
          {/* Centered Logo Branding */}
          <div className="flex flex-col items-center justify-center text-center mt-3">
            <BrandMark className="flex-col text-center items-center gap-3" compact={false} />
            <h2 className="text-xl font-bold tracking-tight mt-5 text-foreground">
              Iniciar Sesión
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
              Ingresa al centro de control comercial Mundo Tienda Montes de María
            </p>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground">
                Correo
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/85" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                  className="pl-9 h-10.5 rounded-xl border-border/70 bg-background/50 focus-visible:bg-background/80 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground">
                Contraseña
              </Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/85" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                  autoComplete="current-password"
                  className="pl-9 pr-10 h-10.5 rounded-xl border-border/70 bg-background/50 focus-visible:bg-background/80 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/80 hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-muted"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 mt-2 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/10 hover:shadow-primary/20 active:scale-[0.98] transition-all duration-200 cursor-pointer"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Validando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Entrar
                  <LogIn className="size-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Quick Access Demo Accounts */}
          {demoAccess.length > 0 && (
            <div className="space-y-3 pt-1 border-t border-border/40">
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-border/30"></div>
                <span className="flex-shrink mx-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Accesos Rápidos Demo
                </span>
                <div className="flex-grow border-t border-border/30"></div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {demoAccess.map((item) => {
                  const isActive = email === item.username
                  return (
                    <button
                      key={item.username}
                      type="button"
                      onClick={() => {
                        setEmail(item.username)
                        setPassword(item.password)
                        toast.info(`Credenciales de ${item.label.split(' ')[0]} cargadas`)
                      }}
                      className={cn(
                        "flex items-center gap-2.5 p-2.5 rounded-xl text-left border transition-all duration-200 cursor-pointer text-xs select-none",
                        isActive
                          ? "bg-primary/10 border-primary/45 shadow-sm shadow-primary/5"
                          : "bg-muted/30 border-border/40 hover:bg-muted/60 hover:border-border-muted"
                      )}
                    >
                      <div className={cn(
                        "flex items-center justify-center size-8 rounded-lg font-bold shrink-0 transition-colors text-[10.5px]",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      )}>
                        {item.label.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-semibold truncate text-foreground", isActive && "text-primary font-bold")}>
                          {item.label.split(' ')[0]}
                        </p>
                        <p className="text-[9px] text-muted-foreground truncate uppercase tracking-wider">
                          {formatRole(item.role)}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
