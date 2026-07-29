import { PurchaseOrderStatus, UnitType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ComprasService } from './compras.service';

describe('ComprasService.receive', () => {
  function setup<T>(tx: T) {
    const prisma = {
      $transaction: jest.fn((callback: (client: T) => unknown) => callback(tx)),
    };
    return {
      service: new ComprasService(prisma as unknown as PrismaService),
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

    await expect(service.receive(1)).resolves.toBe(receivedOrder);
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

    await expect(service.receive(1)).resolves.toBe(receivedOrder);
    expect(tx.productWarehouse.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { quantity: { increment: 3 } },
      }),
    );
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        productId: 2,
        toWarehouseId: 4,
        quantity: 3,
        movementType: 'ENTRADA',
        reason: 'Recepción de OC-1',
        purchaseOrderItemId: 7,
      },
    });
    expect(createCost).toHaveBeenCalledTimes(1);
    expect(createdCost).toMatchObject({
      productId: 2,
      cost: 12500,
      unit: UnitType.CAJA,
      purchaseOrderItemId: 7,
    });
    expect(tx.purchaseOrderItem.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { receivedQuantity: 3 },
    });
  });
});
