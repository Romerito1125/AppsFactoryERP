import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceSource,
  Prisma,
  Product,
  ProductCost,
  ProductPrice,
  ReferralBenefitStatus,
  Role as PrismaRole,
} from '@prisma/client';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { convertQuantity } from '../../common/utils/unit-conversion.util';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProductResolverService } from '../../shared/products/product-resolver.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

type ResolvedInvoiceProduct = Product & {
  prices: ProductPrice[];
  costs: ProductCost[];
};

@Injectable()
export class FacturasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
    private readonly productResolver: ProductResolverService,
  ) {}

  async findAll(query: ListInvoicesQueryDto) {
    const where = {
      ...this.getStatusWhere(query.status),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: this.invoiceInclude,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.invoiceInclude,
    });

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    return invoice;
  }

  async create(createInvoiceDto: CreateInvoiceDto, authUser: AuthUser) {
    // La venta no descuenta stock por bodega; el inventario se maneja en /inventario.
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: createInvoiceDto.clientId },
      });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (!client.isActive) {
        throw new BadRequestException(
          'No se puede facturar a un cliente inactivo',
        );
      }

      const resolvedItems: Array<{
        productId: number;
        productPriceId?: number;
        quantity: number;
        product: ResolvedInvoiceProduct;
      }> = [];

      for (const item of createInvoiceDto.items) {
        const product = (await this.productResolver.resolve(item, tx, {
          prices: { where: { isActive: true } },
          costs: {
            where: { isActive: true },
            orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        })) as ResolvedInvoiceProduct;

        resolvedItems.push({
          productId: product.id,
          productPriceId: item.productPriceId,
          quantity: item.quantity,
          product,
        });
      }

      const groupedItems = this.groupItems(resolvedItems);

      const grossInvoiceItems = groupedItems.map((item) => {
        const product = item.product;

        if (!product.isActive) {
          throw new BadRequestException(
            `El producto ${product.id} está inactivo`,
          );
        }

        const productPrice = item.productPriceId
          ? product.prices.find((price) => price.id === item.productPriceId)
          : product.prices.find((price) => price.isDefault);

        if (!productPrice) {
          throw new BadRequestException(
            item.productPriceId
              ? `El precio ${item.productPriceId} no existe, está inactivo o no pertenece al producto ${product.id}`
              : `El producto ${product.id} no tiene precio default activo`,
          );
        }

        const unitPrice = Number(productPrice.price);
        const taxRate = Number(product.taxRate);
        const grossSubtotal = this.roundMoney(unitPrice * item.quantity);
        const currentCost = product.costs[0];
        let unitCost: number | null = null;

        if (currentCost && Number(currentCost.quantity) > 0) {
          const quantityInCostUnit = convertQuantity(
            Number(productPrice.quantity),
            productPrice.unit,
            currentCost.unit,
          );

          if (quantityInCostUnit !== null) {
            unitCost = this.roundMoney(
              (Number(currentCost.cost) / Number(currentCost.quantity)) *
                quantityInCostUnit,
            );
          }
        }

        return {
          productId: product.id,
          productPriceId: productPrice.id,
          quantity: item.quantity,
          unitPrice,
          taxRate,
          grossSubtotal,
          unitCost,
        };
      });

      const grossSubtotal = this.roundMoney(
        grossInvoiceItems.reduce((sum, item) => sum + item.grossSubtotal, 0),
      );
      const referralDiscount = this.roundMoney(
        createInvoiceDto.referralDiscount ?? 0,
      );

      if (referralDiscount > grossSubtotal) {
        throw new BadRequestException(
          'El descuento de referidos no puede superar el subtotal de la factura',
        );
      }

      const discountAmounts = this.allocateDiscount(
        referralDiscount,
        grossInvoiceItems.map((item) => item.grossSubtotal),
      );
      const invoiceItems = grossInvoiceItems.map((item, index) => {
        const discountAmount = discountAmounts[index];
        const subtotal = this.roundMoney(item.grossSubtotal - discountAmount);
        const taxAmount = this.roundMoney(subtotal * (item.taxRate / 100));
        const total = this.roundMoney(subtotal + taxAmount);
        const profitAmount =
          item.unitCost === null
            ? 0
            : this.roundMoney(subtotal - item.unitCost * item.quantity);

        return {
          ...item,
          subtotal,
          taxAmount,
          total,
          discountAmount,
          profitAmount,
        };
      });
      const subtotal = this.roundMoney(
        invoiceItems.reduce((sum, item) => sum + item.subtotal, 0),
      );
      const taxes = this.roundMoney(
        invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0),
      );
      const total = this.roundMoney(
        invoiceItems.reduce((sum, item) => sum + item.total, 0),
      );
      const baseProfit = this.roundMoney(
        Math.max(
          0,
          invoiceItems.reduce((sum, item) => sum + item.profitAmount, 0),
        ),
      );
      const availableBenefits = referralDiscount
        ? await tx.referralBenefit.findMany({
            where: {
              beneficiaryClientId: client.id,
              status: ReferralBenefitStatus.DISPONIBLE,
              remainingAmount: { gt: 0 },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : [];
      const availableDiscount = this.roundMoney(
        availableBenefits.reduce(
          (sum, benefit) => sum + Number(benefit.remainingAmount),
          0,
        ),
      );

      if (referralDiscount > availableDiscount) {
        throw new BadRequestException(
          `Saldo de descuento insuficiente. Disponible: ${availableDiscount.toFixed(2)}`,
        );
      }

      let creatorId = authUser.sub;
      let creatorRole = authUser.role as PrismaRole;
      let creatorUsername = authUser.username;

      if (createInvoiceDto.createdByUserId) {
        const creatorUser = await tx.user.findUnique({
          where: { id: createInvoiceDto.createdByUserId, isActive: true },
        });
        if (creatorUser) {
          creatorId = creatorUser.id;
          creatorRole = creatorUser.role;
          creatorUsername = creatorUser.username;
        }
      }

      const invoice = await tx.invoice.create({
        data: {
          consecutive: this.generateConsecutive(),
          clientId: createInvoiceDto.clientId,
          createdByUserId: creatorId,
          createdByRole: creatorRole,
          createdByUsername: creatorUsername,
          source: createInvoiceDto.source ?? InvoiceSource.ADMIN,
          subtotal,
          taxes,
          total,
          discountTotal: referralDiscount,
          referralDiscount,
          items: { create: invoiceItems },
        },
        include: this.invoiceInclude,
      });

      await this.consumeReferralBenefits(
        tx,
        invoice.id,
        referralDiscount,
        availableBenefits,
      );
      await this.createReferralBenefits(tx, client.id, invoice.id, baseProfit);

      await this.notificacionesService.createInvoiceNotification(tx, invoice);

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: this.invoiceInclude,
      });
    });
  }

  async update(id: number, updateInvoiceDto: UpdateInvoiceDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateInvoiceDto.consecutive) {
      const existingInvoice = await this.prisma.invoice.findUnique({
        where: { consecutive: updateInvoiceDto.consecutive },
      });

      if (existingInvoice && existingInvoice.id !== id) {
        throw new ConflictException('El consecutivo ya existe');
      }
    }

    // Los totales e items no se actualizan aquí para evitar inconsistencias contables.
    return this.prisma.invoice.update({
      where: { id },
      data: updateInvoiceDto,
      include: this.invoiceInclude,
    });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);

    // Anular conserva la factura para trazabilidad; no ajusta inventario por bodega.
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
      });

      if (!invoice) {
        throw new NotFoundException('Factura no encontrada');
      }

      if (invoice.status === 'ANULADA') {
        throw new BadRequestException('La factura ya está anulada');
      }

      await tx.referralBenefit.updateMany({
        where: { originInvoiceId: id },
        data: {
          status: ReferralBenefitStatus.ANULADO,
          remainingAmount: 0,
        },
      });

      const redemptions = await tx.referralBenefitRedemption.findMany({
        where: { invoiceId: id },
      });
      const restoredByBenefit = new Map<number, number>();

      for (const redemption of redemptions) {
        restoredByBenefit.set(
          redemption.benefitId,
          this.roundMoney(
            (restoredByBenefit.get(redemption.benefitId) ?? 0) +
              Number(redemption.amount),
          ),
        );
      }

      for (const [benefitId, amount] of restoredByBenefit) {
        await tx.referralBenefit.updateMany({
          where: {
            id: benefitId,
            status: { not: ReferralBenefitStatus.ANULADO },
          },
          data: {
            remainingAmount: { increment: amount },
            status: ReferralBenefitStatus.DISPONIBLE,
          },
        });
      }

      return tx.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.ANULADA },
        include: this.invoiceInclude,
      });
    });
  }

  private readonly invoiceInclude = {
    client: true,
    createdByUser: {
      select: {
        id: true,
        username: true,
        role: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    },
    items: {
      include: {
        product: { include: { productType: true } },
        productPrice: true,
      },
    },
    generatedReferralBenefits: true,
    benefitRedemptions: {
      include: { benefit: true },
      orderBy: { id: 'asc' },
    },
  } as const;

  private async consumeReferralBenefits(
    tx: Prisma.TransactionClient,
    invoiceId: number,
    requestedAmount: number,
    benefits: Array<{
      id: number;
      remainingAmount: Prisma.Decimal;
    }>,
  ) {
    let pendingAmount = requestedAmount;

    for (const benefit of benefits) {
      if (pendingAmount <= 0) break;

      const currentAmount = Number(benefit.remainingAmount);
      const consumedAmount = this.roundMoney(
        Math.min(pendingAmount, currentAmount),
      );
      const consumesAll = consumedAmount === this.roundMoney(currentAmount);
      const claimed = await tx.referralBenefit.updateMany({
        where: {
          id: benefit.id,
          status: ReferralBenefitStatus.DISPONIBLE,
          remainingAmount: { equals: benefit.remainingAmount },
        },
        data: {
          remainingAmount: { decrement: consumedAmount },
          ...(consumesAll ? { status: ReferralBenefitStatus.USADO } : {}),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          'El saldo de referidos cambió durante la facturación; intente nuevamente',
        );
      }

      await tx.referralBenefitRedemption.create({
        data: {
          benefitId: benefit.id,
          invoiceId,
          amount: consumedAmount,
        },
      });
      pendingAmount = this.roundMoney(pendingAmount - consumedAmount);
    }

    if (pendingAmount > 0) {
      throw new BadRequestException('Saldo de descuento insuficiente');
    }
  }

  private async createReferralBenefits(
    tx: Prisma.TransactionClient,
    buyerClientId: number,
    originInvoiceId: number,
    baseProfit: number,
  ) {
    const policies = await tx.referralProfitPolicy.findMany({
      where: { isActive: true },
      orderBy: { generation: 'asc' },
    });

    if (!policies.length) return;

    const policyByGeneration = new Map(
      policies.map((policy) => [policy.generation, policy]),
    );
    const lastGeneration = policies[policies.length - 1].generation;
    const visited = new Set<number>([buyerClientId]);
    let descendantClientId = buyerClientId;

    for (let generation = 1; generation <= lastGeneration; generation += 1) {
      const referral = await tx.referral.findUnique({
        where: { referredClientId: descendantClientId },
        select: { referrerClientId: true },
      });

      if (!referral || visited.has(referral.referrerClientId)) break;

      const beneficiaryClientId = referral.referrerClientId;
      visited.add(beneficiaryClientId);
      const policy = policyByGeneration.get(generation);

      if (policy) {
        const percentage = Number(policy.percentage);
        const amount = this.roundMoney(baseProfit * (percentage / 100));

        await tx.referralBenefit.create({
          data: {
            beneficiaryClientId,
            buyerClientId,
            originInvoiceId,
            generation,
            baseProfit,
            percentage,
            amount,
            remainingAmount: amount,
          },
        });
      }

      descendantClientId = beneficiaryClientId;
    }
  }

  private groupItems(
    items: Array<{
      productId: number;
      productPriceId?: number;
      quantity: number;
      product: ResolvedInvoiceProduct;
    }>,
  ) {
    const groupedItems = new Map<
      string,
      {
        productId: number;
        productPriceId?: number;
        quantity: number;
        product: ResolvedInvoiceProduct;
      }
    >();

    // Agrupa líneas repetidas solo cuando usan el mismo producto y precio.
    for (const item of items) {
      const key = `${item.productId}:${item.productPriceId ?? 'default'}`;
      const current = groupedItems.get(key);

      groupedItems.set(key, {
        productId: item.productId,
        productPriceId: item.productPriceId,
        quantity: (current?.quantity ?? 0) + item.quantity,
        product: item.product,
      });
    }

    return Array.from(groupedItems.values());
  }

  private allocateDiscount(discount: number, subtotals: number[]) {
    const discountCents = Math.round(discount * 100);
    const subtotalCents = subtotals.map((subtotal) =>
      Math.round(subtotal * 100),
    );
    const totalCents = subtotalCents.reduce(
      (sum, subtotal) => sum + subtotal,
      0,
    );

    if (!discountCents || !totalCents) {
      return subtotals.map(() => 0);
    }

    const allocations = subtotalCents.map((subtotal, index) => {
      const exactShare = (discountCents * subtotal) / totalCents;

      return {
        index,
        cents: Math.floor(exactShare),
        remainder: exactShare - Math.floor(exactShare),
      };
    });
    let unallocated =
      discountCents -
      allocations.reduce((sum, allocation) => sum + allocation.cents, 0);

    allocations
      .slice()
      .sort(
        (left, right) =>
          right.remainder - left.remainder || left.index - right.index,
      )
      .forEach((allocation) => {
        if (unallocated <= 0) return;
        allocations[allocation.index].cents += 1;
        unallocated -= 1;
      });

    return allocations.map((allocation) => allocation.cents / 100);
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private generateConsecutive() {
    return `FAC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }

  private getStatusWhere(status?: ListInvoicesQueryDto['status']) {
    if (!status) return undefined;
    return { status };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { consecutive: { contains: q, mode: 'insensitive' as const } },
        {
          client: { firstName: { contains: q, mode: 'insensitive' as const } },
        },
        { client: { lastName: { contains: q, mode: 'insensitive' as const } } },
        {
          client: {
            identification: { contains: q, mode: 'insensitive' as const },
          },
        },
        { createdByUsername: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }
}
