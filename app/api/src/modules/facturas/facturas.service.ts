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
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProductResolverService } from '../../shared/products/product-resolver.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { resolveOfferPricing } from '../ofertas/offer-pricing.util';

type ResolvedInvoiceProduct = Product & {
  prices: ProductPrice[];
  costs: ProductCost[];
  tags: Array<{ tagId: number }>;
  packagingProfile?: {
    unitsPerPackage: number | null;
    packagesPerBox: number | null;
  } | null;
};

export type InvoiceDeliveryInput = {
  address: string;
  recipientName: string;
  recipientPhone: string;
  notes?: string;
};

@Injectable()
export class FacturasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
    private readonly productResolver: ProductResolverService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: ListInvoicesQueryDto) {
    const where = {
      ...this.getStatusWhere(query.status),
      ...(query.source ? { source: query.source } : {}),
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

  async create(
    createInvoiceDto: CreateInvoiceDto,
    authUser: AuthUser,
    delivery?: InvoiceDeliveryInput,
  ) {
    const invoice = await this.prisma.$transaction(async (tx) => {
      const client = createInvoiceDto.clientId
        ? await tx.client.findUnique({
            where: { id: createInvoiceDto.clientId },
          })
        : await this.ensureWalkInClient(tx);

      if (createInvoiceDto.clientId && !client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (client && !client.isActive) {
        throw new BadRequestException(
          'No se puede facturar a un cliente inactivo',
        );
      }

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (createInvoiceDto.warehouseId) {
        const warehouse = await tx.warehouse.findUnique({
          where: { id: createInvoiceDto.warehouseId },
        });

        if (!warehouse || !warehouse.isActive) {
          throw new BadRequestException(
            'La bodega seleccionada no existe o está inactiva',
          );
        }
      }

      const resolvedItems: Array<{
        productId: number;
        productPriceId?: number;
        quantity: number;
        warehouseId?: number;
        unitPrice?: number;
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
          tags: { select: { tagId: true } },
          packagingProfile: true,
        })) as ResolvedInvoiceProduct;

        resolvedItems.push({
          productId: product.id,
          productPriceId: item.productPriceId,
          quantity: item.quantity,
          warehouseId: item.warehouseId ?? createInvoiceDto.warehouseId,
          unitPrice: item.unitPrice,
          product,
        });
      }

      if (authUser.role === PrismaRole.BODEGA) {
        const invalidWarehouse = resolvedItems.some(
          (item) =>
            (item.warehouseId ?? createInvoiceDto.warehouseId) !==
            authUser.warehouseId,
        );
        if (invalidWarehouse || !authUser.warehouseId) {
          throw new BadRequestException(
            'El usuario de bodega solo puede facturar desde su bodega asignada',
          );
        }
      }

      const groupedItems = this.groupItems(resolvedItems);

      const now = new Date();
      const activeOffers = await tx.offer.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            {
              OR: [
                { clients: { some: { clientId: client.id } } },
                {
                  products: {
                    some: {
                      productId: {
                        in: groupedItems.map((item) => item.productId),
                      },
                    },
                  },
                },
                {
                  productTypes: {
                    some: {
                      productTypeId: {
                        in: groupedItems.map(
                          (item) => item.product.productTypeId,
                        ),
                      },
                    },
                  },
                },
                {
                  tags: {
                    some: {
                      tagId: {
                        in: groupedItems.flatMap((item) =>
                          item.product.tags.map((tag) => tag.tagId),
                        ),
                      },
                    },
                  },
                },
                {
                  clients: { none: {} },
                  products: { none: {} },
                  productTypes: { none: {} },
                  tags: { none: {} },
                },
              ],
            },
          ],
        },
        include: {
          clients: true,
          products: true,
          productTypes: true,
          tags: true,
        },
      });

      const grossInvoiceItems = groupedItems.map((item) => {
        const product = item.product;

        if (!product.isActive) {
          throw new BadRequestException(
            `El producto ${product.id} está inactivo`,
          );
        }

        const productPrice = this.findSaleablePrice(
          product,
          item.productPriceId,
        );

        if (!productPrice) {
          throw new BadRequestException(
            item.productPriceId
              ? `El precio ${item.productPriceId} no existe, está inactivo o no pertenece al producto ${product.id}`
              : `El producto ${product.id} no tiene precio default activo`,
          );
        }

        const catalogUnitPrice = Number(productPrice.price);
        const offerPricing =
          item.unitPrice === undefined
            ? resolveOfferPricing(catalogUnitPrice, activeOffers, {
                clientId: client.id,
                productId: product.id,
                productTypeId: product.productTypeId,
                tagIds: product.tags.map((tag) => tag.tagId),
                quantity: item.quantity,
              })
            : {
                discountAmount: 0,
                effectiveUnitPrice: item.unitPrice,
              };
        const unitPrice = Number(
          offerPricing.effectiveUnitPrice ?? catalogUnitPrice,
        );
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new BadRequestException(
            `El precio acordado para ${product.name} no es vÃ¡lido`,
          );
        }
        const taxRate = Number(product.taxRate);
        const grossSubtotal = this.roundMoney(catalogUnitPrice * item.quantity);
        const netSubtotal = this.roundMoney(unitPrice * item.quantity);
        const currentCost = product.costs[0];
        let unitCost: number | null = null;

        if (currentCost && Number(currentCost.quantity) > 0) {
          const quantityInCostUnit = this.convertPriceQuantity(
            Number(productPrice.quantity),
            productPrice.unit,
            product,
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
          product,
          productPriceId: productPrice.id,
          quantity: item.quantity,
          warehouseId: item.warehouseId,
          unitPrice,
          taxRate,
          grossSubtotal,
          netSubtotal,
          offerDiscountAmount: this.roundMoney(grossSubtotal - netSubtotal),
          unitCost,
        };
      });

      if (
        (createInvoiceDto.source ?? InvoiceSource.ADMIN) ===
        InvoiceSource.APP_MOVIL
      ) {
        await this.assignStoreWarehouses(tx, grossInvoiceItems);
      }

      const referralDiscount = this.roundMoney(
        createInvoiceDto.referralDiscount ?? 0,
      );

      const subtotalBeforeReferral = this.roundMoney(
        grossInvoiceItems.reduce((sum, item) => sum + item.netSubtotal, 0),
      );

      if (referralDiscount > subtotalBeforeReferral) {
        throw new BadRequestException(
          'El descuento de referidos no puede superar el subtotal de la factura',
        );
      }

      const referralDiscountAmounts = this.allocateDiscount(
        referralDiscount,
        grossInvoiceItems.map((item) => item.netSubtotal),
      );
      const invoiceItems = grossInvoiceItems.map((item, index) => {
        const {
          product: _product,
          offerDiscountAmount,
          netSubtotal: _netSubtotal,
          ...invoiceItem
        } = item;
        const discountAmount = this.roundMoney(
          offerDiscountAmount + referralDiscountAmounts[index],
        );
        const subtotal = this.roundMoney(
          item.netSubtotal - referralDiscountAmounts[index],
        );
        const taxAmount = this.roundMoney(subtotal * (item.taxRate / 100));
        const total = this.roundMoney(subtotal + taxAmount);
        const profitAmount =
          item.unitCost === null
            ? 0
            : this.roundMoney(subtotal - item.unitCost * item.quantity);

        return {
          ...invoiceItem,
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
      const offerDiscountTotal = this.roundMoney(
        grossInvoiceItems.reduce(
          (sum, item) => sum + item.offerDiscountAmount,
          0,
        ),
      );
      await this.decrementInvoiceStock(tx, grossInvoiceItems);
      const availableBenefits =
        referralDiscount && createInvoiceDto.clientId
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
          validationStatus:
            authUser.role === PrismaRole.VENDEDOR ? 'PENDIENTE' : 'VALIDADA',
          clientId: client.id,
          warehouseId: this.resolveInvoiceWarehouseId(grossInvoiceItems),
          createdByUserId: creatorId,
          createdByRole: creatorRole,
          createdByUsername: creatorUsername,
          source: createInvoiceDto.source ?? InvoiceSource.ADMIN,
          saleMode: createInvoiceDto.saleMode ?? 'CONTADO',
          zone: createInvoiceDto.zone?.trim() || null,
          city: createInvoiceDto.city?.trim() || null,
          station: createInvoiceDto.station?.trim() || null,
          subtotal,
          taxes,
          total,
          discountTotal: this.roundMoney(offerDiscountTotal + referralDiscount),
          referralDiscount,
          items: { create: invoiceItems },
          ...(delivery
            ? {
                delivery: {
                  create: {
                    address: delivery.address,
                    recipientName: delivery.recipientName,
                    recipientPhone: delivery.recipientPhone,
                    notes: delivery.notes,
                  },
                },
              }
            : {}),
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

      return invoice;
    });

    await this.auditLogService.log({
      actor: authUser,
      module: 'FACTURAS',
      action: 'CREATE',
      entityType: 'Invoice',
      entityId: invoice.id,
      entityLabel: invoice.consecutive,
      description: `Creo la factura ${invoice.consecutive}`,
      metadata: {
        source: invoice.source,
        warehouseId: invoice.warehouseId,
        total: Number(invoice.total),
      },
    });
    return invoice;
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

  async validateInvoice(id: number, actor: AuthUser) {
    this.ensurePositiveId(id);
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status === InvoiceStatus.ANULADA) {
      throw new BadRequestException('No se puede validar una factura anulada');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: {
        validationStatus: 'VALIDADA',
        validatedAt: new Date(),
        validatedByUserId: actor.sub,
      },
      include: this.invoiceInclude,
    });
  }

  async remove(id: number, actor?: AuthUser) {
    this.ensurePositiveId(id);

    // Anular conserva la factura para trazabilidad y devuelve al inventario lo descontado.
    const annulled = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
      });

      if (!invoice) {
        throw new NotFoundException('Factura no encontrada');
      }

      if (invoice.status === 'ANULADA') {
        throw new BadRequestException('La factura ya está anulada');
      }

      const invoiceItems = await tx.invoiceItem.findMany({
        where: { invoiceId: id },
        select: {
          productId: true,
          warehouseId: true,
          quantity: true,
          productPrice: { select: { quantity: true, unit: true } },
          product: {
            select: {
              unit: true,
              packagingProfile: {
                select: { unitsPerPackage: true, packagesPerBox: true },
              },
            },
          },
        },
      });

      for (const item of invoiceItems) {
        if (!item.warehouseId || !item.productPrice) continue;
        const stockUnits = this.convertPriceQuantity(
          item.quantity * Number(item.productPrice.quantity),
          item.productPrice.unit,
          item.product,
          item.product.unit,
        );
        if (stockUnits === null || !Number.isInteger(stockUnits)) continue;
        await tx.productWarehouse.updateMany({
          where: { productId: item.productId, warehouseId: item.warehouseId },
          data: { quantity: { increment: stockUnits } },
        });
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

    await this.auditLogService.log({
      actor,
      module: 'FACTURAS',
      action: 'ANULATE',
      entityType: 'Invoice',
      entityId: annulled.id,
      entityLabel: annulled.consecutive,
      description: `Anulo la factura ${annulled.consecutive}`,
    });
    return annulled;
  }

  private readonly invoiceInclude = {
    client: true,
    warehouse: true,
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
        warehouse: true,
      },
    },
    generatedReferralBenefits: true,
    delivery: true,
    benefitRedemptions: {
      include: { benefit: true },
      orderBy: { id: 'asc' },
    },
  } as const;

  private async assignStoreWarehouses(
    tx: Prisma.TransactionClient,
    items: Array<{
      productId: number;
      productPriceId: number;
      quantity: number;
      warehouseId?: number;
      product: ResolvedInvoiceProduct;
    }>,
  ) {
    const reservedByWarehouse = new Map<string, number>();

    for (const item of items) {
      if (item.warehouseId) {
        continue;
      }

      const price = item.product.prices.find(
        (candidate) => candidate.id === item.productPriceId,
      );

      if (!price) {
        throw new BadRequestException(
          `El precio del producto ${item.product.name} no está disponible`,
        );
      }

      const stockUnits = this.convertPriceQuantity(
        item.quantity * Number(price.quantity),
        price.unit,
        item.product,
        item.product.unit,
      );

      if (stockUnits === null || !Number.isInteger(stockUnits)) {
        throw new BadRequestException(
          `No se puede convertir el empaque del producto ${item.product.name} a inventario`,
        );
      }

      const warehouses = await tx.productWarehouse.findMany({
        where: {
          productId: item.productId,
          quantity: { gt: 0 },
          warehouse: { isActive: true, deletedAt: null },
        },
        select: { warehouseId: true, quantity: true },
        orderBy: { quantity: 'desc' },
      });

      const selectedWarehouse = warehouses.find((warehouse) => {
        const key = `${item.productId}:${warehouse.warehouseId}`;
        const reserved = reservedByWarehouse.get(key) ?? 0;
        return warehouse.quantity - reserved >= stockUnits;
      });

      if (!selectedWarehouse) {
        throw new BadRequestException(
          `Stock insuficiente de ${item.product.name}`,
        );
      }

      item.warehouseId = selectedWarehouse.warehouseId;
      const key = `${item.productId}:${selectedWarehouse.warehouseId}`;
      reservedByWarehouse.set(
        key,
        (reservedByWarehouse.get(key) ?? 0) + stockUnits,
      );
    }
  }

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

        if (policy.isSocialWork || generation === 4) {
          await tx.referralSocialContribution.create({
            data: {
              buyerClientId,
              originInvoiceId,
              generation,
              baseProfit,
              percentage,
              amount,
            },
          });
          await this.notificacionesService.createSocialWorkNotification(tx, {
            invoiceId: originInvoiceId,
            amount,
          });
        } else {
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
      }

      descendantClientId = beneficiaryClientId;
    }
  }

  private groupItems(
    items: Array<{
      productId: number;
      productPriceId?: number;
      quantity: number;
      warehouseId?: number;
      unitPrice?: number;
      product: ResolvedInvoiceProduct;
    }>,
  ) {
    const groupedItems = new Map<
      string,
      {
        productId: number;
        productPriceId?: number;
        quantity: number;
        warehouseId?: number;
        unitPrice?: number;
        product: ResolvedInvoiceProduct;
      }
    >();

    // Agrupa líneas repetidas solo cuando usan el mismo producto y precio.
    for (const item of items) {
      const key = `${item.productId}:${item.productPriceId ?? 'default'}:${item.warehouseId ?? 'none'}:${item.unitPrice ?? 'catalog'}`;
      const current = groupedItems.get(key);

      groupedItems.set(key, {
        productId: item.productId,
        productPriceId: item.productPriceId,
        quantity: (current?.quantity ?? 0) + item.quantity,
        warehouseId: item.warehouseId,
        unitPrice: item.unitPrice,
        product: item.product,
      });
    }

    return Array.from(groupedItems.values());
  }

  private resolveInvoiceWarehouseId(items: Array<{ warehouseId?: number }>) {
    const ids = [
      ...new Set(items.map((item) => item.warehouseId).filter(Boolean)),
    ];
    return ids.length === 1 ? ids[0] : undefined;
  }

  private async decrementInvoiceStock(
    tx: Prisma.TransactionClient,
    items: Array<{
      productId: number;
      quantity: number;
      warehouseId?: number;
      productPriceId?: number;
      product: ResolvedInvoiceProduct;
    }>,
  ) {
    for (const item of items) {
      if (!item.warehouseId) continue;
      const price = item.product.prices.find(
        (candidate) => candidate.id === item.productPriceId,
      );
      if (!price) continue;
      const stockUnits = this.convertPriceQuantity(
        item.quantity * Number(price.quantity),
        price.unit,
        item.product,
        item.product.unit,
      );
      if (stockUnits === null || !Number.isInteger(stockUnits)) {
        throw new BadRequestException(
          `No se puede convertir el empaque del producto ${item.product.name} a inventario`,
        );
      }
      const updated = await tx.productWarehouse.updateMany({
        where: {
          productId: item.productId,
          warehouseId: item.warehouseId,
          quantity: { gte: stockUnits },
        },
        data: { quantity: { decrement: stockUnits } },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          `Stock insuficiente de ${item.product.name} en la bodega seleccionada`,
        );
      }
    }
  }

  private convertPriceQuantity(
    quantity: number,
    fromUnit: ProductPrice['unit'],
    product: Pick<ResolvedInvoiceProduct, 'unit' | 'packagingProfile'>,
    toUnit: ProductPrice['unit'],
  ) {
    const packaging = product.packagingProfile;
    let productUnits = quantity;
    if (fromUnit === 'PAQUETE') {
      if (!packaging?.unitsPerPackage) return null;
      productUnits *= packaging.unitsPerPackage;
    } else if (fromUnit === 'CAJA') {
      if (!packaging?.unitsPerPackage || !packaging.packagesPerBox) return null;
      productUnits *= packaging.unitsPerPackage * packaging.packagesPerBox;
    }
    if (fromUnit === 'PAQUETE' || fromUnit === 'CAJA') {
      return toUnit === product.unit
        ? productUnits
        : convertQuantity(productUnits, product.unit, toUnit);
    }
    return convertQuantity(quantity, fromUnit, toUnit);
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

  private findSaleablePrice(
    product: ResolvedInvoiceProduct,
    productPriceId?: number,
  ) {
    const now = new Date();
    const isInSaleWindow = (price: ProductPrice) =>
      price.isActive &&
      (!price.startsAt || price.startsAt <= now) &&
      (!price.endsAt || price.endsAt >= now);

    return productPriceId
      ? product.prices.find(
          (price) => price.id === productPriceId && isInSaleWindow(price),
        )
      : product.prices.find(
          (price) => price.isDefault && isInSaleWindow(price),
        );
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
          client: {
            is: { firstName: { contains: q, mode: 'insensitive' as const } },
          },
        },
        {
          client: {
            is: { lastName: { contains: q, mode: 'insensitive' as const } },
          },
        },
        {
          client: {
            is: {
              identification: { contains: q, mode: 'insensitive' as const },
            },
          },
        },
        { createdByUsername: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }

  private async ensureWalkInClient(tx: Prisma.TransactionClient) {
    const identification = 'CONSUMIDOR-FINAL';
    const existing = await tx.client.findUnique({ where: { identification } });

    if (existing) {
      if (!existing.isActive) {
        return tx.client.update({
          where: { id: existing.id },
          data: { isActive: true, deletedAt: null },
        });
      }

      return existing;
    }

    return tx.client.create({
      data: {
        identification,
        firstName: 'Consumidor',
        lastName: 'Final',
        phone: '0000000000',
        address: 'Venta sin cliente asociado',
        clientType: 'MINORISTA',
      },
    });
  }
}
