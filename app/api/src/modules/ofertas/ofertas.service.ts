import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ApplicableOffersDto } from './dto/applicable-offers.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { FilterOffersDto } from './dto/filter-offers.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';

@Injectable()
export class OfertasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filter: FilterOffersDto) {
    return this.prisma.offer
      .findMany({
        where: this.getStatusWhere(filter.estado),
        include: this.offerInclude,
        orderBy: { id: 'asc' },
      })
      .then((offers) => offers.map((offer) => this.formatOffer(offer)));
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: this.offerInclude,
    });

    if (!offer) {
      throw new NotFoundException('Oferta no encontrada');
    }

    return this.formatOffer(offer);
  }

  async create(createOfferDto: CreateOfferDto) {
    const { clientIds, productIds, productTypeIds, tagIds, ...offerData } =
      createOfferDto;

    this.validateDiscount(offerData.discountType, offerData.discountValue);
    this.validateDates(offerData.startsAt, offerData.endsAt);
    await this.ensureRelatedIdsExist({
      clientIds,
      productIds,
      productTypeIds,
      tagIds,
    });

    // Oferta y targets se crean en una transacción para no dejar relaciones huérfanas.
    const offer = await this.prisma.$transaction((tx) =>
      tx.offer.create({
        data: {
          ...offerData,
          clients: this.buildOfferClients(clientIds),
          products: this.buildOfferProducts(productIds),
          productTypes: this.buildOfferProductTypes(productTypeIds),
          tags: this.buildOfferTags(tagIds),
        },
        include: this.offerInclude,
      }),
    );

    return this.formatOffer(offer);
  }

  async update(id: number, updateOfferDto: UpdateOfferDto) {
    this.ensurePositiveId(id);
    const currentOffer = await this.prisma.offer.findUnique({ where: { id } });

    if (!currentOffer) {
      throw new NotFoundException('Oferta no encontrada');
    }

    const { clientIds, productIds, productTypeIds, tagIds, ...offerData } =
      updateOfferDto;
    const discountType = offerData.discountType ?? currentOffer.discountType;
    const discountValue =
      offerData.discountValue ?? Number(currentOffer.discountValue);
    const startsAt = offerData.startsAt ?? currentOffer.startsAt ?? undefined;
    const endsAt = offerData.endsAt ?? currentOffer.endsAt ?? undefined;

    this.validateDiscount(discountType, discountValue);
    this.validateDates(startsAt, endsAt);
    await this.ensureRelatedIdsExist({
      clientIds,
      productIds,
      productTypeIds,
      tagIds,
    });

    const offer = await this.prisma.$transaction(async (tx) => {
      // Cada array enviado reemplaza por completo su grupo de targets.
      if (clientIds)
        await tx.offerClient.deleteMany({ where: { offerId: id } });
      if (productIds)
        await tx.offerProduct.deleteMany({ where: { offerId: id } });
      if (productTypeIds) {
        await tx.offerProductType.deleteMany({ where: { offerId: id } });
      }
      if (tagIds) await tx.offerTag.deleteMany({ where: { offerId: id } });

      return tx.offer.update({
        where: { id },
        data: {
          ...offerData,
          clients: this.buildOfferClients(clientIds),
          products: this.buildOfferProducts(productIds),
          productTypes: this.buildOfferProductTypes(productTypeIds),
          tags: this.buildOfferTags(tagIds),
        },
        include: this.offerInclude,
      });
    });

    return this.formatOffer(offer);
  }

  async remove(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    const offer = await this.prisma.offer.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: this.offerInclude,
    });

    return this.formatOffer(offer);
  }

  async reactivate(id: number) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    const offer = await this.prisma.offer.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
      include: this.offerInclude,
    });

    return this.formatOffer(offer);
  }

  async findApplicable(applicableOffersDto: ApplicableOffersDto) {
    const client = await this.prisma.client.findUnique({
      where: { id: applicableOffersDto.clientId },
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!client.isActive) {
      throw new BadRequestException('El cliente está inactivo');
    }

    const productIds = [
      ...new Set(applicableOffersDto.items.map((item) => item.productId)),
    ];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        productType: true,
        tags: { include: { tag: true } },
      },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('Uno o más productos no existen');
    }

    const inactiveProduct = products.find((product) => !product.isActive);
    if (inactiveProduct) {
      throw new BadRequestException(
        `El producto ${inactiveProduct.id} está inactivo`,
      );
    }

    const now = new Date();
    // Solo se consideran ofertas activas, no eliminadas y vigentes por fechas.
    const offers = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      include: this.offerInclude,
      orderBy: { id: 'asc' },
    });

    return {
      clientId: applicableOffersDto.clientId,
      items: applicableOffersDto.items.map((item) => {
        const product = products.find(
          (currentProduct) => currentProduct.id === item.productId,
        );

        if (!product) {
          throw new NotFoundException('Producto no encontrado');
        }

        const productTagIds = product.tags.map(
          (productTag) => productTag.tagId,
        );
        const applicableOffers = offers.filter((offer) =>
          this.offerAppliesToItem(
            offer,
            applicableOffersDto.clientId,
            product.id,
            product.productTypeId,
            productTagIds,
          ),
        );

        return {
          productId: item.productId,
          quantity: item.quantity,
          applicableOffers: applicableOffers.map((offer) => ({
            id: offer.id,
            name: offer.name,
            discountType: offer.discountType,
            discountValue: String(offer.discountValue),
          })),
        };
      }),
    };
  }

  private readonly offerInclude = {
    clients: { include: { client: true } },
    products: { include: { product: true } },
    productTypes: { include: { productType: true } },
    tags: { include: { tag: true } },
  } as const;

  // Oculta las tablas pivote Offer* para responder arrays directos al frontend.
  private formatOffer(offer) {
    return {
      ...offer,
      clients: offer.clients.map((offerClient) => offerClient.client),
      products: offer.products.map((offerProduct) => offerProduct.product),
      productTypes: offer.productTypes.map(
        (offerProductType) => offerProductType.productType,
      ),
      tags: offer.tags.map((offerTag) => offerTag.tag),
    };
  }

  private offerAppliesToItem(
    offer,
    clientId: number,
    productId: number,
    productTypeId: number,
    tagIds: number[],
  ) {
    // Sin targets significa oferta general; con targets basta coincidir con uno.
    const hasTargets =
      offer.clients.length > 0 ||
      offer.products.length > 0 ||
      offer.productTypes.length > 0 ||
      offer.tags.length > 0;

    if (!hasTargets) return true;

    return (
      offer.clients.some((offerClient) => offerClient.clientId === clientId) ||
      offer.products.some(
        (offerProduct) => offerProduct.productId === productId,
      ) ||
      offer.productTypes.some(
        (offerProductType) => offerProductType.productTypeId === productTypeId,
      ) ||
      offer.tags.some((offerTag) => tagIds.includes(offerTag.tagId))
    );
  }

  private buildOfferClients(ids?: number[]) {
    if (!ids) return undefined;

    return { createMany: { data: ids.map((clientId) => ({ clientId })) } };
  }

  private buildOfferProducts(ids?: number[]) {
    if (!ids) return undefined;

    return { createMany: { data: ids.map((productId) => ({ productId })) } };
  }

  private buildOfferProductTypes(ids?: number[]) {
    if (!ids) return undefined;

    return {
      createMany: {
        data: ids.map((productTypeId) => ({ productTypeId })),
      },
    };
  }

  private buildOfferTags(ids?: number[]) {
    if (!ids) return undefined;

    return { createMany: { data: ids.map((tagId) => ({ tagId })) } };
  }

  private validateDiscount(discountType: DiscountType, discountValue: number) {
    if (discountValue <= 0) {
      throw new BadRequestException(
        'El valor del descuento debe ser mayor que 0',
      );
    }

    if (discountType === DiscountType.PORCENTAJE && discountValue > 100) {
      throw new BadRequestException(
        'El descuento porcentual debe ser menor o igual a 100',
      );
    }
  }

  private validateDates(startsAt?: Date, endsAt?: Date) {
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha final debe ser mayor que la fecha inicial',
      );
    }
  }

  private async ensureRelatedIdsExist(ids: {
    clientIds?: number[];
    productIds?: number[];
    productTypeIds?: number[];
    tagIds?: number[];
  }) {
    await Promise.all([
      this.ensureActiveCount('client', ids.clientIds, 'clientes'),
      this.ensureActiveCount('product', ids.productIds, 'productos'),
      this.ensureActiveCount(
        'productType',
        ids.productTypeIds,
        'tipos de producto',
      ),
      this.ensureActiveCount('tag', ids.tagIds, 'etiquetas'),
    ]);
  }

  private async ensureActiveCount(
    model: 'client' | 'product' | 'productType' | 'tag',
    ids: number[] | undefined,
    label: string,
  ) {
    if (!ids) return;

    const where = { id: { in: ids }, isActive: true };
    let count = 0;

    if (model === 'client') {
      count = await this.prisma.client.count({ where });
    }

    if (model === 'product') {
      count = await this.prisma.product.count({ where });
    }

    if (model === 'productType') {
      count = await this.prisma.productType.count({ where });
    }

    if (model === 'tag') {
      count = await this.prisma.tag.count({ where });
    }

    if (count !== ids.length) {
      throw new BadRequestException(
        `Uno o más ${label} no existen o están inactivos`,
      );
    }
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) return undefined;
    if (status === RecordStatusQuery.INACTIVOS) return { isActive: false };
    return { isActive: true };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
