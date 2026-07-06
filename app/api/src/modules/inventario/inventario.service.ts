import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  InventoryAdjustmentDto,
  InventoryEntryDto,
  InventoryExitDto,
  InventoryTransferDto,
} from './dto/inventory-movement.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

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
          provider: true,
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

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findByProduct(productId: number) {
    this.ensurePositiveId(productId);
    await this.ensureActiveProduct(productId);
    return this.prisma.productWarehouse.findMany({
      where: { productId },
      include: {
        product: { include: { productType: true, provider: true } },
        warehouse: true,
      },
      orderBy: { warehouseId: 'asc' },
    });
  }

  async findByWarehouse(warehouseId: number) {
    this.ensurePositiveId(warehouseId);
    await this.ensureActiveWarehouse(warehouseId);
    return this.prisma.productWarehouse.findMany({
      where: { warehouseId },
      include: {
        product: { include: { productType: true, provider: true } },
        warehouse: true,
      },
      orderBy: { productId: 'asc' },
    });
  }

  entry(dto: InventoryEntryDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureActiveProduct(dto.productId, tx);
      await this.ensureActiveWarehouse(dto.toWarehouseId, tx);
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.toWarehouseId,
          },
        },
        update: { quantity: { increment: dto.quantity } },
        create: {
          productId: dto.productId,
          warehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
        },
      });
      return tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          toWarehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
          movementType: InventoryMovementType.ENTRADA,
          reason: dto.reason,
        },
        include: this.movementInclude,
      });
    });
  }

  exit(dto: InventoryExitDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureActiveProduct(dto.productId, tx);
      await this.ensureActiveWarehouse(dto.fromWarehouseId, tx);
      await this.decrementStock(
        tx,
        dto.productId,
        dto.fromWarehouseId,
        dto.quantity,
      );
      return tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          fromWarehouseId: dto.fromWarehouseId,
          quantity: dto.quantity,
          movementType: InventoryMovementType.SALIDA,
          reason: dto.reason,
        },
        include: this.movementInclude,
      });
    });
  }

  transfer(dto: InventoryTransferDto) {
    if (dto.fromWarehouseId === dto.toWarehouseId)
      throw new BadRequestException(
        'La bodega origen y destino no pueden ser iguales',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.ensureActiveProduct(dto.productId, tx);
      await this.ensureActiveWarehouse(dto.fromWarehouseId, tx);
      await this.ensureActiveWarehouse(dto.toWarehouseId, tx);
      await this.decrementStock(
        tx,
        dto.productId,
        dto.fromWarehouseId,
        dto.quantity,
      );
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.toWarehouseId,
          },
        },
        update: { quantity: { increment: dto.quantity } },
        create: {
          productId: dto.productId,
          warehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
        },
      });
      return tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
          movementType: InventoryMovementType.TRASLADO,
          reason: dto.reason,
        },
        include: this.movementInclude,
      });
    });
  }

  adjustment(dto: InventoryAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureActiveProduct(dto.productId, tx);
      await this.ensureActiveWarehouse(dto.warehouseId, tx);
      const current = await tx.productWarehouse.findUnique({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
      });
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
        update: { quantity: dto.quantity },
        create: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
        },
      });
      const difference = dto.quantity - (current?.quantity ?? 0);
      return tx.inventoryMovement.create({
        data: {
          productId: dto.productId,
          fromWarehouseId: difference < 0 ? dto.warehouseId : undefined,
          toWarehouseId: difference >= 0 ? dto.warehouseId : undefined,
          quantity: Math.abs(difference),
          movementType: InventoryMovementType.AJUSTE,
          reason: dto.reason,
        },
        include: this.movementInclude,
      });
    });
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

  private readonly movementInclude = {
    product: true,
    fromWarehouse: true,
    toWarehouse: true,
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
        { productType: { name: { contains: q, mode: 'insensitive' as const } } },
        { provider: { name: { contains: q, mode: 'insensitive' as const } } },
        { warehouses: { some: { warehouse: { location: { contains: q, mode: 'insensitive' as const } } } } },
      ],
    };
  }

  private getMovementSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { product: { name: { contains: q, mode: 'insensitive' as const } } },
        { fromWarehouse: { location: { contains: q, mode: 'insensitive' as const } } },
        { toWarehouse: { location: { contains: q, mode: 'insensitive' as const } } },
        { reason: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }
}
