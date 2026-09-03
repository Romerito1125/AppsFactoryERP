import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { envs } from '../../config/envs';
import { AuthUser } from './interfaces/auth-user.interface';

type TokenType = 'access' | 'refresh';

@Injectable()
export class JwtStrategy {
  sign(payload: AuthUser, tokenType: TokenType = 'access') {
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.parseExpiresIn(
      tokenType === 'refresh'
        ? (envs.jwt.refreshExpiresIn ?? 'never')
        : (envs.jwt.expiresIn ?? '1d'),
    );
    const body = this.encode({
      ...payload,
      tokenType,
      iat: now,
      ...(expiresIn === null ? {} : { exp: now + expiresIn }),
    });
    const signature = this.signContent(`${header}.${body}`);

    return `${header}.${body}.${signature}`;
  }

  signRefresh(payload: AuthUser) {
    return this.sign(payload, 'refresh');
  }

  validate(token: string, expectedTokenType: TokenType = 'access'): AuthUser {
    const [header, body, signature] = token.split('.');

    if (!header || !body || !signature) {
      throw new UnauthorizedException('Token inválido');
    }

    const expectedSignature = this.signContent(`${header}.${body}`);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new UnauthorizedException('Token inválido');
    }

    let payload: AuthUser & { exp?: number; tokenType?: TokenType };

    try {
      payload = JSON.parse(this.decode(body));
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    if (expectedTokenType === 'refresh' && payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (expectedTokenType === 'access' && payload.tokenType === 'refresh') {
      throw new UnauthorizedException('Token inválido');
    }

    const now = Math.floor(Date.now() / 1000);

    if (expectedTokenType === 'access' && (!payload.exp || payload.exp < now)) {
      throw new UnauthorizedException('Token expirado');
    }

    if (expectedTokenType === 'refresh' && payload.exp && payload.exp < now) {
      throw new UnauthorizedException('Token expirado');
    }

    return {
      sub: Number(payload.sub),
      clientId: payload.clientId ? Number(payload.clientId) : null,
      warehouseId: payload.warehouseId ? Number(payload.warehouseId) : null,
      role: payload.role,
      username: payload.username,
    };
  }

  private signContent(content: string) {
    return createHmac('sha256', envs.jwt.secret ?? 'dev-jwt-secret-change-me')
      .update(content)
      .digest('base64url');
  }

  private encode(value: unknown) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decode(value: string) {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  private parseExpiresIn(value: string): number | null {
    if (value.trim().toLowerCase() === 'never') return null;

    const match = value.match(/^(\d+)([smhd])$/);

    if (!match) return 86400;

    const amount = Number(match[1]);
    const unit = match[2];
    const factors = { s: 1, m: 60, h: 3600, d: 86400 };

    return amount * factors[unit];
  }
}
