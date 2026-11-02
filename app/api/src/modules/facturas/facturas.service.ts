import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreditStatus,
  InvoiceSource,
  Prisma,
  Product,
  ProductCost,
  ProductPrice,
  ReferralBenefitStatus,
  Role as PrismaRole,
  SaleMode,
} from '@prisma/client';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { effectivePermissionCodes } from '../../common/permissions/permission.constants';
import {
  calculateLineTotals,
  netFromGross,
  roundMoney,
} from '../../common/utils/commercial-pricing.util';
import { convertProductQuantityToBase } from '../../common/utils/product-quantity.util';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProductResolverService } from '../../shared/products/product-resolver.service';
import { postBankMovement } from '../../common/utils/bank-ledger.util';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoicePaymentDto } from './dto/create-invoice-payment.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { resolveOfferPricing } from '../ofertas/offer-pricing.util';
import { assertClientCreditCapacity } from '../creditos/credit-limit.util';

type ResolvedInvoiceProduct = Product & {
  prices: ProductPrice[];
  costs: ProductCost[];
  tags: Array<{ tagId: number }>;
  packagingProfile?: {
    unitsPerPackage: number | null;
    packagesPerBox: number | null;
  } | null;
};

function hasExplicitUnitPrice(item: {
  unitPrice?: number | null;
  unitPriceGross?: number | null;
}) {
  return (
    (item.unitPrice !== undefined && item.unitPrice !== null) ||
    (item.unitPriceGross !== undefined && item.unitPriceGross !== null)
  );
}

export type InvoiceDeliveryInput = {
  address: string;
  recipientName: string;
  recipientPhone: string;
  notes?: string;
  deliveryFee?: number;
};

@Injectable()
export class FacturasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
    private readonly productResolver: ProductResolverService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: ListInvoicesQueryDto, authUser?: AuthUser) {
    const warehouseId = this.resolveActorWarehouse(authUser);
    const where: Prisma.InvoiceWhereInput = {
      AND: [
        this.getStatusWhere(query.status),
        query.source ? { source: query.source } : undefined,
        this.getSearchWhere(query.q),
        warehouseId
          ? {
              OR: [
                { warehouseId },
                { items: { some: { warehouseId } } },
              ],
            }
          : undefined,
      ].filter(Boolean) as Prisma.InvoiceWhereInput[],
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

  async findOne(id: number, authUser?: AuthUser) {
    this.ensurePositiveId(id);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.invoiceInclude,
    });

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    const warehouseId = this.resolveActorWarehouse(authUser);
    if (
      warehouseId &&
      invoice.warehouseId !== warehouseId &&
      !invoice.items.some((item) => item.warehouseId === warehouseId)
    ) {
      throw new NotFoundException('Factura no encontrada');
    }

    return invoice;
  }

  async create(
    createInvoiceDto: CreateInvoiceDto,
    authUser: AuthUser,
    delivery?: InvoiceDeliveryInput,
  ) {
    const hasPriceOverride = createInvoiceDto.items.some(hasExplicitUnitPrice);
    if (hasPriceOverride) {
      await this.ensurePriceOverrideAllowed(authUser);
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const source = createInvoiceDto.source ?? InvoiceSource.ADMIN;
      const saleMode = createInvoiceDto.saleMode ?? SaleMode.CONTADO;
      const creditDueDate =
        saleMode === SaleMode.CREDITO && createInvoiceDto.creditDueDate
          ? new Date(createInvoiceDto.creditDueDate)
          : null;
      if (saleMode === SaleMode.CREDITO && !creditDueDate) {
        throw new BadRequestException(
          'Selecciona la fecha de vencimiento del crédito',
        );
      }
      if (creditDueDate && Number.isNaN(creditDueDate.getTime())) {
        throw new BadRequestException(
          'La fecha de vencimiento del crédito no es válida',
        );
      }
      const actorWarehouseId = this.resolveActorWarehouse(authUser);
      const requestedWarehouseId =
        createInvoiceDto.warehouseId ?? actorWarehouseId;
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

      const effectivePriceLevel =
        createInvoiceDto.priceLevel ?? client.priceLevel ?? 0;

      if (
        createInvoiceDto.warehouseId &&
        actorWarehouseId !== undefined &&
        createInvoiceDto.warehouseId !== actorWarehouseId
      ) {
        throw new BadRequestException(
          'El usuario operativo solo puede facturar desde su bodega asignada',
        );
      }

      if (requestedWarehouseId) {
        const warehouse = await tx.warehouse.findUnique({
          where: { id: requestedWarehouseId },
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
        priceLevel?: number;
        quantity: number;
        warehouseId?: number;
        unitPrice?: number;
        unitPriceGross?: number;
        product: ResolvedInvoiceProduct;
      }> = [];

      for (const item of createInvoiceDto.items) {
        if (
          item.unitPrice !== undefined &&
          item.unitPrice !== null &&
          item.unitPriceGross !== undefined &&
          item.unitPriceGross !== null
        ) {
          throw new BadRequestException(
            'Cada línea puede recibir unitPrice o unitPriceGross, pero no ambos',
          );
        }
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
          priceLevel: effectivePriceLevel,
          quantity: item.quantity,
          warehouseId: item.warehouseId ?? requestedWarehouseId,
          unitPrice: item.unitPrice,
          unitPriceGross: item.unitPriceGross,
          product,
        });
      }

      if (authUser.role === PrismaRole.BODEGA) {
        const invalidWarehouse = resolvedItems.some(
          (item) =>
            (item.warehouseId ?? requestedWarehouseId) !== authUser.warehouseId,
        );
        if (invalidWarehouse || !authUser.warehouseId) {
          throw new BadRequestException(
            'El usuario de bodega solo puede facturar desde su bodega asignada',
          );
        }
      }

      if (source !== InvoiceSource.APP_MOVIL) {
        const missingWarehouse = resolvedItems.some(
          (item) => !item.warehouseId && !requestedWarehouseId,
        );
        if (missingWarehouse) {
          throw new BadRequestException(
            'Selecciona la bodega desde la que se realizará la venta',
          );
        }
      }

      for (const item of resolvedItems) {
        item.warehouseId ??= requestedWarehouseId;
        if (!item.warehouseId) continue;

        const warehouse = await tx.warehouse.findUnique({
          where: { id: item.warehouseId },
          select: { id: true, isActive: true },
        });
        if (!warehouse || !warehouse.isActive) {
          throw new BadRequestException(
            'La bodega seleccionada no existe o está inactiva',
          );
        }
        // La bodega por línea (#45/#46) permite surtir desde otra bodega: el encabezado sigue
        // atado a la bodega del usuario y el stock se valida y descuenta en la bodega de la línea.
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
          client.clientType,
          item.priceLevel,
        );

        if (!productPrice) {
          throw new BadRequestException(
            item.productPriceId
              ? `El precio ${item.productPriceId} no existe, está inactivo o no pertenece al producto ${product.id}`
              : `El producto ${product.id} no tiene precio default activo`,
          );
        }

        const catalogUnitPrice = Number(productPrice.price);
        const taxRate = Number(product.taxRate);
        const hasManualPrice = hasExplicitUnitPrice(item);
        const offerPricing =
          !hasManualPrice
            ? resolveOfferPricing(catalogUnitPrice, activeOffers, {
                clientId: client.id,
                productId: product.id,
                productTypeId: product.productTypeId,
                tagIds: product.tags.map((tag) => tag.tagId),
                quantity: item.quantity,
              })
            : {
                discountAmount: 0,
                effectiveUnitPrice:
                  item.unitPriceGross !== undefined && item.unitPriceGross !== null
                    ? netFromGross(item.unitPriceGross, taxRate)
                    : item.unitPrice,
              };
        const unitPrice = Number(
          offerPricing.effectiveUnitPrice ?? catalogUnitPrice,
        );
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new BadRequestException(
            `El precio acordado para ${product.name} no es vÃ¡lido`,
          );
        }
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
          offerDiscountAmount: hasManualPrice
            ? 0
            : this.roundMoney(grossSubtotal - netSubtotal),
          unitCost,
        };
      });

      if (
        source === InvoiceSource.APP_MOVIL
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
        const lineTotals = calculateLineTotals({
          netSubtotal: subtotal,
          taxRate: item.taxRate,
        });
        const profitAmount =
          item.unitCost === null
            ? 0
            : this.roundMoney(subtotal - item.unitCost * item.quantity);

        return {
          ...invoiceItem,
          subtotal: lineTotals.subtotal,
          taxAmount: lineTotals.taxAmount,
          total: lineTotals.total,
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
      // Lo pagado en el momento (cuentas, efectivo, saldo a favor, bonus) no es deuda:
      // solo el resto queda a crédito.
      const upfrontPaid = this.roundMoney(
        (createInvoiceDto.payments ?? []).reduce(
          (sum, payment) => sum + Number(payment.amount),
          0,
        ),
      );
      const creditAmount = this.roundMoney(total - upfrontPaid);
      if (saleMode === SaleMode.CREDITO) {
        if (creditAmount <= 0) {
          throw new BadRequestException(
            'Los pagos cubren todo el total: registra la venta de contado',
          );
        }
        await assertClientCreditCapacity(tx, client.id, creditAmount);
      }
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

      // Cajero = quien registra y cobra (usuario autenticado). Vendedor = quien vendió: se
      // elige aparte (sellerUserId; createdByUserId se acepta por compatibilidad con la app móvil).
      const creatorId = authUser.sub;
      const creatorRole = authUser.role as PrismaRole;
      const creatorUsername = authUser.username;
      let sellerUserId: number | null = authUser.sub;
      let sellerUsername: string | null = authUser.username;
      const requestedSellerId =
        createInvoiceDto.sellerUserId ?? createInvoiceDto.createdByUserId;
      if (requestedSellerId && requestedSellerId !== authUser.sub) {
        const sellerUser = await tx.user.findUnique({
          where: { id: requestedSellerId, isActive: true },
        });
        if (sellerUser) {
          sellerUserId = sellerUser.id;
          sellerUsername = sellerUser.username;
        }
      }

      // Una preventa/cotización solo se convierte en factura una vez.
      if (createInvoiceDto.quoteId) {
        const quote = await tx.quote.findUnique({ where: { id: createInvoiceDto.quoteId } });
        if (!quote) throw new NotFoundException('La preventa o cotización no existe');
        if (quote.status === 'CONVERTIDA') {
          throw new BadRequestException('La preventa o cotización ya fue convertida en factura');
        }
        if (quote.clientId !== client.id) {
          throw new BadRequestException('La factura debe ser del mismo cliente de la preventa');
        }
      }

      const invoice = await tx.invoice.create({
        data: {
          consecutive: this.generateConsecutive(),
          quoteId: createInvoiceDto.quoteId,
          validationStatus:
            authUser.role === PrismaRole.VENDEDOR ? 'PENDIENTE' : 'VALIDADA',
          clientId: client.id,
          warehouseId: this.resolveInvoiceWarehouseId(grossInvoiceItems),
          createdByUserId: creatorId,
          createdByRole: creatorRole,
          createdByUsername: creatorUsername,
          sellerUserId,
          sellerUsername,
          source,
          saleMode,
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
                    deliveryFee: delivery.deliveryFee ?? 0,
                  },
                },
              }
            : {}),
        },
        include: this.invoiceInclude,
      });

      if (saleMode === SaleMode.CREDITO && creditDueDate) {
        await tx.invoiceCredit.create({
          data: {
            invoiceId: invoice.id,
            clientId: client.id,
            dueDate: creditDueDate,
            totalAmount: creditAmount,
            paidAmount: 0,
            balance: creditAmount,
            status: CreditStatus.PENDIENTE,
          },
        });
      }

      if (createInvoiceDto.quoteId) {
        await tx.quote.update({
          where: { id: createInvoiceDto.quoteId },
          data: { status: 'CONVERTIDA' },
        });
      }

      if (createInvoiceDto.paymentSupportData || createInvoiceDto.paymentNotes?.trim()) {
        await tx.invoicePaymentSupport.create({
          data: {
            invoiceId: invoice.id,
            notes: createInvoiceDto.paymentNotes?.trim() || undefined,
            supportName: createInvoiceDto.paymentSupportData
              ? (createInvoiceDto.paymentSupportName ?? 'soporte')
              : undefined,
            supportMimeType: createInvoiceDto.paymentSupportMimeType,
            supportData: createInvoiceDto.paymentSupportData,
          },
        });
      }

      if (createInvoiceDto.payments?.length) {
        await this.registerInvoicePayments(
          tx,
          invoice,
          saleMode,
          createInvoiceDto.payments,
        );
      }

      await this.consumeReferralBenefits(
        tx,
        invoice.id,
        referralDiscount,
        availableBenefits,
      );
      await this.createReferralBenefits(tx, client.id, invoice.id, baseProfit);

      await this.notificacionesService.createInvoiceNotification(tx, invoice);

      return invoice;
    }, { timeout: 15000 });

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
        priceOverrides: createInvoiceDto.items.filter(hasExplicitUnitPrice).length,
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

  async paymentSupport(invoiceId: number) {
    const support = await this.prisma.invoicePaymentSupport.findUnique({
      where: { invoiceId },
    });
    if (!support?.supportData) {
      throw new NotFoundException('La factura no tiene soporte de pago');
    }
    return support;
  }

  /** Saldo de bonus / miembro fiel disponible para pagar una venta. */
  async bonusBalance(clientId: number) {
    const benefits = await this.prisma.referralBenefit.findMany({
      where: {
        beneficiaryClientId: clientId,
        status: ReferralBenefitStatus.DISPONIBLE,
        remainingAmount: { gt: 0 },
      },
      select: { remainingAmount: true },
    });
    return {
      available: this.roundMoney(
        benefits.reduce((sum, benefit) => sum + Number(benefit.remainingAmount), 0),
      ),
    };
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

      // Lo ya devuelto por devoluciones parciales no se repone otra vez al anular.
      const returnedRows = await tx.saleReturnItem.groupBy({
        by: ['invoiceItemId'],
        where: { saleReturn: { invoiceId: id } },
        _sum: { quantity: true },
      });
      const returnedByItem = new Map(
        returnedRows.map((row) => [
          row.invoiceItemId,
          Number(row._sum.quantity ?? 0),
        ]),
      );
      const invoiceItems = await tx.invoiceItem.findMany({
        where: { invoiceId: id },
        select: {
          id: true,
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
        const pendingQuantity = Math.max(
          0,
          Number(item.quantity) - (returnedByItem.get(item.id) ?? 0),
        );
        if (pendingQuantity <= 0) continue;
        const stockUnits = this.convertPriceQuantity(
          pendingQuantity * Number(item.productPrice.quantity),
          item.productPrice.unit,
          item.product,
          item.product.unit,
        );
        if (stockUnits === null || !Number.isFinite(stockUnits) || stockUnits <= 0) continue;
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
    // Medios de pago y crédito: el ticket los muestra al imprimir y reimprimir.
    bankMovement: {
      select: {
        amount: true,
        description: true,
        bankAccount: { select: { name: true } },
      },
    },
    credit: { select: { totalAmount: true, dueDate: true } },
    benefitRedemptions: {
      include: { benefit: true },
      orderBy: { id: 'asc' },
    },
  } as const;

  /**
   * Pagos mixtos de una venta de contado. Corre dentro de la misma transacción
   * que la factura: si un pago falla (saldo, cuenta inactiva, suma distinta),
   * no queda ni factura ni movimiento bancario.
   */
  private async registerInvoicePayments(
    tx: Prisma.TransactionClient,
    invoice: { id: number; clientId: number; consecutive: string; total: Prisma.Decimal },
    saleMode: SaleMode,
    payments: CreateInvoicePaymentDto[],
  ) {
    const total = this.roundMoney(Number(invoice.total));
    const paid = this.roundMoney(
      payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    );
    // Contado: los pagos cubren todo. Crédito: lo pagado es un abono inicial y el
    // resto queda como deuda (la validación del cupo ya se hizo sobre ese resto).
    if (saleMode === SaleMode.CONTADO && Math.abs(paid - total) > 0.009) {
      throw new BadRequestException(
        `La suma de los pagos (${paid.toFixed(2)}) debe ser igual al total de la factura (${total.toFixed(2)})`,
      );
    }
    if (paid > total + 0.009) {
      throw new BadRequestException('Los pagos superan el total de la factura');
    }
    for (const payment of payments) {
      const hasAccount = Boolean(payment.bankAccountId);
      const hasAdvance = Boolean(payment.advanceId);
      const hasBonus = Boolean(payment.bonus);
      if (Number(hasAccount) + Number(hasAdvance) + Number(hasBonus) !== 1) {
        throw new BadRequestException(
          'Cada pago debe indicar una sola fuente: cuenta, saldo a favor o bonus',
        );
      }
      if (hasBonus) {
        const benefits = await tx.referralBenefit.findMany({
          where: {
            beneficiaryClientId: invoice.clientId,
            status: ReferralBenefitStatus.DISPONIBLE,
            remainingAmount: { gt: 0 },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        await this.consumeReferralBenefits(
          tx,
          invoice.id,
          this.roundMoney(Number(payment.amount)),
          benefits,
        );
        continue;
      }
      const note = payment.reference?.trim();
      if (hasAccount) {
        await postBankMovement(tx, {
          bankAccountId: payment.bankAccountId!,
          type: 'INGRESO',
          amount: Number(payment.amount),
          invoiceId: invoice.id,
          description: `Recaudo venta ${invoice.consecutive}${note ? ` · ${note}` : ''}`,
        });
        continue;
      }
      const advance = await tx.clientAdvance.findUnique({
        where: { id: payment.advanceId! },
      });
      if (!advance || advance.clientId !== invoice.clientId) {
        throw new BadRequestException(
          'El anticipo no existe o pertenece a otro cliente',
        );
      }
      const balance = Number(advance.balance);
      if (advance.status !== 'DISPONIBLE' || Number(payment.amount) > balance + 0.009) {
        throw new BadRequestException(
          `El anticipo ${advance.consecutive} no tiene saldo suficiente (disponible ${balance.toFixed(2)})`,
        );
      }
      const nextBalance = this.roundMoney(balance - Number(payment.amount));
      await tx.clientAdvance.update({
        where: { id: advance.id },
        data: {
          balance: nextBalance,
          appliedAmount: { increment: Number(payment.amount) },
          status: nextBalance <= 0.009 ? 'APLICADO' : 'DISPONIBLE',
        },
      });
    }
  }

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

      if (stockUnits === null || !Number.isFinite(stockUnits) || stockUnits <= 0) {
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
        return Number(warehouse.quantity) - reserved >= stockUnits;
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
      priceLevel?: number;
      quantity: number;
      warehouseId?: number;
      unitPrice?: number;
      unitPriceGross?: number;
      product: ResolvedInvoiceProduct;
    }>,
  ) {
    const groupedItems = new Map<
      string,
      {
        productId: number;
        productPriceId?: number;
        priceLevel?: number;
        quantity: number;
        warehouseId?: number;
        unitPrice?: number;
        unitPriceGross?: number;
        product: ResolvedInvoiceProduct;
      }
    >();

    // Agrupa líneas repetidas solo cuando usan el mismo producto y precio.
    for (const item of items) {
      const key = `${item.productId}:${item.priceLevel ?? item.productPriceId ?? 'default'}:${item.warehouseId ?? 'none'}:${item.unitPriceGross ?? item.unitPrice ?? 'catalog'}`;
      const current = groupedItems.get(key);

      groupedItems.set(key, {
        productId: item.productId,
        productPriceId: item.productPriceId,
        priceLevel: item.priceLevel,
        quantity: (current?.quantity ?? 0) + item.quantity,
        warehouseId: item.warehouseId,
        unitPrice: item.unitPrice,
        unitPriceGross: item.unitPriceGross,
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
      if (stockUnits === null || !Number.isFinite(stockUnits) || stockUnits <= 0) {
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
    _toUnit: ProductPrice['unit'],
  ) {
    return convertProductQuantityToBase(
      quantity,
      fromUnit,
      product.unit,
      product.packagingProfile,
    );
  }

  private resolveActorWarehouse(authUser?: AuthUser) {
    if (!authUser || this.hasGlobalWarehouseAccess(authUser)) return undefined;
    return authUser.warehouseId ?? undefined;
  }

  private hasGlobalWarehouseAccess(authUser: AuthUser) {
    return authUser.role === PrismaRole.ADMIN || authUser.role === PrismaRole.CONTADOR;
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
    return roundMoney(value);
  }

  private async ensurePriceOverrideAllowed(authUser: AuthUser) {
    if (authUser.role === PrismaRole.ADMIN) return;

    const overrides = await this.prisma.userPermission.findMany({
      where: { userId: authUser.sub },
      select: { code: true, isAllowed: true },
    });
    const allowed = new Set(
      effectivePermissionCodes(authUser.role, overrides),
    );
    if (!allowed.has('SALES_PRICE_OVERRIDE')) {
      throw new ForbiddenException(
        'No tienes permiso para editar el precio unitario de una venta',
      );
    }
  }

  private generateConsecutive() {
    return `FAC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private findSaleablePrice(
    product: ResolvedInvoiceProduct,
    productPriceId?: number,
    clientType?: 'MAYORISTA' | 'MINORISTA',
    priceLevel?: number,
  ) {
    const now = new Date();
    const isInSaleWindow = (price: ProductPrice) =>
      price.isActive &&
      (!price.startsAt || price.startsAt <= now) &&
      (!price.endsAt || price.endsAt >= now);

    if (priceLevel !== undefined) {
      return (
        product.prices.find(
          (price) =>
            this.getPriceLevel(price) === priceLevel && isInSaleWindow(price),
        ) ?? product.prices.find((price) => price.isDefault && isInSaleWindow(price))
      );
    }

    if (productPriceId) {
      return product.prices.find(
        (price) => price.id === productPriceId && isInSaleWindow(price),
      );
    }

    const clientPrice = clientType
      ? product.prices.find((price) => {
          if (!isInSaleWindow(price)) return false;
          const name = price.name.toLowerCase();
          return clientType === 'MAYORISTA'
            ? /mayor|mayoreo|wholesale/.test(name)
            : /minorista|detal|retail/.test(name);
        })
      : undefined;

    return (
      clientPrice ?? product.prices.find((price) => price.isDefault && isInSaleWindow(price))
    );
  }

  private getPriceLevel(price: ProductPrice) {
    if (price.priceLevel !== null && price.priceLevel !== undefined) {
      return price.priceLevel;
    }
    const match = price.name.match(/^precio\s*([0-3])$/i);
    return match ? Number(match[1]) : undefined;
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
