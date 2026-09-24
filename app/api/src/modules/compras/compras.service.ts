import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BankMovementType,
  InventoryMovementType,
  Prisma,
  PurchaseOrderStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import {
  convertProductQuantityToBase,
  convertProductUnitCost,
} from '../../common/utils/product-quantity.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreatePurchasePaymentDto } from './dto/create-purchase-payment.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { PurchaseOrderItemDto } from './dto/purchase-order-item.dto';
import {
  PurchaseReportGranularity,
  PurchaseReportQueryDto,
} from './dto/purchase-report-query.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { Role } from '../../common/enums/role.enum';

function buildPurchasePaymentDescription(consecutive: string, notes?: string) {
  const detail = notes?.trim();
  return detail
    ? `Pago compra ${consecutive} - ${detail}`
    : `Pago compra ${consecutive}`;
}

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  async findAll(query: ListPurchaseOrdersQueryDto, authUser?: AuthUser) {
    const warehouseId = this.resolveWarehouseScope(query.warehouseId, authUser);
    const where: Prisma.PurchaseOrderWhereInput = {
      status: query.status,
      providerId: query.providerId,
      warehouseId,
      orderedAt: this.buildDateRange(
        query.dateFrom ?? query.startDate,
        query.dateTo ?? query.endDate,
      ),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        include: this.listInclude,
        orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    const paymentTotals = await this.getPaymentTotals(data);

    return buildPaginatedResponse(
      data.map((purchaseOrder) =>
        this.withPaymentSummary(purchaseOrder, paymentTotals.get(purchaseOrder.id)),
      ),
      total,
      page,
      limit,
    );
  }

  async getPendingToday(authUser: AuthUser) {
    const warehouseId = this.resolveWarehouseScope(undefined, authUser);
    const data = await this.prisma.purchaseOrder.findMany({
      where: {
        status: PurchaseOrderStatus.ORDENADA,
        warehouseId,
        expectedAt: this.buildTodayRange(),
      },
      include: this.detailInclude,
      orderBy: [{ expectedAt: 'asc' }, { id: 'asc' }],
    });
    const paymentTotals = await this.getPaymentTotals(data);

    return buildPaginatedResponse(
      data.map((purchaseOrder) =>
        this.withPaymentSummary(purchaseOrder, paymentTotals.get(purchaseOrder.id)),
      ),
      data.length,
      1,
      Math.max(1, data.length),
    );
  }

  async findOne(id: number, authUser?: AuthUser) {
    this.ensurePositiveId(id);
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: this.detailInclude,
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Orden de compra no encontrada');
    }
    this.ensureWarehouseAccess(purchaseOrder.warehouseId, authUser);
    const paymentTotals = await this.getPaymentTotals([purchaseOrder]);

    return this.withPaymentSummary(
      purchaseOrder,
      paymentTotals.get(purchaseOrder.id),
    );
  }

  create(dto: CreatePurchaseOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureActiveProvider(tx, dto.providerId);
      await this.ensureActiveWarehouse(tx, dto.warehouseId);
      const items = await this.buildItems(tx, dto.items);
      const totals = this.calculateTotals(items);
      const provider = await tx.provider.findUniqueOrThrow({
        where: { id: dto.providerId },
        select: {
          withholdingType: true,
          withholdingRate: true,
          withholdingMinimumBase: true,
          isSelfWithholding: true,
          hasIslrWithholding: true,
        },
      });
      const retention = this.calculateRetention(provider, totals);

      const created = await tx.purchaseOrder.create({
        data: {
          consecutive: this.generateConsecutive(),
          providerId: dto.providerId,
          warehouseId: dto.warehouseId,
          externalReference: dto.externalReference,
          notes: dto.notes,
          orderedAt: dto.orderedAt ? new Date(dto.orderedAt) : undefined,
          expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
          documentName: dto.documentName?.trim() || undefined,
          documentMimeType: dto.documentMimeType?.trim() || undefined,
          documentData: dto.documentData || undefined,
          ...totals,
          ...retention,
          items: { create: items },
        },
        include: this.detailInclude,
      });
      return this.withPaymentSummary(created);
    });
  }

  updateDraft(id: number, dto: UpdatePurchaseOrderDto) {
    this.ensurePositiveId(id);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Debe enviar al menos un campo para actualizar',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.purchaseOrder.updateMany({
        where: { id, status: PurchaseOrderStatus.BORRADOR },
        data: { updatedAt: new Date() },
      });

      if (locked.count !== 1) {
        await this.throwDraftTransitionError(tx, id);
      }

      const current = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!current) {
        throw new NotFoundException('Orden de compra no encontrada');
      }

      const providerId = dto.providerId ?? current.providerId;
      if (dto.providerId !== undefined) {
        await this.ensureActiveProvider(tx, providerId);
      }
      if (dto.warehouseId !== undefined) {
        await this.ensureActiveWarehouse(tx, dto.warehouseId);
      }

      let items: Awaited<ReturnType<ComprasService['buildItems']>> | undefined;
      if (dto.items) {
        items = await this.buildItems(tx, dto.items);
      }

      const totals = items ? this.calculateTotals(items) : undefined;
      const shouldRecalculateRetention =
        Boolean(items) ||
        (dto.providerId !== undefined && dto.providerId !== current.providerId);
      const retention = shouldRecalculateRetention
        ? this.calculateRetention(
            await tx.provider.findUniqueOrThrow({
              where: { id: providerId },
              select: {
                withholdingType: true,
                withholdingRate: true,
                withholdingMinimumBase: true,
                isSelfWithholding: true,
                hasIslrWithholding: true,
              },
            }),
            totals ?? { subtotal: current.subtotal, total: current.total },
          )
        : undefined;
      if (items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          providerId: dto.providerId,
          warehouseId: dto.warehouseId,
          externalReference: dto.externalReference,
          notes: dto.notes,
          orderedAt: dto.orderedAt ? new Date(dto.orderedAt) : undefined,
          expectedAt:
            dto.expectedAt === null
              ? null
              : dto.expectedAt
                ? new Date(dto.expectedAt)
                : undefined,
          documentName:
            dto.documentName === null
              ? null
              : dto.documentName !== undefined
                ? dto.documentName.trim() || null
                : undefined,
          documentMimeType:
            dto.documentMimeType === null
              ? null
              : dto.documentMimeType !== undefined
                ? dto.documentMimeType.trim() || null
                : undefined,
          documentData:
            dto.documentData === null ? null : dto.documentData ?? undefined,
          ...totals,
          ...retention,
          items: items ? { create: items } : undefined,
        },
        include: this.detailInclude,
      });
      return this.withPaymentSummary(updated);
    });
  }

  async pay(id: number, dto: CreatePurchasePaymentDto) {
    this.ensurePositiveId(id);
    return this.prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id },
      });

      if (!purchaseOrder) {
        throw new NotFoundException('Orden de compra no encontrada');
      }
      if (purchaseOrder.status !== PurchaseOrderStatus.RECIBIDA) {
        throw new BadRequestException(
          'Solo puedes pagar compras recibidas y pendientes.',
        );
      }

      const paidAmount = await this.getPaidAmount(
        tx,
        purchaseOrder.consecutive,
      );
      const balance = Math.max(
        0,
        this.effectivePayableTotal(purchaseOrder) - paidAmount,
      );
      if (dto.amount > balance) {
        throw new BadRequestException(
          `El pago no puede superar el saldo pendiente de ${balance.toFixed(2)}`,
        );
      }

      if (!dto.bankAccountId) {
        throw new BadRequestException(
          'Selecciona la cuenta bancaria desde la que se realizará el pago',
        );
      }

      const account = await tx.bankAccount.findUnique({
        where: { id: dto.bankAccountId },
      });
      if (!account || !account.isActive) {
        throw new BadRequestException(
          'La cuenta bancaria no existe o está inactiva',
        );
      }
      if (Number(account.currentBalance) < dto.amount) {
        throw new BadRequestException('Saldo insuficiente en la cuenta bancaria');
      }
      await tx.bankAccount.update({
        where: { id: dto.bankAccountId },
        data: { currentBalance: { decrement: dto.amount } },
      });
      await tx.bankAccountMovement.create({
        data: {
          bankAccountId: dto.bankAccountId,
          movementType: BankMovementType.EGRESO,
          amount: dto.amount,
          baseAmount: dto.amount,
          totalAmount: dto.amount,
          description: buildPurchasePaymentDescription(
            purchaseOrder.consecutive,
            dto.notes,
          ),
        },
      });

      const saved = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: this.detailInclude,
      });
      return this.withPaymentSummary(saved);
    });
  }

  order(id: number) {
    this.ensurePositiveId(id);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.purchaseOrder.updateMany({
        where: { id, status: PurchaseOrderStatus.BORRADOR },
        data: { updatedAt: new Date() },
      });
      if (locked.count !== 1) {
        await this.throwDraftTransitionError(tx, id);
      }

      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  unit: true,
                  packagingProfile: {
                    select: {
                      unitsPerPackage: true,
                      packagesPerBox: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!purchaseOrder) {
        throw new NotFoundException('Orden de compra no encontrada');
      }
      if (purchaseOrder.items.length === 0) {
        throw new BadRequestException('La orden de compra no tiene productos');
      }

      await this.ensureActiveProvider(tx, purchaseOrder.providerId);
      await this.ensureActiveWarehouse(tx, purchaseOrder.warehouseId);
      await this.ensurePurchasableProducts(
        tx,
        purchaseOrder.items.map((item) => item.productId),
      );

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseOrderStatus.ORDENADA,
        },
        include: this.detailInclude,
      });
      await this.notificacionesService.createPurchaseOrderNotifications(tx, {
        purchaseOrderId: updated.id,
        consecutive: updated.consecutive,
        providerName: updated.provider.name,
        warehouseId: updated.warehouseId,
        warehouseName: updated.warehouse.location,
        itemCount: updated.items.length,
        total: updated.total,
      });
      return this.withPaymentSummary(updated);
    });
  }

  async receive(id: number, authUser?: AuthUser) {
    this.ensurePositiveId(id);
    const scopedOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      select: { warehouseId: true },
    });
    if (!scopedOrder) {
      throw new NotFoundException('Orden de compra no encontrada');
    }
    this.ensureWarehouseAccess(scopedOrder.warehouseId, authUser);
    return this.prisma.$transaction(async (tx) => {
      const receivedAt = new Date();
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id, status: PurchaseOrderStatus.ORDENADA },
        data: { status: PurchaseOrderStatus.RECIBIDA, receivedAt },
      });

      if (claimed.count !== 1) {
        const current = await tx.purchaseOrder.findUnique({
          where: { id },
          include: this.detailInclude,
        });
        if (!current) {
          throw new NotFoundException('Orden de compra no encontrada');
        }
        if (current.status === PurchaseOrderStatus.RECIBIDA) {
          return this.withPaymentSummary(current);
        }
        throw new BadRequestException(
          'Solo se puede recibir una orden en estado ORDENADA',
        );
      }

      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  name: true,
                  unit: true,
                  packagingProfile: {
                    select: {
                      unitsPerPackage: true,
                      packagesPerBox: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!purchaseOrder) {
        throw new NotFoundException('Orden de compra no encontrada');
      }

      for (const item of purchaseOrder.items) {
        const stockQuantity = convertProductQuantityToBase(
          item.quantity,
          item.unit,
          item.product.unit,
          item.product.packagingProfile,
        );
        const normalizedCost = convertProductUnitCost(
          Number(item.unitCost),
          item.unit,
          item.product.unit,
          item.product.packagingProfile,
        );
        if (
          stockQuantity === null ||
          !Number.isInteger(stockQuantity) ||
          stockQuantity <= 0 ||
          normalizedCost === null ||
          !Number.isFinite(normalizedCost)
        ) {
          throw new BadRequestException(
            `No se puede convertir la unidad de compra del producto ${item.productId} a inventario`,
          );
        }

        await tx.productWarehouse.upsert({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: purchaseOrder.warehouseId,
            },
          },
          update: { quantity: { increment: stockQuantity } },
          create: {
            productId: item.productId,
            warehouseId: purchaseOrder.warehouseId,
            quantity: stockQuantity,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            toWarehouseId: purchaseOrder.warehouseId,
            quantity: stockQuantity,
            movementType: InventoryMovementType.ENTRADA,
            reason: `Recepción de ${purchaseOrder.consecutive}`,
            purchaseOrderItemId: item.id,
          },
        });
        await tx.productCost.updateMany({
          where: { productId: item.productId, isActive: true },
          data: { isActive: false, endsAt: receivedAt },
        });
        await tx.productCost.create({
          data: {
            productId: item.productId,
            cost: new Prisma.Decimal(normalizedCost).toDecimalPlaces(2),
            unit: item.product.unit,
            quantity: new Prisma.Decimal(1),
            startsAt: receivedAt,
            isActive: true,
            purchaseOrderItemId: item.id,
          },
        });
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.quantity },
        });
      }

      const received = await tx.purchaseOrder.findUnique({
        where: { id },
        include: this.detailInclude,
      });
      return received ? this.withPaymentSummary(received) : received;
    });
  }

  cancel(id: number) {
    this.ensurePositiveId(id);
    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.purchaseOrder.updateMany({
        where: {
          id,
          status: {
            in: [PurchaseOrderStatus.BORRADOR, PurchaseOrderStatus.ORDENADA],
          },
        },
        data: { status: PurchaseOrderStatus.ANULADA },
      });

      const current = await tx.purchaseOrder.findUnique({
        where: { id },
        include: this.detailInclude,
      });
      if (!current) {
        throw new NotFoundException('Orden de compra no encontrada');
      }
      if (
        cancelled.count === 1 ||
        current.status === PurchaseOrderStatus.ANULADA
      ) {
        return this.withPaymentSummary(current);
      }
      throw new BadRequestException('Una orden recibida no se puede anular');
    });
  }

  async getSummary(query: PurchaseReportQueryDto, authUser?: AuthUser) {
    const warehouseId = this.resolveWarehouseScope(query.warehouseId, authUser);
    const orderedAt = this.buildDateRange(
      query.dateFrom ?? query.startDate,
      query.dateTo ?? query.endDate,
    );
    const baseWhere: Prisma.PurchaseOrderWhereInput = {
      providerId: query.providerId,
      warehouseId,
      orderedAt,
    };
    const where: Prisma.PurchaseOrderWhereInput = {
      ...baseWhere,
      status: PurchaseOrderStatus.RECIBIDA,
    };
    const [
      allSummary,
      statusGroups,
      summary,
      providerGroups,
      productGroups,
      productProviderLines,
      timeRows,
    ] = await Promise.all([
      this.prisma.purchaseOrder.aggregate({
        where: baseWhere,
        _count: { _all: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
      this.prisma.purchaseOrder.aggregate({
        where,
        _count: { _all: true },
        _sum: { subtotal: true, taxes: true, total: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['providerId'],
        where,
        _count: { _all: true },
        _sum: { subtotal: true, taxes: true, total: true },
      }),
      this.prisma.purchaseOrderItem.groupBy({
        by: ['productId'],
        where: { purchaseOrder: where },
        _count: { _all: true },
        _sum: { quantity: true, receivedQuantity: true, total: true },
      }),
      this.prisma.purchaseOrderItem.findMany({
        where: { purchaseOrder: where },
        select: {
          productId: true,
          quantity: true,
          receivedQuantity: true,
          unitCost: true,
          subtotal: true,
          total: true,
          product: {
            select: { id: true, name: true, brand: true, unit: true },
          },
          purchaseOrder: {
            select: {
              providerId: true,
              provider: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      this.prisma.purchaseOrder.findMany({
        where,
        select: {
          providerId: true,
          orderedAt: true,
          expectedAt: true,
          receivedAt: true,
          subtotal: true,
          taxes: true,
          total: true,
        },
        orderBy: { receivedAt: 'asc' },
      }),
    ]);

    const [providers, products] = await Promise.all([
      this.prisma.provider.findMany({
        where: { id: { in: providerGroups.map((group) => group.providerId) } },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productGroups.map((group) => group.productId) } },
        select: { id: true, name: true, brand: true, unit: true },
      }),
    ]);
    const providerById = new Map(
      providers.map((provider) => [provider.id, provider]),
    );
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const countByStatus = new Map(
      statusGroups.map((group) => [group.status, group._count._all]),
    );

    const byProvider = providerGroups
      .map((group) => ({
        provider: providerById.get(group.providerId),
        orders: group._count._all,
        subtotal: group._sum.subtotal ?? this.zero,
        taxes: group._sum.taxes ?? this.zero,
        total: group._sum.total ?? this.zero,
        averageLeadDays: this.averageLeadDays(
          timeRows.filter((row) => row.providerId === group.providerId),
        ),
        onTimeRate: this.onTimeRate(
          timeRows.filter((row) => row.providerId === group.providerId),
        ),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total));
    const topProducts = productGroups
      .map((group) => ({
        product: productById.get(group.productId),
        orderLines: group._count._all,
        orderedQuantity: group._sum.quantity ?? 0,
        receivedQuantity: group._sum.receivedQuantity ?? 0,
        total: group._sum.total ?? this.zero,
      }))
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, query.topProducts ?? 10);
    const byProductProvider =
      this.buildProductProviderBreakdown(productProviderLines);

    return {
      totalPurchases: allSummary._count._all,
      draftCount: countByStatus.get(PurchaseOrderStatus.BORRADOR) ?? 0,
      orderedCount: countByStatus.get(PurchaseOrderStatus.ORDENADA) ?? 0,
      receivedCount: countByStatus.get(PurchaseOrderStatus.RECIBIDA) ?? 0,
      cancelledCount: countByStatus.get(PurchaseOrderStatus.ANULADA) ?? 0,
      totalAmount: summary._sum.total ?? this.zero,
      averageLeadDays: this.averageLeadDays(timeRows),
      onTimeRate: this.onTimeRate(timeRows),
      filters: {
        providerId: query.providerId ?? null,
        warehouseId: warehouseId ?? null,
        dateFrom: query.dateFrom ?? query.startDate ?? null,
        dateTo: query.dateTo ?? query.endDate ?? null,
        granularity: query.granularity ?? PurchaseReportGranularity.MES,
      },
      summary: {
        orders: summary._count._all,
        subtotal: summary._sum.subtotal ?? this.zero,
        taxes: summary._sum.taxes ?? this.zero,
        total: summary._sum.total ?? this.zero,
      },
      byProvider,
      timeline: this.buildTimeline(
        timeRows,
        query.granularity ?? PurchaseReportGranularity.MES,
      ),
      topProducts,
      byProductProvider,
    };
  }

  private readonly zero = new Prisma.Decimal(0);

  private buildProductProviderBreakdown(
    rows: Array<{
      productId: number;
      quantity: number;
      receivedQuantity: number;
      unitCost: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      total: Prisma.Decimal;
      product: { id: number; name: string; brand: string; unit: string };
      purchaseOrder: {
        providerId: number;
        provider: { id: number; name: string };
      };
    }>,
  ) {
    const grouped = new Map<
      string,
      {
        provider: { id: number; name: string };
        product: { id: number; name: string; brand: string; unit: string };
        orderLines: number;
        orderedQuantity: number;
        receivedQuantity: number;
        subtotal: Prisma.Decimal;
        total: Prisma.Decimal;
        unitCostWeighted: Prisma.Decimal;
      }
    >();

    for (const row of rows) {
      const key = `${row.purchaseOrder.providerId}:${row.productId}`;
      const current = grouped.get(key) ?? {
        provider: row.purchaseOrder.provider,
        product: row.product,
        orderLines: 0,
        orderedQuantity: 0,
        receivedQuantity: 0,
        subtotal: this.zero,
        total: this.zero,
        unitCostWeighted: this.zero,
      };

      current.orderLines += 1;
      current.orderedQuantity += row.quantity;
      current.receivedQuantity += row.receivedQuantity;
      current.subtotal = current.subtotal.plus(row.subtotal);
      current.total = current.total.plus(row.total);
      current.unitCostWeighted = current.unitCostWeighted.plus(
        row.unitCost.mul(row.receivedQuantity || row.quantity),
      );
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .map((item) => ({
        ...item,
        averageUnitCost:
          item.receivedQuantity > 0
            ? item.unitCostWeighted
                .div(item.receivedQuantity)
                .toDecimalPlaces(2)
            : item.orderedQuantity > 0
              ? item.unitCostWeighted
                  .div(item.orderedQuantity)
                  .toDecimalPlaces(2)
              : this.zero,
      }))
      .sort((a, b) => Number(b.total) - Number(a.total));
  }

  private averageLeadDays(
    rows: Array<{ orderedAt: Date; receivedAt: Date | null }>,
  ) {
    const completed = rows.filter((row) => row.receivedAt);
    if (!completed.length) return 0;

    const totalDays = completed.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          (row.receivedAt!.getTime() - row.orderedAt.getTime()) / 86_400_000,
        ),
      0,
    );

    return Math.round((totalDays / completed.length) * 10) / 10;
  }

  private onTimeRate(
    rows: Array<{ expectedAt: Date | null; receivedAt: Date | null }>,
  ) {
    const measurable = rows.filter((row) => row.expectedAt && row.receivedAt);
    if (!measurable.length) return null;

    const onTime = measurable.filter(
      (row) => row.receivedAt!.getTime() <= row.expectedAt!.getTime(),
    ).length;

    return Math.round((onTime / measurable.length) * 1000) / 10;
  }

  private readonly listInclude = {
    provider: true,
    warehouse: true,
    _count: { select: { items: true } },
  } as const;

  private readonly detailInclude = {
    provider: true,
    warehouse: true,
    items: {
      include: {
        product: {
          include: {
            productType: true,
            packagingProfile: true,
          },
        },
        inventoryMovements: true,
        productCosts: true,
      },
      orderBy: { id: 'asc' as const },
    },
  } as const;

  private withPaymentSummary(purchaseOrder, paidAmount = 0) {
    const payableTotal = this.effectivePayableTotal(purchaseOrder);
    const balance = Math.max(0, payableTotal - paidAmount);
    return {
      ...purchaseOrder,
      retentionRate: Number(purchaseOrder.retentionRate ?? 0),
      retentionAmount: Number(purchaseOrder.retentionAmount ?? 0),
      payableTotal,
      paidAmount,
      balance,
    };
  }

  private effectivePayableTotal(purchaseOrder: {
    total?: Prisma.Decimal | number | string | null;
    payableTotal?: Prisma.Decimal | number | string | null;
  }) {
    const total = Number(purchaseOrder.total ?? 0);
    const payableTotal = Number(purchaseOrder.payableTotal ?? 0);
    return payableTotal > 0 || total === 0 ? payableTotal : total;
  }

  private calculateRetention(
    provider: {
      withholdingType: string | null;
      withholdingRate: Prisma.Decimal | null;
      withholdingMinimumBase: Prisma.Decimal | null;
      isSelfWithholding: boolean;
      hasIslrWithholding: boolean;
    },
    totals: { subtotal: Prisma.Decimal; total: Prisma.Decimal },
  ) {
    const explicitRate = Number(provider.withholdingRate ?? 0);
    const textRate = Number(
      provider.withholdingType?.match(/[0-9]+(?:[.,][0-9]+)?/)?.[0]?.replace(',', '.') ?? 0,
    );
    const rate = Math.min(100, Math.max(0, explicitRate || textRate));
    const minimumBase = Math.max(0, Number(provider.withholdingMinimumBase ?? 0));
    const applies =
      !provider.isSelfWithholding &&
      (provider.hasIslrWithholding || Boolean(provider.withholdingType)) &&
      rate > 0 &&
      Number(totals.subtotal) >= minimumBase;
    const retentionAmount = applies
      ? new Prisma.Decimal(totals.subtotal)
          .mul(rate)
          .div(100)
          .toDecimalPlaces(2)
      : this.zero;
    return {
      retentionRate: new Prisma.Decimal(applies ? rate : 0).toDecimalPlaces(2),
      retentionAmount,
      payableTotal: new Prisma.Decimal(totals.total)
        .minus(retentionAmount)
        .toDecimalPlaces(2),
    };
  }

  private async getPaymentTotals(purchaseOrders: Array<{ id: number; consecutive: string }>) {
    const orderIdByConsecutive = new Map(
      purchaseOrders.map((purchaseOrder) => [
        purchaseOrder.consecutive,
        purchaseOrder.id,
      ]),
    );
    const totals = new Map<number, number>();
    if (!orderIdByConsecutive.size) return totals;

    const movements = await this.prisma.bankAccountMovement.findMany({
      where: {
        movementType: BankMovementType.EGRESO,
        description: { startsWith: 'Pago compra ' },
      },
      select: { amount: true, description: true },
    });
    for (const movement of movements) {
      const description = movement.description ?? '';
      const consecutive = description
        .slice('Pago compra '.length)
        .split(' - ')[0];
      const orderId = orderIdByConsecutive.get(consecutive);
      if (orderId) {
        totals.set(orderId, (totals.get(orderId) ?? 0) + Number(movement.amount));
      }
    }
    return totals;
  }

  private async getPaidAmount(tx: Prisma.TransactionClient, consecutive: string) {
    const movements = await tx.bankAccountMovement.findMany({
      where: {
        movementType: BankMovementType.EGRESO,
        description: { startsWith: `Pago compra ${consecutive}` },
      },
      select: { amount: true, description: true },
    });
    return movements
      .filter((movement) => {
        const description = movement.description ?? '';
        return (
          description === `Pago compra ${consecutive}` ||
          description.startsWith(`Pago compra ${consecutive} - `)
        );
      })
      .reduce((sum, movement) => sum + Number(movement.amount), 0);
  }

  private async buildItems(
    tx: Prisma.TransactionClient,
    input: PurchaseOrderItemDto[],
  ) {
    const productIds = input.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'Cada producto debe aparecer una sola vez en la orden',
      );
    }

    const products = await this.ensurePurchasableProducts(tx, productIds);
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    return input.map((item) => {
      const product = productById.get(item.productId)!;
      const purchaseUnit = item.unit ?? product.unit;
      const stockQuantity = convertProductQuantityToBase(
        item.quantity,
        purchaseUnit,
        product.unit,
        product.packagingProfile,
      );
      const normalizedCost = convertProductUnitCost(
        item.unitCost,
        purchaseUnit,
        product.unit,
        product.packagingProfile,
      );
      if (
        stockQuantity === null ||
        !Number.isInteger(stockQuantity) ||
        stockQuantity <= 0 ||
        normalizedCost === null ||
        !Number.isFinite(normalizedCost)
      ) {
        throw new BadRequestException(
          `La unidad de compra del producto ${product.name} no tiene una conversión válida`,
        );
      }
      const unitCost = new Prisma.Decimal(item.unitCost).toDecimalPlaces(2);
      const taxRate = new Prisma.Decimal(item.taxRate ?? 0).toDecimalPlaces(2);
      const subtotal = unitCost.mul(item.quantity).toDecimalPlaces(2);
      const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(2);

      return {
        productId: item.productId,
        quantity: item.quantity,
        unit: purchaseUnit,
        unitCost,
        taxRate,
        subtotal,
        taxAmount,
        total: subtotal.plus(taxAmount),
      };
    });
  }

  private calculateTotals(
    items: Awaited<ReturnType<ComprasService['buildItems']>>,
  ) {
    return items.reduce(
      (totals, item) => ({
        subtotal: totals.subtotal.plus(item.subtotal),
        taxes: totals.taxes.plus(item.taxAmount),
        total: totals.total.plus(item.total),
      }),
      { subtotal: this.zero, taxes: this.zero, total: this.zero },
    );
  }

  private async ensureActiveProvider(tx: Prisma.TransactionClient, id: number) {
    const provider = await tx.provider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    if (!provider.isActive) {
      throw new BadRequestException('El proveedor está inactivo');
    }
  }

  private async ensureActiveWarehouse(
    tx: Prisma.TransactionClient,
    id: number,
  ) {
    const warehouse = await tx.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('La bodega está inactiva');
    }
  }

  private async ensurePurchasableProducts(
    tx: Prisma.TransactionClient,
    productIds: number[],
  ) {
    const uniqueIds = [...new Set(productIds)];
    const products = await tx.product.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        name: true,
        isActive: true,
        unit: true,
        packagingProfile: {
          select: {
            unitsPerPackage: true,
            packagesPerBox: true,
          },
        },
      },
    });
    if (products.length !== uniqueIds.length) {
      throw new NotFoundException('Uno o más productos no existen');
    }

    const inactive = products.find((product) => !product.isActive);
    if (inactive) {
      throw new BadRequestException(`El producto ${inactive.id} está inactivo`);
    }
    return products;
  }

  private async throwDraftTransitionError(
    tx: Prisma.TransactionClient,
    id: number,
  ): Promise<never> {
    const current = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Orden de compra no encontrada');
    }
    throw new BadRequestException(
      'Solo se puede modificar u ordenar una orden en estado BORRADOR',
    );
  }

  private buildDateRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return undefined;

    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;
    const dateOnlyTo = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo);
    const upper = to
      ? dateOnlyTo
        ? new Date(to.getTime() + 24 * 60 * 60 * 1000)
        : to
      : undefined;

    if (from && upper && from >= upper) {
      throw new BadRequestException(
        'La fecha inicial debe ser anterior a la fecha final',
      );
    }

    return {
      gte: from,
      ...(dateOnlyTo ? { lt: upper } : { lte: upper }),
    };
  }

  private buildTodayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { gte: start, lt: end };
  }

  private buildTimeline(
    rows: Array<{
      receivedAt: Date | null;
      subtotal: Prisma.Decimal;
      taxes: Prisma.Decimal;
      total: Prisma.Decimal;
    }>,
    granularity: PurchaseReportGranularity,
  ) {
    const buckets = new Map<
      string,
      {
        period: string;
        orders: number;
        subtotal: Prisma.Decimal;
        taxes: Prisma.Decimal;
        total: Prisma.Decimal;
      }
    >();

    for (const row of rows) {
      if (!row.receivedAt) continue;
      const iso = row.receivedAt.toISOString();
      const period =
        granularity === PurchaseReportGranularity.DIA
          ? iso.slice(0, 10)
          : iso.slice(0, 7);
      const current = buckets.get(period) ?? {
        period,
        orders: 0,
        subtotal: this.zero,
        taxes: this.zero,
        total: this.zero,
      };
      current.orders += 1;
      current.subtotal = current.subtotal.plus(row.subtotal);
      current.taxes = current.taxes.plus(row.taxes);
      current.total = current.total.plus(row.total);
      buckets.set(period, current);
    }

    return [...buckets.values()].sort((a, b) =>
      a.period.localeCompare(b.period),
    );
  }

  private getSearchWhere(search?: string): Prisma.PurchaseOrderWhereInput {
    const q = search?.trim();
    if (!q) return {};

    return {
      OR: [
        { consecutive: { contains: q, mode: 'insensitive' } },
        { externalReference: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { provider: { name: { contains: q, mode: 'insensitive' } } },
        { warehouse: { location: { contains: q, mode: 'insensitive' } } },
        {
          items: {
            some: { product: { name: { contains: q, mode: 'insensitive' } } },
          },
        },
      ],
    };
  }

  private generateConsecutive() {
    return `OC-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }

  private resolveWarehouseScope(
    requestedWarehouseId?: number,
    authUser?: AuthUser,
  ) {
    if (authUser?.role !== Role.BODEGA) return requestedWarehouseId;
    if (!authUser.warehouseId) {
      throw new BadRequestException(
        'El usuario de bodega no tiene una bodega asignada',
      );
    }
    return authUser.warehouseId;
  }

  private ensureWarehouseAccess(warehouseId: number, authUser?: AuthUser) {
    if (
      authUser?.role === Role.BODEGA &&
      warehouseId !== authUser.warehouseId
    ) {
      throw new NotFoundException('Orden de compra no encontrada');
    }
  }
}
