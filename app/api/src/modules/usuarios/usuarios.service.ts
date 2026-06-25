import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: this.userSelect(),
    });
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

  async create(createUserDto: CreateUserDto) {
    await this.ensureClientExists(createUserDto.clientId);

    const existingUser = await this.prisma.user.findUnique({
      where: { username: createUserDto.username },
    });

    if (existingUser) {
      throw new ConflictException('El username ya existe');
    }

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: this.hashPassword(createUserDto.password),
      },
      select: this.userSelect(),
    });

    return user;
  }

  async createEmployee(createEmployeeDto: CreateEmployeeDto) {
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
      where: { username: createEmployeeDto.username },
    });

    if (existingUser) {
      throw new ConflictException('El username ya existe');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username: createEmployeeDto.username,
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

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateUserDto.clientId) {
      await this.ensureClientExists(updateUserDto.clientId, id);
    }

    if (updateUserDto.username) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username: updateUserDto.username },
      });

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('El username ya existe');
      }
    }

    const data = {
      ...updateUserDto,
      ...(updateUserDto.password && {
        password: this.hashPassword(updateUserDto.password),
      }),
    };

    return this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect(),
    });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      select: this.userSelect(),
    });
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
      username: true,
      role: true,
      isActive: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}
