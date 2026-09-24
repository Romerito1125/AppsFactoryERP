import {
  InvoiceSource,
  NotificationPriority,
  NotificationType,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotificacionesService } from './notificaciones.service';

describe('NotificacionesService purchase orders', () => {
  it('notifies active Bodega users assigned to the purchase warehouse', async () => {
    const tx = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 17 }, { id: 18 }]),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new NotificacionesService({} as PrismaService);

    await service.createPurchaseOrderNotifications(tx as never, {
      purchaseOrderId: 41,
      consecutive: 'OC-41',
      providerName: 'Proveedor Demo',
      warehouseId: 3,
      warehouseName: 'Bodega Principal',
      itemCount: 2,
      total: 69020,
    });

    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        role: Role.BODEGA,
        warehouseId: 3,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: NotificationType.BODEGA_TAREA,
          title: 'Nueva compra ordenada para Bodega',
          actionView: 'purchase-order',
          actionEntityId: 41,
          priority: NotificationPriority.IMPORTANTE,
          recipientUserId: 17,
        }),
        expect.objectContaining({ recipientUserId: 18 }),
      ],
    });
  });

  it('keeps a global notification when no Bodega user is assigned yet', async () => {
    const tx = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new NotificacionesService({} as PrismaService);

    await service.createPurchaseOrderNotifications(tx as never, {
        purchaseOrderId: 42,
        consecutive: 'OC-42',
        providerName: 'Proveedor Demo',
        warehouseId: 4,
        warehouseName: 'Bodega B',
        itemCount: 1,
        total: 37500,
      });

    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          actionView: 'purchase-order',
          actionEntityId: 42,
          recipientUserId: null,
        }),
      ],
    });
  });

  it('routes app invoices only to Bodega users assigned to the invoice warehouse', async () => {
    const tx = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 33 }]),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };
    const service = new NotificacionesService({} as PrismaService);

    await service.createInvoiceNotification(tx as never, {
      id: 99,
      consecutive: 'APP-99',
      source: InvoiceSource.APP_MOVIL,
      total: 12000,
      client: { firstName: 'Cliente', lastName: 'Demo' },
      warehouseId: 4,
      items: [{ warehouseId: 4 }],
    });

    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        role: Role.BODEGA,
        warehouseId: { in: [4] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ recipientUserId: 33, invoiceId: 99 })],
    });
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});
