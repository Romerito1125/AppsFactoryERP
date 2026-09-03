import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { buildPackagingBreakdown } from '../../common/utils/packaging.util';
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

  async findByWarehouse(warehouseId: number) {
    this.ensurePositiveId(warehouseId);
    await this.ensureActiveWarehouse(warehouseId);
    const rows = await this.prisma.productWarehouse.findMany({
      where: { warehouseId },
      include: {
        product: {
          include: {
            productType: true,
            primaryProvider: true,
            packagingProfile: true,
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
      await this.ensureActiveWarehouse(dto.toWarehouseId, tx);
      const packaging = buildPackagingBreakdown(
        dto.quantity,
        product.packagingProfile,
      );
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: dto.toWarehouseId,
          },
        },
        update: { quantity: { increment: dto.quantity } },
        create: {
          productId: product.id,
          warehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
        },
      });
      return tx.inventoryMovement.create({
        data: {
          productId: product.id,
          toWarehouseId: dto.toWarehouseId,
          createdByUserId: actor.sub,
          approvedByUserId: actor.sub,
          quantity: dto.quantity,
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
      await this.ensureActiveWarehouse(dto.fromWarehouseId, tx);
      const packaging = buildPackagingBreakdown(
        dto.quantity,
        product.packagingProfile,
      );
      await this.decrementStock(
        tx,
        product.id,
        dto.fromWarehouseId,
        dto.quantity,
      );
      return tx.inventoryMovement.create({
        data: {
          productId: product.id,
          fromWarehouseId: dto.fromWarehouseId,
          createdByUserId: actor.sub,
          approvedByUserId: actor.sub,
          quantity: dto.quantity,
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
      await this.ensureActiveWarehouse(dto.fromWarehouseId, tx);
      await this.ensureActiveWarehouse(dto.toWarehouseId, tx);
      const packaging = buildPackagingBreakdown(
        dto.quantity,
        product.packagingProfile,
      );
      await this.decrementStock(
        tx,
        product.id,
        dto.fromWarehouseId,
        dto.quantity,
      );
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: dto.toWarehouseId,
          },
        },
        update: { quantity: { increment: dto.quantity } },
        create: {
          productId: product.id,
          warehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
        },
      });
      const createdMovement = await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          createdByUserId: actor.sub,
          approvedByUserId: actor.sub,
          quantity: dto.quantity,
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

  async adjustment(dto: InventoryAdjustmentDto, actor: AuthUser) {
    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await this.productResolver.resolve(dto, tx, {
        packagingProfile: true,
      });
      await this.ensureActiveWarehouse(dto.warehouseId, tx);
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
        update: { quantity: dto.quantity },
        create: {
          productId: product.id,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
        },
      });
      const difference = dto.quantity - (current?.quantity ?? 0);
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

  async findMovements(query: ListInventoryQueryDto) {
    const where = this.getMovementSearchWhere(query.q);
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

  async findMovement(id: number) {
    this.ensurePositiveId(id);
    const movement = await this.prisma.inventoryMovement.findUnique({
      where: { id },
      include: this.movementInclude,
    });
    if (!movement)
      throw new NotFoundException('Movimiento de inventario no encontrado');
    return movement;
  }

  async findTransferTickets(query: ListInventoryQueryDto) {
    const where = this.getTransferTicketSearchWhere(query.q);
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

  async findTransferTicket(id: number) {
    this.ensurePositiveId(id);

    const ticket = await this.prisma.inventoryTransferTicket.findUnique({
      where: { id },
      include: this.transferTicketInclude,
    });

    if (!ticket) {
      throw new NotFoundException('Ticket de traslado no encontrado');
    }

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
    const packaging = buildPackagingBreakdown(
      (product.warehouses ?? []).reduce(
        (sum, item) => sum + Number(item.quantity ?? 0),
        0,
      ),
      product.packagingProfile,
    );

    return {
      ...product,
      provider: product.primaryProvider,
      providers: (product.providers ?? []).map((item) => ({
        ...item.provider,
        isPrimary: item.providerId === product.providerId,
      })),
      packagingSummary: packaging,
    };
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
}
