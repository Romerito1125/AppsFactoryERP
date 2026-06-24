import { Navigate, useLocation } from 'react-router-dom'

import { defaultRouteForRole, useAuth } from '@/auth/auth-context'

export function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation()
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
    return <Navigate to={defaultRouteForRole(user.role)} replace />
  }

  return children
}

export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, user } = useAuth()

  if (isAuthenticated) {
    return <Navigate to={defaultRouteForRole(user.role)} replace />
  }

  return children
}
