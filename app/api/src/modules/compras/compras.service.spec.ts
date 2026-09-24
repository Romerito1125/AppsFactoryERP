import { PurchaseOrderStatus, UnitType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ComprasService } from './compras.service';

describe('ComprasService.receive', () => {
  function setup<T>(tx: T) {
    const prisma = {
      $transaction: jest.fn((callback: (client: T) => unknown) => callback(tx)),
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({ warehouseId: 4 }),
      },
    };
    const notificacionesService = {
      createPurchaseOrderNotifications: jest.fn(),
    };
    return {
      service: new ComprasService(
        prisma as unknown as PrismaService,
        notificacionesService as unknown as NotificacionesService,
      ),
      prisma,
    };
  }

  it('returns an already received order without duplicating side effects', async () => {
    const receivedOrder = { id: 1, status: PurchaseOrderStatus.RECIBIDA };
    const tx = {
      purchaseOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(receivedOrder),
      },
      productWarehouse: { upsert: jest.fn() },
      inventoryMovement: { create: jest.fn() },
      productCost: { updateMany: jest.fn(), create: jest.fn() },
      purchaseOrderItem: { update: jest.fn() },
    };
    const { service } = setup(tx);

    await expect(service.receive(1)).resolves.toMatchObject(receivedOrder);
    expect(tx.productWarehouse.upsert).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.productCost.create).not.toHaveBeenCalled();
  });

  it('updates stock, movement, cost and received quantity after claiming the order', async () => {
    let createdCost: Record<string, unknown> | undefined;
    const createCost = jest.fn((args: { data: Record<string, unknown> }) => {
      createdCost = args.data;
      return Promise.resolve({});
    });
    const orderedOrder = {
      id: 1,
      status: PurchaseOrderStatus.RECIBIDA,
      consecutive: 'OC-1',
      warehouseId: 4,
      items: [
        {
          id: 7,
          productId: 2,
          quantity: 3,
          unit: UnitType.CAJA,
          unitCost: 12500,
          product: {
            unit: UnitType.UND,
            packagingProfile: {
              unitsPerPackage: 10,
              packagesPerBox: 2,
            },
          },
        },
      ],
    };
    const receivedOrder = { ...orderedOrder, items: [] };
    const tx = {
      purchaseOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(orderedOrder)
          .mockResolvedValueOnce(receivedOrder),
      },
      productWarehouse: { upsert: jest.fn().mockResolvedValue({}) },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      productCost: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: createCost,
      },
      purchaseOrderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    const { service } = setup(tx);

    await expect(service.receive(1)).resolves.toMatchObject(receivedOrder);
    expect(tx.productWarehouse.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { quantity: { increment: 60 } },
      }),
    );
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        productId: 2,
        toWarehouseId: 4,
        quantity: 60,
        movementType: 'ENTRADA',
        reason: 'Recepción de OC-1',
        purchaseOrderItemId: 7,
      },
    });
    expect(createCost).toHaveBeenCalledTimes(1);
    expect(createdCost).toMatchObject({
      productId: 2,
      unit: UnitType.UND,
      purchaseOrderItemId: 7,
    });
    expect(Number(createdCost?.cost)).toBe(625);
    expect(tx.purchaseOrderItem.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { receivedQuantity: 3 },
    });
  });
});

describe('ComprasService purchase products', () => {
  it('allows a purchase provider to supply a product without a provider link', async () => {
    const products = [
      {
        id: 5,
        name: 'Producto de prueba',
        isActive: true,
        unit: UnitType.UND,
        packagingProfile: null,
      },
    ];
    const tx = {
      product: {
        findMany: jest.fn().mockResolvedValue(products),
      },
    };
    const service = new ComprasService(
      {} as PrismaService,
      {} as NotificacionesService,
    );
    const ensurePurchasableProducts = (
      service as unknown as {
        ensurePurchasableProducts: (
          transaction: never,
          productIds: number[],
        ) => Promise<typeof products>;
      }
    ).ensurePurchasableProducts;

    await expect(ensurePurchasableProducts(tx, [5])).resolves.toEqual(products);
    expect(tx.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: [5] } },
      select: {
        id: true,
        name: true,
        isActive: true,
        unit: true,
        packagingProfile: {
          select: { unitsPerPackage: true, packagesPerBox: true },
        },
      },
    });
  });
});

describe('ComprasService.order notifications', () => {
  it('notifies the assigned warehouse when a draft is ordered', async () => {
    const updatedOrder = {
      id: 9,
      consecutive: 'OC-9',
      warehouseId: 3,
      total: 1200,
      provider: { name: 'Proveedor de prueba' },
      warehouse: { location: 'Bodega Principal' },
      items: [{ id: 1 }, { id: 2 }],
    };
    const tx = {
      purchaseOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          providerId: 4,
          warehouseId: 3,
          items: [{ productId: 5 }, { productId: 6 }],
        }),
        update: jest.fn().mockResolvedValue(updatedOrder),
      },
    };
    const notificacionesService = {
      createPurchaseOrderNotifications: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new ComprasService(
      prisma as unknown as PrismaService,
      notificacionesService as unknown as NotificacionesService,
    );
    jest.spyOn(service as never, 'ensureActiveProvider' as never).mockResolvedValue(undefined);
    jest.spyOn(service as never, 'ensureActiveWarehouse' as never).mockResolvedValue(undefined);
    jest.spyOn(service as never, 'ensurePurchasableProducts' as never).mockResolvedValue([]);

    await expect(service.order(9)).resolves.toMatchObject(updatedOrder);
    expect(notificacionesService.createPurchaseOrderNotifications).toHaveBeenCalledWith(tx, {
      purchaseOrderId: 9,
      consecutive: 'OC-9',
      providerName: 'Proveedor de prueba',
      warehouseId: 3,
      warehouseName: 'Bodega Principal',
      itemCount: 2,
      total: 1200,
    });
  });
});
