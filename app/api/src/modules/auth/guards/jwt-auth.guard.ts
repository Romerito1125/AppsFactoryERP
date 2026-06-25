import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtStrategy } from '../jwt.strategy';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtStrategy: JwtStrategy) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }

    request.user = this.jwtStrategy.validate(authorization.slice(7));
    return true;
  }
}
