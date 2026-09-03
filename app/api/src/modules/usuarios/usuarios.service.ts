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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: ListUsersQueryDto) {
    const where = {
      ...this.getStatusWhere(query.estado),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { id: 'asc' },
        select: this.userSelect(),
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelect(),
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async create(createUserDto: CreateUserDto, actor: AuthUser) {
    if (createUserDto.role === Role.BODEGA && !createUserDto.warehouseId) {
      throw new BadRequestException(
        'Un usuario BODEGA debe tener una bodega asignada',
      );
    }
    if (createUserDto.clientId) {
      await this.ensureClientExists(createUserDto.clientId);
    }
    if (createUserDto.warehouseId) {
      await this.ensureWarehouseExists(createUserDto.warehouseId);
    }

    const normalizedEmail = createUserDto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { username: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('El correo ya existe');
    }

    const user = await this.prisma.user.create({
      data: {
        clientId: createUserDto.clientId,
        warehouseId: createUserDto.warehouseId,
        role: createUserDto.role,
        isActive: createUserDto.isActive,
        username: normalizedEmail,
        password: this.hashPassword(createUserDto.password),
      },
      select: this.userSelect(),
    });

    await this.auditLogService.log({
      actor,
      module: 'USUARIOS',
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      entityLabel: user.username,
      description: `Creo el usuario ${user.username}`,
      metadata: { role: user.role, clientId: user.clientId },
    });

    return user;
  }

  async createEmployee(createEmployeeDto: CreateEmployeeDto, actor: AuthUser) {
    if (createEmployeeDto.role === Role.CLIENTE) {
      throw new BadRequestException(
        'Un funcionario no puede tener rol CLIENTE',
      );
    }

    const existingEmployee = await this.prisma.employee.findUnique({
      where: { identification: createEmployeeDto.identification },
    });

    if (existingEmployee) {
      throw new ConflictException('La identificación ya existe');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { username: createEmployeeDto.email.trim().toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('El correo ya existe');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username: createEmployeeDto.email.trim().toLowerCase(),
          password: this.hashPassword(createEmployeeDto.password),
          role: createEmployeeDto.role,
        },
      });

      return tx.employee.create({
        data: {
          userId: createdUser.id,
          identification: createEmployeeDto.identification,
          firstName: createEmployeeDto.firstName,
          lastName: createEmployeeDto.lastName,
          phone: createEmployeeDto.phone,
          address: createEmployeeDto.address,
        },
        include: { user: { select: this.userSelect() } },
      });
    });

    await this.auditLogService.log({
      actor,
      module: 'USUARIOS',
      action: 'CREATE_EMPLOYEE',
      entityType: 'EmployeeUser',
      entityId: user.user.id,
      entityLabel: user.user.username,
      description: `Creo el funcionario ${user.firstName} ${user.lastName}`,
      metadata: {
        userId: user.user.id,
        employeeId: user.id,
        role: user.user.role,
        identification: user.identification,
      },
    });

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto, actor: AuthUser) {
    this.ensurePositiveId(id);
    const current = await this.findOne(id);
    const nextRole = updateUserDto.role ?? current.role;
    const nextWarehouseId = updateUserDto.warehouseId ?? current.warehouseId;

    if (nextRole === Role.BODEGA && !nextWarehouseId) {
      throw new BadRequestException(
        'Un usuario BODEGA debe tener una bodega asignada',
      );
    }

    if (updateUserDto.clientId) {
      await this.ensureClientExists(updateUserDto.clientId, id);
    }
    if (updateUserDto.warehouseId) {
      await this.ensureWarehouseExists(updateUserDto.warehouseId);
    }

    if (updateUserDto.email) {
      const normalizedEmail = updateUserDto.email.trim().toLowerCase();
      const existingUser = await this.prisma.user.findUnique({
        where: { username: normalizedEmail },
      });

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('El correo ya existe');
      }
    }

    const data = {
      ...updateUserDto,
      ...(updateUserDto.email
        ? { username: updateUserDto.email.trim().toLowerCase() }
        : {}),
      ...(updateUserDto.password && {
        password: this.hashPassword(updateUserDto.password),
      }),
    };

    delete data.email;

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect(),
    });
    await this.auditLogService.log({
      actor,
      module: 'USUARIOS',
      action: 'UPDATE',
      entityType: 'User',
      entityId: user.id,
      entityLabel: user.username,
      description: `Actualizo el usuario ${user.username}`,
      metadata: {
        userId: user.id,
        changedFields: Object.keys(updateUserDto).filter(
          (field) => field !== 'password',
        ),
        previousRole: current.role,
        nextRole: user.role,
        passwordChanged: Boolean(updateUserDto.password),
      },
    });
    return user;
  }

  async remove(id: number, actor: AuthUser) {
    this.ensurePositiveId(id);
    const current = await this.findOne(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      select: this.userSelect(),
    });
    await this.auditLogService.log({
      actor,
      module: 'USUARIOS',
      action: 'DEACTIVATE',
      entityType: 'User',
      entityId: user.id,
      entityLabel: user.username,
      description: `Desactivo el usuario ${user.username}`,
      metadata: { userId: user.id, previousStatus: current.isActive },
    });
    return user;
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');

    return `${salt}:${hash}`;
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }

  private async ensureClientExists(clientId: number, currentUserId?: number) {
    this.ensurePositiveId(clientId);

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { user: true },
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!client.isActive) {
      throw new BadRequestException('El cliente está inactivo');
    }

    if (client.user && client.user.id !== currentUserId) {
      throw new ConflictException('El cliente ya tiene usuario');
    }
  }

  private userSelect() {
    return {
      id: true,
      clientId: true,
      warehouseId: true,
      username: true,
      role: true,
      isActive: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      employee: {
        select: {
          id: true,
          identification: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      },
    };
  }

  private async ensureWarehouseExists(warehouseId: number) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException(
        'La bodega seleccionada no existe o está inactiva',
      );
    }
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) return undefined;
    if (status === RecordStatusQuery.INACTIVOS) return { isActive: false };
    return { isActive: true };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { username: { contains: q, mode: 'insensitive' as const } },
        { role: { equals: q.toUpperCase() as Role } },
      ],
    };
  }
}
