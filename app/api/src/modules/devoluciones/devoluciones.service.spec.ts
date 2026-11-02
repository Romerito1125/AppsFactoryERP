import { BadRequestException } from '@nestjs/common';
import { DevolucionesService } from './devoluciones.service';

const actor = { sub: 7, username: 'caja@test.co', role: 'CAJERO' } as never;

function buildInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    consecutive: 'FAC-10',
    clientId: 3,
    status: 'ACTIVA',
    credit: null,
    items: [
      {
        id: 100,
        productId: 1,
        warehouseId: 2,
        quantity: 4,
        unitPrice: 100,
        taxRate: 19,
        subtotal: 400,
        taxAmount: 76,
        total: 476,
        productPrice: { quantity: 1, unit: 'UND' },
        product: { unit: 'UND', packagingProfile: null },
      },
    ],
    ...overrides,
  };
}

function setup(invoice: ReturnType<typeof buildInvoice>, returned: unknown[] = []) {
  const tx = {
    invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
    saleReturnItem: { groupBy: jest.fn().mockResolvedValue(returned) },
    invoiceCredit: { update: jest.fn() },
    productWarehouse: { updateMany: jest.fn() },
    clientAdvance: {
      create: jest.fn().mockResolvedValue({ id: 55 }),
      update: jest.fn(),
    },
    bankAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 1, name: 'Caja', isActive: true, currentBalance: 1_000_000 }),
      update: jest.fn(),
    },
    bankAccountMovement: { create: jest.fn().mockResolvedValue({ id: 9 }) },
    saleReturn: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 1,
          ...data,
          invoice: { consecutive: invoice.consecutive },
        }),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { log: jest.fn() };
  const service = new DevolucionesService(prisma as never, audit as never);
  return { service, tx, audit };
}

describe('DevolucionesService.create', () => {
  it('rechaza devolver más de lo disponible (vendido menos ya devuelto)', async () => {
    const { service } = setup(buildInvoice(), [
      { invoiceItemId: 100, _sum: { quantity: 3, subtotal: 300, taxAmount: 57 } },
    ]);
    await expect(
      service.create(
        { invoiceId: 10, reason: 'Defecto', items: [{ invoiceItemId: 100, quantity: 2 }] },
        actor,
      ),
    ).rejects.toThrow(/Solo se pueden devolver 1/);
  });

  it('exige elegir cómo devolver lo ya pagado en una venta de contado', async () => {
    const { service, tx } = setup(buildInvoice());
    await expect(
      service.create(
        { invoiceId: 10, reason: 'Defecto', items: [{ invoiceItemId: 100, quantity: 1 }] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.saleReturn.create).not.toHaveBeenCalled();
  });

  it('en contado con cuenta: egreso por el valor devuelto y repone inventario', async () => {
    const { service, tx } = setup(buildInvoice());
    const created = await service.create(
      {
        invoiceId: 10,
        reason: 'Defecto',
        items: [{ invoiceItemId: 100, quantity: 1 }],
        refundMethod: 'CUENTA',
        bankAccountId: 1,
      },
      actor,
    );
    expect(Number(created.total)).toBe(119); // 476 / 4
    expect(tx.bankAccount.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { currentBalance: { increment: -119 } },
    });
    expect(tx.productWarehouse.updateMany).toHaveBeenCalledWith({
      where: { productId: 1, warehouseId: 2 },
      data: { quantity: { increment: 1 } },
    });
  });

  it('en crédito reduce la deuda solo por lo devuelto y no toca el banco', async () => {
    const { service, tx } = setup(
      buildInvoice({
        credit: { id: 8, status: 'PENDIENTE', balance: 476, paidAmount: 0 },
      }),
    );
    const created = await service.create(
      { invoiceId: 10, reason: 'Defecto', items: [{ invoiceItemId: 100, quantity: 2 }] },
      actor,
    );
    expect(Number(created.creditApplied)).toBe(238);
    expect(tx.invoiceCredit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balance: 238 }),
      }),
    );
    expect(tx.bankAccountMovement.create).not.toHaveBeenCalled();
  });

  it('el excedente sobre la deuda queda como saldo a favor', async () => {
    const { service, tx } = setup(
      buildInvoice({
        credit: { id: 8, status: 'PARCIAL', balance: 100, paidAmount: 376 },
      }),
    );
    const created = await service.create(
      {
        invoiceId: 10,
        reason: 'Defecto',
        items: [{ invoiceItemId: 100, quantity: 2 }],
        refundMethod: 'SALDO_FAVOR',
      },
      actor,
    );
    expect(Number(created.creditApplied)).toBe(100);
    expect(Number(created.advanceAmount)).toBe(138);
    expect(tx.clientAdvance.create).toHaveBeenCalled();
  });

  it('la última devolución de una línea toma el resto exacto sin centavos de más', async () => {
    const { service } = setup(buildInvoice(), [
      { invoiceItemId: 100, _sum: { quantity: 3, subtotal: 300, taxAmount: 57 } },
    ]);
    const created = await service.create(
      {
        invoiceId: 10,
        reason: 'Defecto',
        items: [{ invoiceItemId: 100, quantity: 1 }],
        refundMethod: 'SALDO_FAVOR',
      },
      actor,
    );
    expect(Number(created.total)).toBe(119); // 476 - 357
  });
});
