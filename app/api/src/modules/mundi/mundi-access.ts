import { Role } from '../../common/enums/role.enum';
import { effectivePermissionCodes } from '../../common/permissions/permission.constants';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';

/**
 * Contexto que viaja con cada ejecución del agente. Las herramientas lo leen
 * para respetar exactamente los mismos roles y permisos que los guards HTTP.
 */
export interface MundiRunContext {
  user: AuthUser;
  permissions: Set<string>;
  /** callIds de acciones de escritura que el usuario confirmó en el chat. */
  confirmedCallIds?: Set<string>;
}

export interface MundiAccessRule {
  roles?: Role[];
  permissions?: string[];
}

export function buildPermissionSet(
  user: AuthUser,
  overrides: Array<{ code: string; isAllowed: boolean }>,
) {
  return new Set(effectivePermissionCodes(user.role, overrides));
}

/**
 * Replica RolesGuard + PermissionsGuard: el rol debe estar en la lista (si la
 * hay) y el usuario debe tener todos los permisos (ADMIN los tiene todos).
 * Devuelve null si tiene acceso o el motivo del rechazo.
 */
export function accessDenial(
  ctx: MundiRunContext,
  rule: MundiAccessRule,
): string | null {
  const { user, permissions } = ctx;
  if (rule.roles?.length && !rule.roles.includes(user.role)) {
    return `Tu rol (${user.role}) no puede hacer esto. Roles permitidos: ${rule.roles.join(', ')}.`;
  }
  if (rule.permissions?.length && user.role !== Role.ADMIN) {
    const missing = rule.permissions.filter((code) => !permissions.has(code));
    if (missing.length) {
      return `No tienes el permiso requerido: ${missing.join(', ')}.`;
    }
  }
  return null;
}
