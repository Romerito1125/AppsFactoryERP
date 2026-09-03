import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateClientDto } from './dto/create-client.dto';
import { FilterClientsDto } from './dto/filter-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(filter: FilterClientsDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take,
        include: this.clientInclude,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const client = await this.prisma.client.findUnique({
      where: { id },
      include: this.clientInclude,
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return client;
  }

  async create(createClientDto: CreateClientDto, actor?: AuthUser) {
    const { email, password, ...clientData } = createClientDto;
    const credentials = this.resolveCreateCredentials(email, password);
    const existingClient = await this.prisma.client.findUnique({
      where: { identification: createClientDto.identification },
    });

    if (existingClient) {
      throw new ConflictException('La identificación ya existe');
    }

    if (credentials.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username: credentials.email },
      });

      if (existingUser) {
        throw new ConflictException('El correo ya existe');
      }
    }

    const client = await this.prisma.$transaction(async (tx) => {
      const createdClient = await tx.client.create({ data: clientData });

      if (credentials.email && credentials.password) {
        await tx.user.create({
          data: {
            clientId: createdClient.id,
            username: credentials.email,
            password: this.hashPassword(credentials.password),
            role: Role.CLIENTE,
            isActive: true,
          },
        });
      }

      return tx.client.findUniqueOrThrow({
        where: { id: createdClient.id },
        include: this.clientInclude,
      });
    });
    await this.auditLogService.log({
      actor,
      module: 'CLIENTES',
      action: 'CREATE',
      entityType: 'Client',
      entityId: client.id,
      entityLabel: `${client.firstName} ${client.lastName}`,
      description: `Creo el cliente ${client.firstName} ${client.lastName}`,
      metadata: {
        clientType: client.clientType,
        identification: client.identification,
        appAccessCreated: Boolean(credentials.email),
      },
    });
    return client;
  }

  async update(id: number, updateClientDto: UpdateClientDto, actor?: AuthUser) {
    this.ensurePositiveId(id);
    const current = await this.findOne(id);
    const { email, password, ...clientData } = updateClientDto;
    const normalizedEmail = email?.trim().toLowerCase() || undefined;
    const hasPassword = Boolean(password);

    if (updateClientDto.identification) {
      const existingClient = await this.prisma.client.findUnique({
        where: { identification: updateClientDto.identification },
      });

      if (existingClient && existingClient.id !== id) {
        throw new ConflictException('La identificación ya existe');
      }
    }

    if (normalizedEmail) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username: normalizedEmail },
      });

      if (existingUser && existingUser.id !== current.user?.id) {
        throw new ConflictException('El correo ya existe');
      }
    }

    if (
      !current.user &&
      (normalizedEmail !== undefined || hasPassword) &&
      (!normalizedEmail || !password)
    ) {
      throw new BadRequestException(
        'Para crear el acceso de la app debes indicar correo y contraseña',
      );
    }

    const client = await this.prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: clientData });

      if (current.user) {
        if (normalizedEmail || hasPassword) {
          await tx.user.update({
            where: { id: current.user.id },
            data: {
              ...(normalizedEmail ? { username: normalizedEmail } : {}),
              ...(password ? { password: this.hashPassword(password) } : {}),
            },
          });
        }
      } else if (normalizedEmail && password) {
        await tx.user.create({
          data: {
            clientId: id,
            username: normalizedEmail,
            password: this.hashPassword(password),
            role: Role.CLIENTE,
            isActive: true,
          },
        });
      }

      return tx.client.findUniqueOrThrow({
        where: { id },
        include: this.clientInclude,
      });
    });
    await this.auditLogService.log({
      actor,
      module: 'CLIENTES',
      action: 'UPDATE',
      entityType: 'Client',
      entityId: client.id,
      entityLabel: `${client.firstName} ${client.lastName}`,
      description: `Actualizo el cliente ${client.firstName} ${client.lastName}`,
      metadata: {
        changedFields: Object.keys(updateClientDto),
        appAccessUpdated: Boolean(normalizedEmail || hasPassword),
      },
    });
    return client;
  }

  async remove(id: number, actor?: AuthUser) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    const client = await this.prisma.client.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    await this.auditLogService.log({
      actor,
      module: 'CLIENTES',
      action: 'DEACTIVATE',
      entityType: 'Client',
      entityId: client.id,
      entityLabel: `${client.firstName} ${client.lastName}`,
      description: `Desactivo el cliente ${client.firstName} ${client.lastName}`,
    });
    return client;
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.client.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
  }

  async findReferrals(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.referral.findMany({
      where: { referrerClientId: id },
      include: {
        referredClient: {
          select: {
            id: true,
            identification: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }

  async generateReferralCode(id: number) {
    this.ensurePositiveId(id);

    const client = await this.prisma.client.findUnique({ where: { id } });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!client.isActive) {
      throw new BadRequestException(
        'No se puede generar código para un cliente inactivo',
      );
    }

    if (client.referralCode) {
      return client;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const referralCode = this.buildReferralCode(client.firstName, client.id);
      const existingClient = await this.prisma.client.findUnique({
        where: { referralCode },
      });

      if (!existingClient) {
        return this.prisma.client.update({
          where: { id },
          data: { referralCode },
        });
      }
    }

    throw new ConflictException('No fue posible generar un código único');
  }

  async updateReferralLevel(id: number, referralLevel: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.client.update({
      where: { id },
      data: { referralLevel },
    });
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) {
      return undefined;
    }

    if (status === RecordStatusQuery.INACTIVOS) {
      return { isActive: false };
    }

    return { isActive: true };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { identification: { contains: q, mode: 'insensitive' as const } },
        { firstName: { contains: q, mode: 'insensitive' as const } },
        { lastName: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q, mode: 'insensitive' as const } },
        { address: { contains: q, mode: 'insensitive' as const } },
        { referralCode: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }

  private resolveCreateCredentials(email?: string, password?: string) {
    const normalizedEmail = email?.trim().toLowerCase() || undefined;

    if ((normalizedEmail && !password) || (!normalizedEmail && password)) {
      throw new BadRequestException(
        'Para crear el acceso de la app debes indicar correo y contraseña',
      );
    }

    return { email: normalizedEmail, password };
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');

    return `${salt}:${hash}`;
  }

  private readonly clientInclude = {
    user: {
      select: {
        id: true,
        username: true,
        isActive: true,
      },
    },
  } as const;

  private buildReferralCode(firstName: string, id: number) {
    const prefix = firstName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(4, 'X');
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();

    return `${prefix}${id}${suffix}`;
  }
}
