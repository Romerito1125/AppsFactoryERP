import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, Prisma, Role } from '@prisma/client';
import { buildPackagingBreakdown } from '../../common/utils/packaging.util';
import {
  convertProductQuantityToBase,
  convertProductUnitCost,
  getProductStockStatus,
} from '../../common/utils/product-quantity.util';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProductResolverService } from '../../shared/products/product-resolver.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  InventoryAdjustmentDto,
  InventoryEntryDto,
  InventoryExitDto,
  InventoryTransferDto,
  InventoryTransferBatchDto,
} from './dto/inventory-movement.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';

@Injectable()
export class InventarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productResolver: ProductResolverService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: ListInventoryQueryDto) {
    const where = {
      isActive: true,
      ...this.getProductSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          productType: true,
          primaryProvider: true,
          packagingProfile: true,
          costs: {
            where: { isActive: true },
            orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
          prices: { where: { isActive: true }, orderBy: { id: 'asc' } },
          providers: {
            include: { provider: true },
            orderBy: { providerId: 'asc' },
          },
          warehouses: {
            include: { warehouse: true },
            orderBy: { warehouseId: 'asc' },
          },
        },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(
      data.map((product) => this.formatProduct(product)),
      total,
      page,
      limit,
    );
  }

  async findByProduct(productId: number) {
    this.ensurePositiveId(productId);
    await this.ensureActiveProduct(productId);
    const rows = await this.prisma.productWarehouse.findMany({
      where: { productId },
      include: {
        product: {
          include: {
            productType: true,
            primaryProvider: true,
            packagingProfile: true,
            costs: {
              where: { isActive: true },
              orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
            prices: { where: { isActive: true }, orderBy: { id: 'asc' } },
            providers: {
              include: { provider: true },
              orderBy: { providerId: 'asc' },
            },
          },
        },
        warehouse: true,
      },
      orderBy: { warehouseId: 'asc' },
    });

    return rows.map((row) => ({
      ...row,
      product: this.formatProduct(row.product),
    }));
  }

  async findByWarehouse(warehouseId: number, authUser?: AuthUser) {
    this.ensurePositiveId(warehouseId);
    if (authUser?.role === Role.BODEGA && authUser.warehouseId !== warehouseId) {
      throw new NotFoundException('Bodega no encontrada');
    }
    await this.ensureActiveWarehouse(warehouseId);
    const rows = await this.prisma.productWarehouse.findMany({
      where: { warehouseId },
      include: {
        product: {
          include: {
            productType: true,
            primaryProvider: true,
            packagingProfile: true,
            costs: {
              where: { isActive: true },
              orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
            prices: { where: { isActive: true }, orderBy: { id: 'asc' } },
            providers: {
              include: { provider: true },
              orderBy: { providerId: 'asc' },
            },
          },
        },
        warehouse: true,
      },
      orderBy: { productId: 'asc' },
    });

    return rows.map((row) => ({
      ...row,
      product: this.formatProduct(row.product),
    }));
  }

  async entry(dto: InventoryEntryDto, actor: AuthUser) {
    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await this.productResolver.resolve(dto, tx, {
        packagingProfile: true,
      });
      this.ensureActorWarehouseAccess(dto.toWarehouseId, actor);
      await this.ensureActiveWarehouse(dto.toWarehouseId, tx);
      const stockQuantity = this.resolveStockQuantity(
        dto.quantity,
        dto.unit ?? product.unit,
        product,
      );
      const packaging = buildPackagingBreakdown(
        stockQuantity,
        product.packagingProfile,
      );
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: dto.toWarehouseId,
          },
        },
        update: { quantity: { increment: stockQuantity } },
        create: {
          productId: product.id,
          warehouseId: dto.toWarehouseId,
          quantity: stockQuantity,
        },
      });
      return tx.inventoryMovement.create({
        data: {
          productId: product.id,
          toWarehouseId: dto.toWarehouseId,
          createdByUserId: actor.sub,
          approvedByUserId: actor.sub,
          quantity: stockQuantity,
          movementType: InventoryMovementType.ENTRADA,
          reason: dto.reason,
          approvedAt: new Date(),
          packagingBoxes: packaging?.boxes,
          packagingPackages: packaging?.packages,
          packagingUnits: packaging?.units,
        },
        include: this.movementInclude,
      });
    });

    await this.auditLogService.log({
      actor,
      module: 'INVENTARIO',
      action: 'ENTRY',
      entityType: 'InventoryMovement',
      entityId: movement.id,
      entityLabel: movement.product?.name,
      description: `Registro una entrada de inventario para ${movement.product?.name}`,
      metadata: {
        movementId: movement.id,
        productId: movement.productId,
        toWarehouseId: movement.toWarehouseId,
        quantity: movement.quantity,
      },
    });

    return movement;
  }

  async exit(dto: InventoryExitDto, actor: AuthUser) {
    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await this.productResolver.resolve(dto, tx, {
        packagingProfile: true,
      });
      this.ensureActorWarehouseAccess(dto.fromWarehouseId, actor);
      await this.ensureActiveWarehouse(dto.fromWarehouseId, tx);
      const stockQuantity = this.resolveStockQuantity(
        dto.quantity,
        dto.unit ?? product.unit,
        product,
      );
      const packaging = buildPackagingBreakdown(
        stockQuantity,
        product.packagingProfile,
      );
      await this.decrementStock(
        tx,
        product.id,
        dto.fromWarehouseId,
        stockQuantity,
      );
      return tx.inventoryMovement.create({
        data: {
          productId: product.id,
          fromWarehouseId: dto.fromWarehouseId,
          createdByUserId: actor.sub,
          approvedByUserId: actor.sub,
          quantity: stockQuantity,
          movementType: InventoryMovementType.SALIDA,
          reason: dto.reason,
          approvedAt: new Date(),
          packagingBoxes: packaging?.boxes,
          packagingPackages: packaging?.packages,
          packagingUnits: packaging?.units,
        },
        include: this.movementInclude,
      });
    });

    await this.auditLogService.log({
      actor,
      module: 'INVENTARIO',
      action: 'EXIT',
      entityType: 'InventoryMovement',
      entityId: movement.id,
      entityLabel: movement.product?.name,
      description: `Registro una salida de inventario para ${movement.product?.name}`,
      metadata: {
        movementId: movement.id,
        productId: movement.productId,
        fromWarehouseId: movement.fromWarehouseId,
        quantity: movement.quantity,
      },
    });

    return movement;
  }

  async transfer(dto: InventoryTransferDto, actor: AuthUser) {
    if (dto.fromWarehouseId === dto.toWarehouseId)
      throw new BadRequestException(
        'La bodega origen y destino no pueden ser iguales',
      );
    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await this.productResolver.resolve(dto, tx, {
        packagingProfile: true,
      });
      this.ensureActorWarehouseAccess(dto.fromWarehouseId, actor);
      this.ensureActorWarehouseAccess(dto.toWarehouseId, actor);
      await this.ensureActiveWarehouse(dto.fromWarehouseId, tx);
      await this.ensureActiveWarehouse(dto.toWarehouseId, tx);
      const stockQuantity = this.resolveStockQuantity(
        dto.quantity,
        dto.unit ?? product.unit,
        product,
      );
      const packaging = buildPackagingBreakdown(
        stockQuantity,
        product.packagingProfile,
      );
      await this.decrementStock(
        tx,
        product.id,
        dto.fromWarehouseId,
        stockQuantity,
      );
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: dto.toWarehouseId,
          },
        },
        update: { quantity: { increment: stockQuantity } },
        create: {
          productId: product.id,
          warehouseId: dto.toWarehouseId,
          quantity: stockQuantity,
        },
      });
      const createdMovement = await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          createdByUserId: actor.sub,
          approvedByUserId: actor.sub,
          quantity: stockQuantity,
          movementType: InventoryMovementType.TRASLADO,
          reason: dto.reason,
          approvedAt: new Date(),
          packagingBoxes: packaging?.boxes,
          packagingPackages: packaging?.packages,
          packagingUnits: packaging?.units,
        },
      });

      await tx.inventoryTransferTicket.create({
        data: {
          movementId: createdMovement.id,
          ticketNumber: this.generateTransferTicketNumber(),
          status: 'APROBADO',
          supportNote: dto.supportNote?.trim() || dto.reason?.trim() || null,
          createdByUserId: actor.sub,
          approvedByUserId: actor.sub,
          approvedAt: new Date(),
        },
      });

      return tx.inventoryMovement.findUniqueOrThrow({
        where: { id: createdMovement.id },
        include: this.movementInclude,
      });
    });

    await this.auditLogService.log({
      actor,
      module: 'INVENTARIO',
      action: 'APPROVE_TRANSFER',
      entityType: 'InventoryTransferTicket',
      entityId: movement.transferTicket?.id ?? movement.id,
      entityLabel:
        movement.transferTicket?.ticketNumber ?? movement.product?.name,
      description:
        `Aprobo el traslado ${movement.transferTicket?.ticketNumber ?? ''}`.trim(),
      metadata: {
        movementId: movement.id,
        ticketNumber: movement.transferTicket?.ticketNumber,
        productId: movement.productId,
        fromWarehouseId: movement.fromWarehouseId,
        toWarehouseId: movement.toWarehouseId,
        quantity: movement.quantity,
        supportNote: movement.transferTicket?.supportNote,
      },
    });

    return movement;
  }

  async transferBatch(dto: InventoryTransferBatchDto, actor: AuthUser) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'La bodega origen y destino no pueden ser iguales',
      );
    }
    // Un bodeguero puede enviar desde su bodega o pedir hacia ella (traslados sugeridos);
    // lo que no puede es mover mercancía entre dos bodegas ajenas.
    if (
      actor.role === Role.BODEGA &&
      actor.warehouseId !== dto.fromWarehouseId &&
      actor.warehouseId !== dto.toWarehouseId
    ) {
      throw new NotFoundException('Bodega no encontrada');
    }

    const batchNumber = this.generateTransferBatchNumber();
    const movements = await this.prisma.$transaction(async (tx) => {
      await this.ensureActiveWarehouse(dto.fromWarehouseId, tx);
      await this.ensureActiveWarehouse(dto.toWarehouseId, tx);

      const created: number[] = [];
      for (const [index, item] of dto.items.entries()) {
        const product = await this.productResolver.resolve(item, tx, {
          packagingProfile: true,
        });
        const stockQuantity = this.resolveStockQuantity(
          item.quantity,
          item.unit ?? product.unit,
          product,
        );
        const packaging = buildPackagingBreakdown(
          stockQuantity,
          product.packagingProfile,
        );

        await this.decrementStock(
          tx,
          product.id,
          dto.fromWarehouseId,
          stockQuantity,
        );
        await tx.productWarehouse.upsert({
          where: {
            productId_warehouseId: {
              productId: product.id,
              warehouseId: dto.toWarehouseId,
            },
          },
          update: { quantity: { increment: stockQuantity } },
          create: {
            productId: product.id,
            warehouseId: dto.toWarehouseId,
            quantity: stockQuantity,
          },
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            fromWarehouseId: dto.fromWarehouseId,
            toWarehouseId: dto.toWarehouseId,
            createdByUserId: actor.sub,
            approvedByUserId: actor.sub,
            quantity: stockQuantity,
            movementType: InventoryMovementType.TRASLADO,
            reason: dto.supportNote?.trim() || 'Traslado entre bodegas',
            approvedAt: new Date(),
            packagingBoxes: packaging?.boxes,
            packagingPackages: packaging?.packages,
            packagingUnits: packaging?.units,
          },
        });

        await tx.inventoryTransferTicket.create({
          data: {
            movementId: movement.id,
            ticketNumber: `${batchNumber}-${String(index + 1).padStart(3, '0')}`,
            batchNumber,
            status: 'APROBADO',
            supportNote: dto.supportNote?.trim() || null,
            createdByUserId: actor.sub,
            approvedByUserId: actor.sub,
            approvedAt: new Date(),
          },
        });

        created.push(movement.id);
      }

      return tx.inventoryMovement.findMany({
        where: { id: { in: created } },
        include: this.movementInclude,
        orderBy: { id: 'asc' },
      });
    });

    await this.auditLogService.log({
      actor,
      module: 'INVENTARIO',
      action: 'APPROVE_TRANSFER_BATCH',
      entityType: 'InventoryTransferTicket',
      entityId: movements[0]?.transferTicket?.id,
      entityLabel: batchNumber,
      description: `Aprobó un traslado de ${movements.length} producto(s)`,
      metadata: {
        batchNumber,
        movementIds: movements.map((movement) => movement.id),
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
      },
    });

    return { batchNumber, movements };
  }

  async adjustment(dto: InventoryAdjustmentDto, actor: AuthUser) {
    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await this.productResolver.resolve(dto, tx, {
        packagingProfile: true,
      });
      this.ensureActorWarehouseAccess(dto.warehouseId, actor);
      await this.ensureActiveWarehouse(dto.warehouseId, tx);
      const targetQuantity = this.resolveStockQuantity(
        dto.quantity,
        dto.unit ?? product.unit,
        product,
        true,
      );
      const current = await tx.productWarehouse.findUnique({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: dto.warehouseId,
          },
        },
      });
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: dto.warehouseId,
          },
        },
        update: { quantity: targetQuantity },
        create: {
          productId: product.id,
          warehouseId: dto.warehouseId,
          quantity: targetQuantity,
        },
      });
      const difference = targetQuantity - Number(current?.quantity ?? 0);
      const packaging = buildPackagingBreakdown(
        Math.abs(difference),
        product.packagingProfile,
      );

      return tx.inventoryMovement.create({
        data: {
          productId: product.id,
          fromWarehouseId: difference < 0 ? dto.warehouseId : undefined,
          toWarehouseId: difference >= 0 ? dto.warehouseId : undefined,
          createdByUserId: actor.sub,
          approvedByUserId: actor.sub,
          quantity: Math.abs(difference),
          movementType: InventoryMovementType.AJUSTE,
          reason: dto.reason,
          approvedAt: new Date(),
          packagingBoxes: packaging?.boxes,
          packagingPackages: packaging?.packages,
          packagingUnits: packaging?.units,
        },
        include: this.movementInclude,
      });
    });

    await this.auditLogService.log({
      actor,
      module: 'INVENTARIO',
      action: 'ADJUSTMENT',
      entityType: 'InventoryMovement',
      entityId: movement.id,
      entityLabel: movement.product?.name,
      description: `Registro un ajuste de inventario para ${movement.product?.name}`,
      metadata: {
        movementId: movement.id,
        productId: movement.productId,
        warehouseId: dto.warehouseId,
        quantity: movement.quantity,
        reason: movement.reason,
      },
    });

    return movement;
  }

  async findMovements(query: ListInventoryQueryDto, authUser?: AuthUser) {
    const warehouseId = this.resolveActorWarehouse(authUser);
    const conditions: Prisma.InventoryMovementWhereInput[] = [];
    const searchWhere = this.getMovementSearchWhere(query.q);
    if (searchWhere) conditions.push(searchWhere);
    if (warehouseId) {
      conditions.push({
        OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }],
      });
    }
    const where: Prisma.InventoryMovementWhereInput = conditions.length
      ? { AND: conditions }
      : {};
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        include: this.movementInclude,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findMovement(id: number, authUser?: AuthUser) {
    this.ensurePositiveId(id);
    const movement = await this.prisma.inventoryMovement.findUnique({
      where: { id },
      include: this.movementInclude,
    });
    if (!movement)
      throw new NotFoundException('Movimiento de inventario no encontrado');
    this.ensureMovementAccess(movement, authUser);
    return movement;
  }

  async findTransferTickets(query: ListInventoryQueryDto, authUser?: AuthUser) {
    const warehouseId = this.resolveActorWarehouse(authUser);
    const conditions: Prisma.InventoryTransferTicketWhereInput[] = [];
    const searchWhere = this.getTransferTicketSearchWhere(query.q);
    if (searchWhere) conditions.push(searchWhere);
    if (warehouseId) {
      conditions.push({
        movement: {
          OR: [
            { fromWarehouseId: warehouseId },
            { toWarehouseId: warehouseId },
          ],
        },
      });
    }
    const where: Prisma.InventoryTransferTicketWhereInput = conditions.length
      ? { AND: conditions }
      : {};
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.inventoryTransferTicket.count({ where }),
      this.prisma.inventoryTransferTicket.findMany({
        where,
        include: this.transferTicketInclude,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * Traslados sugeridos por faltantes: por producto y bodega con existencia bajo el mínimo,
   * propone cuánto traer de las bodegas con excedente. Solo es una propuesta (nada se mueve
   * hasta confirmarla). Lo reservado por preventas pendientes no cuenta como disponible.
   */
  async suggestTransfers(authUser?: AuthUser) {
    const rows = await this.prisma.productWarehouse.findMany({
      where: { warehouse: { isActive: true }, product: { isActive: true, minimumStock: { gt: 0 } } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            minimumStock: true,
            maximumStock: true,
            primaryProvider: { select: { id: true, name: true } },
          },
        },
        warehouse: { select: { id: true, location: true } },
      },
    });
    const reservations = await this.prisma.quoteItem.groupBy({
      by: ['productId', 'warehouseId'],
      where: {
        warehouseId: { not: null },
        fulfillmentStatus: { not: 'SURTIDO' },
        quote: { kind: 'PREVENTA', status: { in: ['PENDIENTE', 'APROBADA'] } },
      },
      _sum: { quantity: true },
    });
    const reserved = new Map(
      reservations.map((row) => [`${row.productId}:${row.warehouseId}`, Number(row._sum.quantity ?? 0)]),
    );
    const byProduct = new Map<number, typeof rows>();
    for (const row of rows) {
      byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), row]);
    }
    const warehouseScope = authUser?.role === 'BODEGA' ? authUser.warehouseId : null;
    const suggestions: Array<Record<string, unknown>> = [];
    for (const [, locations] of byProduct) {
      const product = locations[0].product;
      const minimum = Number(product.minimumStock);
      const target = Number(product.maximumStock ?? minimum * 2);
      const donors = locations
        .map((row) => ({
          row,
          surplus: Math.max(
            0,
            Number(row.quantity) - (reserved.get(`${row.productId}:${row.warehouseId}`) ?? 0) - minimum,
          ),
        }))
        .filter((donor) => donor.surplus > 0)
        .sort((a, b) => b.surplus - a.surplus);
      for (const row of locations) {
        if (warehouseScope && row.warehouseId !== warehouseScope) continue;
        const available =
          Number(row.quantity) - (reserved.get(`${row.productId}:${row.warehouseId}`) ?? 0);
        if (available >= minimum) continue;
        let need = Math.max(0, target - available);
        for (const donor of donors) {
          if (need <= 0) break;
          if (donor.row.warehouseId === row.warehouseId || donor.surplus <= 0) continue;
          const quantity = Math.floor(Math.min(need, donor.surplus));
          if (quantity <= 0) continue;
          donor.surplus -= quantity;
          need -= quantity;
          suggestions.push({
            productId: product.id,
            productName: product.name,
            brand: product.brand,
            providerId: product.primaryProvider?.id ?? null,
            providerName: product.primaryProvider?.name ?? null,
            fromWarehouseId: donor.row.warehouseId,
            fromWarehouse: donor.row.warehouse.location,
            fromAvailable: Number(donor.row.quantity),
            toWarehouseId: row.warehouseId,
            toWarehouse: row.warehouse.location,
            toAvailable: available,
            minimum,
            target,
            quantity,
          });
        }
      }
    }
    return suggestions.sort((a, b) =>
      String(a.brand ?? '').localeCompare(String(b.brand ?? '')) ||
      String(a.productName).localeCompare(String(b.productName)),
    );
  }

  async findTransferTicket(id: number, authUser?: AuthUser) {
    this.ensurePositiveId(id);

    const ticket = await this.prisma.inventoryTransferTicket.findUnique({
      where: { id },
      include: this.transferTicketInclude,
    });

    if (!ticket) {
      throw new NotFoundException('Ticket de traslado no encontrado');
    }

    this.ensureMovementAccess(ticket.movement, authUser);

    return ticket;
  }

  private readonly movementInclude = {
    product: { include: { packagingProfile: true } },
    fromWarehouse: true,
    toWarehouse: true,
    createdByUser: {
      select: { id: true, username: true, role: true },
    },
    approvedByUser: {
      select: { id: true, username: true, role: true },
    },
    transferTicket: {
      select: {
        id: true,
        ticketNumber: true,
        batchNumber: true,
        status: true,
        supportNote: true,
        approvedAt: true,
        createdAt: true,
      },
    },
  } as const;

  private readonly transferTicketInclude = {
    movement: { include: this.movementInclude },
    createdByUser: { select: { id: true, username: true, role: true } },
    approvedByUser: { select: { id: true, username: true, role: true } },
  } as const;

  private async decrementStock(
    tx: any,
    productId: number,
    warehouseId: number,
    quantity: number,
  ) {
    const updated = await tx.productWarehouse.updateMany({
      where: { productId, warehouseId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (updated.count !== 1)
      throw new BadRequestException('Stock insuficiente en la bodega origen');
  }

  private async ensureActiveProduct(id: number, tx: any = this.prisma) {
    const product = await tx.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (!product.isActive)
      throw new BadRequestException('El producto está inactivo');
  }

  private async ensureActiveWarehouse(id: number, tx: any = this.prisma) {
    const warehouse = await tx.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('Bodega no encontrada');
    if (!warehouse.isActive)
      throw new BadRequestException('La bodega está inactiva');
  }

  private ensurePositiveId(id: number) {
    if (id <= 0)
      throw new BadRequestException('El id debe ser un número positivo');
  }

  private getProductSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { brand: { contains: q, mode: 'insensitive' as const } },
        {
          productType: { name: { contains: q, mode: 'insensitive' as const } },
        },
        {
          primaryProvider: {
            name: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          providers: {
            some: {
              provider: { name: { contains: q, mode: 'insensitive' as const } },
            },
          },
        },
        {
          warehouses: {
            some: {
              warehouse: {
                location: { contains: q, mode: 'insensitive' as const },
              },
            },
          },
        },
      ],
    };
  }

  private formatProduct(product) {
    const totalStock = (product.warehouses ?? []).reduce(
      (sum, item) => sum + Number(item.quantity ?? 0),
      0,
    );
    const currentCost = product.costs?.[0];
    const costPerUnit = currentCost && Number(currentCost.quantity) > 0
      ? convertProductUnitCost(
          Number(currentCost.cost) / Number(currentCost.quantity),
          currentCost.unit,
          product.unit,
          product.packagingProfile,
        ) ?? 0
      : 0;
    const inventoryValueNet = totalStock * costPerUnit;
    const taxRate = Number(product.taxRate ?? 0);
    const inventoryTax = inventoryValueNet * (taxRate / 100);
    const inventoryValue = inventoryValueNet + inventoryTax;
    const packaging = buildPackagingBreakdown(
      totalStock,
      product.packagingProfile,
    );

    return {
      ...product,
      provider: product.primaryProvider,
      providers: (product.providers ?? []).map((item) => ({
        ...item.provider,
        isPrimary: item.providerId === product.providerId,
      })),
      stock: totalStock,
      totalStock,
      cost: costPerUnit,
      inventoryValueNet,
      inventoryTax,
      inventoryValue,
      stockStatus: getProductStockStatus(
        totalStock,
        product.minimumStock,
        product.maximumStock,
      ),
      warehouses: (product.warehouses ?? []).map((item) => {
        const warehouseValueNet = Number(item.quantity ?? 0) * costPerUnit;
        const warehouseTax = warehouseValueNet * (taxRate / 100);
        return {
          ...item,
          stockStatus: getProductStockStatus(
            Number(item.quantity ?? 0),
            product.minimumStock,
            product.maximumStock,
          ),
          inventoryValueNet: warehouseValueNet,
          inventoryTax: warehouseTax,
          inventoryValue: warehouseValueNet + warehouseTax,
        };
      }),
      packagingSummary: packaging,
    };
  }

  private resolveStockQuantity(
    quantity: number,
    fromUnit,
    product,
    allowZero = false,
  ) {
    const stockQuantity = convertProductQuantityToBase(
      quantity,
      fromUnit,
      product.unit,
      product.packagingProfile,
    );
    if (
      stockQuantity === null ||
      !Number.isFinite(stockQuantity) ||
      (!allowZero && stockQuantity <= 0)
    ) {
      throw new BadRequestException(
        `La cantidad no se puede convertir a la unidad de inventario (${product.unit})`,
      );
    }
    return stockQuantity;
  }

  private ensureActorWarehouseAccess(warehouseId: number, actor: AuthUser) {
    if (actor.role === Role.BODEGA && actor.warehouseId !== warehouseId) {
      throw new NotFoundException('Bodega no encontrada');
    }
  }

  private resolveActorWarehouse(authUser?: AuthUser) {
    return authUser?.role === Role.BODEGA
      ? authUser.warehouseId ?? undefined
      : undefined;
  }

  private ensureMovementAccess(movement: any, authUser?: AuthUser) {
    const warehouseId = this.resolveActorWarehouse(authUser);
    if (
      warehouseId &&
      movement.fromWarehouseId !== warehouseId &&
      movement.toWarehouseId !== warehouseId
    ) {
      throw new NotFoundException('Movimiento de inventario no encontrado');
    }
  }

  private getMovementSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { product: { name: { contains: q, mode: 'insensitive' as const } } },
        {
          fromWarehouse: {
            location: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          toWarehouse: {
            location: { contains: q, mode: 'insensitive' as const },
          },
        },
        { reason: { contains: q, mode: 'insensitive' as const } },
        {
          transferTicket: {
            ticketNumber: { contains: q, mode: 'insensitive' as const },
          },
        },
      ],
    };
  }

  private getTransferTicketSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { ticketNumber: { contains: q, mode: 'insensitive' as const } },
        { batchNumber: { contains: q, mode: 'insensitive' as const } },
        { supportNote: { contains: q, mode: 'insensitive' as const } },
        {
          movement: {
            product: { name: { contains: q, mode: 'insensitive' as const } },
          },
        },
        {
          movement: {
            fromWarehouse: {
              location: { contains: q, mode: 'insensitive' as const },
            },
          },
        },
        {
          movement: {
            toWarehouse: {
              location: { contains: q, mode: 'insensitive' as const },
            },
          },
        },
      ],
    };
  }

  private generateTransferTicketNumber() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}${String(now.getDate()).padStart(2, '0')}`;
    const timePart = `${String(now.getHours()).padStart(2, '0')}${String(
      now.getMinutes(),
    ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const suffix = Math.floor(Math.random() * 900 + 100);

    return `TRS-${datePart}-${timePart}-${suffix}`;
  }

  private generateTransferBatchNumber() {
    return `${this.generateTransferTicketNumber()}-GRUPO`;
  }
}
