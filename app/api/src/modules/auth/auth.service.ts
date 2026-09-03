import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientType, Role } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthUser } from './interfaces/auth-user.interface';
import { JwtStrategy } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtStrategy: JwtStrategy,
  ) {}

  async register(registerDto: RegisterDto) {
    await this.ensureUniqueClientAndUsername(
      registerDto.identification,
      registerDto.email,
    );

    const user = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          identification: registerDto.identification,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          phone: registerDto.phone,
          address: registerDto.address,
          clientType: ClientType.MINORISTA,
        },
      });

      return tx.user.create({
        data: {
          clientId: client.id,
          username: registerDto.email.trim().toLowerCase(),
          password: this.hashPassword(registerDto.password),
          role: Role.CLIENTE,
        },
        include: this.userInclude,
      });
    });

    return this.authResponse(user);
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: loginDto.email.trim().toLowerCase() },
      include: this.userInclude,
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.ensureUserCanAuthenticate(user);

    if (!this.verifyPassword(loginDto.password, user.password)) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.authResponse(user);
  }

  async refresh(refreshToken: string) {
    const payload = this.jwtStrategy.validate(refreshToken, 'refresh');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: this.userInclude,
    });

    this.ensureUserCanAuthenticate(user);

    return this.authResponse(user);
  }

  async profile(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.sub },
      include: this.userInclude,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password, client, employee, ...safeUser } = user;

    return {
      user: safeUser,
      client,
      employee,
      role: user.role,
    };
  }

  private async ensureUniqueClientAndUsername(
    identification: string,
    email: string,
  ) {
    const [client, user] = await Promise.all([
      this.prisma.client.findUnique({ where: { identification } }),
      this.prisma.user.findUnique({
        where: { username: email.trim().toLowerCase() },
      }),
    ]);

    if (client) throw new ConflictException('La identificación ya existe');
    if (user) throw new ConflictException('El correo ya existe');
  }

  private authResponse(user) {
    const payload = {
      sub: user.id,
      clientId: user.clientId,
      warehouseId: user.warehouseId,
      role: user.role,
      username: user.username,
    };
    const { password, client, employee, ...safeUser } = user;

    return {
      accessToken: this.jwtStrategy.sign(payload),
      refreshToken: this.jwtStrategy.signRefresh(payload),
      user: safeUser,
      client,
      employee,
      role: user.role,
    };
  }

  private ensureUserCanAuthenticate(user) {
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.role === Role.BODEGA && !user.warehouseId) {
      throw new UnauthorizedException(
        'El usuario de bodega no tiene una bodega asignada',
      );
    }

    if (user.client && !user.client.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.employee && !user.employee.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
  }

  private readonly userInclude = {
    client: {
      include: {
        referredBy: { select: { id: true } },
      },
    },
    employee: true,
  } as const;

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');

    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, storedPassword: string) {
    const [salt, hash] = storedPassword.split(':');

    if (!salt || !hash) return false;

    const passwordHash = scryptSync(password, salt, 64);
    const storedHash = Buffer.from(hash, 'hex');

    return (
      passwordHash.length === storedHash.length &&
      timingSafeEqual(passwordHash, storedHash)
    );
  }
}
