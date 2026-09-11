import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Role } from '../enums/role.enum';
import { effectivePermissionCodes } from '../permissions/permission.constants';

type RequestWithUser = Request & {
  user?: { sub?: number; role?: Role };
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user?.sub || !user.role) return false;
    if (user.role === Role.ADMIN) return true;

    const overrides = await this.prisma.userPermission.findMany({
      where: { userId: user.sub },
      select: { code: true, isAllowed: true },
    });
    const allowed = new Set(effectivePermissionCodes(user.role, overrides));
    return required.every((permission) => allowed.has(permission));
  }
}
