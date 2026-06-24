import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AUTH_STORAGE_KEY = 'mmm-auth-session'

const AuthContext = createContext(null)

export const demoCredentials = {
  'santiago.admin': 'Admin123*',
  'valentina.ventas': 'Ventas123*',
  'diego.bodega': 'Bodega123*',
  'camila.conta': 'Conta123*',
}

export function defaultRouteForRole(role) {
  if (role === 'ADMIN' || role === 'CONTADOR') {
    return '/dashboard'
  }

  return '/pos'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)

  useEffect(() => {
    try {
      const storedSession = localStorage.getItem(AUTH_STORAGE_KEY)
      if (!storedSession) {
        return
      }

      setSession(JSON.parse(storedSession))
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      setSession(null)
    }
  }, [])

  function login(nextSession) {
    setSession(nextSession)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
  }

  function logout() {
    setSession(null)
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  const value = useMemo(
    () => ({
      session,
      user: session,
      isAuthenticated: Boolean(session),
      login,
      logout,
    }),
    [session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
