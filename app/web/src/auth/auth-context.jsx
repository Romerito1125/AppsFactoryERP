import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export const AUTH_STORAGE_KEY = 'mmm-auth-session'

const AuthContext = createContext(null)

export const demoCredentials = {
  'admin@mundotienda.com': 'Admin123*',
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

export function storeSession(nextSession) {
  if (nextSession) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  window.dispatchEvent(new CustomEvent('auth:session-updated', { detail: nextSession }))
}

export function defaultRouteForRole(role) {
  if (role === 'ADMIN') {
    return '/dashboard'
  }

  if (role === 'CONTADOR') {
    return '/creditos'
  }

  if (role === 'BODEGA') {
    return '/compras'
  }

  return '/pos'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession())

  useEffect(() => {
    function handleSessionUpdated(event) {
      setSession(event.detail ?? getStoredSession())
    }

    window.addEventListener('auth:session-updated', handleSessionUpdated)

    return () => window.removeEventListener('auth:session-updated', handleSessionUpdated)
  }, [])

  function login(nextSession) {
    setSession(nextSession)
    storeSession(nextSession)
  }

  function logout() {
    setSession(null)
    storeSession(null)
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
