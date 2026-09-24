import { UnitType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ProductResolverService } from '../../shared/products/product-resolver.service';
import { FacturasService } from './facturas.service';

describe('FacturasService inventory integration', () => {
  it('decrements the selected warehouse in base stock units', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new FacturasService(
      {} as PrismaService,
      {} as NotificacionesService,
      {} as ProductResolverService,
      {} as AuditLogService,
    );
    const decrementInvoiceStock = (
      service as unknown as {
        decrementInvoiceStock: (tx: unknown, items: unknown[]) => Promise<void>;
      }
    ).decrementInvoiceStock.bind(service);

    await decrementInvoiceStock(
      { productWarehouse: { updateMany } },
      [
        {
          productId: 10,
          quantity: 3,
          warehouseId: 4,
          productPriceId: 20,
          product: {
            id: 10,
            name: 'Producto por caja',
            unit: UnitType.UND,
            packagingProfile: {
              unitsPerPackage: 10,
              packagesPerBox: 2,
            },
            prices: [
              { id: 20, quantity: 1, unit: UnitType.CAJA },
            ],
          },
        },
      ],
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        productId: 10,
        warehouseId: 4,
        quantity: { gte: 60 },
      },
      data: { quantity: { decrement: 60 } },
    });
  });
});
