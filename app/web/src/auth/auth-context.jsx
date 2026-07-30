import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AUTH_STORAGE_KEY = 'mmm-auth-session'

const AuthContext = createContext(null)

export const demoCredentials = {
  'santiago.admin@appsfactory.local': 'Admin123*',
  'laura.cajero@appsfactory.local': 'Cajero123*',
  'valentina.ventas@appsfactory.local': 'Ventas123*',
  'diego.bodega@appsfactory.local': 'Bodega123*',
  'camila.conta@appsfactory.local': 'Conta123*',
  'nicolas.ventas@appsfactory.local': 'Ventas456*',
  'paula.cajero@appsfactory.local': 'Caja456*',
  'sergio.bodega@appsfactory.local': 'Bodega456*',
}

export function getStoredSession() {
  try {
    const storedSession = localStorage.getItem(AUTH_STORAGE_KEY)
    return storedSession ? JSON.parse(storedSession) : null
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export function defaultRouteForRole(role) {
  if (role === 'ADMIN') {
    return '/dashboard'
  }

  if (role === 'CONTADOR') {
    return '/creditos'
  }

  return '/pos'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession())

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
