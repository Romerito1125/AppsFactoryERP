import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, scryptSync } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
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

  async update(id: number, updateUserDto: UpdateUserDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

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

  private userSelect() {
    return {
      id: true,
      username: true,
      role: true,
      isActive: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}
