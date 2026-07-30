import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { FilterTagsDto } from './dto/filter-tags.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FilterTagsDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.tag.count({ where }),
      this.prisma.tag.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take,
        include: {
          _count: {
            select: {
              products: true,
              offers: true,
            },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            offers: true,
          },
        },
        products: {
          take: 6,
          include: {
            product: {
              select: { id: true, name: true, brand: true, isActive: true },
            },
          },
        },
        offers: {
          take: 6,
          include: {
            offer: {
              select: { id: true, name: true, isActive: true },
            },
          },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException('Etiqueta no encontrada');
    }

    return tag;
  }

  async create(createTagDto: CreateTagDto) {
    await this.ensureUniqueName(createTagDto.name);

    return this.prisma.tag.create({ data: createTagDto });
  }

  async update(id: number, updateTagDto: UpdateTagDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateTagDto.name) {
      await this.ensureUniqueName(updateTagDto.name, id);
    }

    return this.prisma.tag.update({ where: { id }, data: updateTagDto });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.tag.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    return this.prisma.tag.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
  }

  private async ensureUniqueName(name: string, currentId?: number) {
    const existingTag = await this.prisma.tag.findUnique({ where: { name } });

    if (existingTag && existingTag.id !== currentId) {
      throw new ConflictException('El nombre de la etiqueta ya existe');
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
        { name: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
