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
      registerDto.username,
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
          username: registerDto.username,
          password: this.hashPassword(registerDto.password),
          role: Role.CLIENTE,
        },
        include: { client: true, employee: true },
      });
    });

    return this.authResponse(user);
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: loginDto.username },
      include: { client: true, employee: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.client && !user.client.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.employee && !user.employee.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!this.verifyPassword(loginDto.password, user.password)) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.authResponse(user);
  }

  async profile(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.sub },
      include: { client: true, employee: true },
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
    username: string,
  ) {
    const [client, user] = await Promise.all([
      this.prisma.client.findUnique({ where: { identification } }),
      this.prisma.user.findUnique({ where: { username } }),
    ]);

    if (client) throw new ConflictException('La identificación ya existe');
    if (user) throw new ConflictException('El username ya existe');
  }

  private authResponse(user) {
    const payload = {
      sub: user.id,
      clientId: user.clientId,
      role: user.role,
      username: user.username,
    };
    const { password, client, employee, ...safeUser } = user;

    return {
      accessToken: this.jwtStrategy.sign(payload),
      user: safeUser,
      client,
      employee,
      role: user.role,
    };
  }

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
