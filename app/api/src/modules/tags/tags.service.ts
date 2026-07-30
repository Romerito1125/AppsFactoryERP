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
          products: {
            take: 4,
            include: {
              product: {
                select: { id: true, name: true, brand: true, isActive: true },
              },
            },
          },
          offers: {
            take: 4,
            include: {
              offer: {
                select: { id: true, name: true, isActive: true },
              },
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
    await this.ensureProductsExist(createTagDto.productIds);
    await this.ensureOffersExist(createTagDto.offerIds);

    const { productIds, offerIds, ...tagData } = createTagDto;

    return this.prisma.tag.create({
      data: {
        ...tagData,
        products: productIds?.length
          ? { create: productIds.map((productId) => ({ productId })) }
          : undefined,
        offers: offerIds?.length
          ? { create: offerIds.map((offerId) => ({ offerId })) }
          : undefined,
      },
      include: {
        _count: { select: { products: true, offers: true } },
      },
    });
  }

  async update(id: number, updateTagDto: UpdateTagDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateTagDto.name) {
      await this.ensureUniqueName(updateTagDto.name, id);
    }

    await this.ensureProductsExist(updateTagDto.productIds);
    await this.ensureOffersExist(updateTagDto.offerIds);

    const { productIds, offerIds, ...tagData } = updateTagDto;

    return this.prisma.$transaction(async (tx) => {
      if (productIds) {
        await tx.productTag.deleteMany({ where: { tagId: id } });
      }

      if (offerIds) {
        await tx.offerTag.deleteMany({ where: { tagId: id } });
      }

      return tx.tag.update({
        where: { id },
        data: {
          ...tagData,
          products: productIds
            ? { create: productIds.map((productId) => ({ productId })) }
            : undefined,
          offers: offerIds
            ? { create: offerIds.map((offerId) => ({ offerId })) }
            : undefined,
        },
        include: {
          _count: { select: { products: true, offers: true } },
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
    });
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

  private async ensureProductsExist(productIds?: number[]) {
    if (!productIds?.length) return;

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Uno o mas productos no existen o estan inactivos');
    }
  }

  private async ensureOffersExist(offerIds?: number[]) {
    if (!offerIds?.length) return;

    const offers = await this.prisma.offer.findMany({
      where: { id: { in: offerIds }, isActive: true },
      select: { id: true },
    });

    if (offers.length !== offerIds.length) {
      throw new BadRequestException('Una o mas ofertas no existen o estan inactivas');
    }
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
