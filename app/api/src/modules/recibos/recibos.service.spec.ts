import { RecibosService } from './recibos.service';

const actor = { sub: 5, username: 'caja@test.co', role: 'CAJERO' } as never;

function dec(value: number) {
  return value as never;
}

function setup(options: { credits?: unknown[]; orders?: unknown[]; paidMovements?: unknown[] } = {}) {
  const tx = {
    client: {
      findUnique: jest.fn().mockResolvedValue({ id: 3, firstName: 'Ana', lastName: 'Pérez' }),
    },
    provider: { findUnique: jest.fn().mockResolvedValue({ id: 9 }) },
    paymentReceipt: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, paidAt: new Date(), ...data })),
    },
    accountNote: { groupBy: jest.fn().mockResolvedValue([]) },
    invoiceCredit: {
      findMany: jest.fn().mockResolvedValue(options.credits ?? []),
      update: jest.fn(),
    },
    purchaseOrder: { findMany: jest.fn().mockResolvedValue(options.orders ?? []) },
    creditPayment: { create: jest.fn() },
    bankAccount: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, name: 'Caja', isActive: true },
        { id: 2, name: 'Bancolombia', isActive: true },
      ]),
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({ id: where.id, name: 'Cuenta', isActive: true, currentBalance: 10_000_000 }),
      ),
      update: jest.fn(),
    },
    bankAccountMovement: {
      create: jest.fn().mockResolvedValue({ id: 77 }),
      findMany: jest.fn().mockResolvedValue(options.paidMovements ?? []),
    },
  };
  const prisma = { $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
  const audit = { log: jest.fn() };
  return { service: new RecibosService(prisma as never, audit as never), tx, audit };
}

const credit = (id: number, balance: number) => ({
  id,
  clientId: 3,
  balance: dec(balance),
  paidAmount: dec(0),
  invoice: { consecutive: `FAC-${id}` },
});

describe('RecibosService.createCollection', () => {
  const base = { clientId: 3, documentNumber: 'T-100', detail: 'Abono' };

  it('reparte el abono entre documentos y mueve el banco con efectivo + cuenta', async () => {
    const { service, tx } = setup({ credits: [credit(1, 100_000), credit(2, 50_000)] });
    const receipt = await service.createCollection(
      {
        ...base,
        allocations: [
          { creditId: 1, amount: 60_000 },
          { creditId: 2, amount: 20_000, retention: 5_000 },
        ],
        cashAmount: 30_000,
        cashAccountId: 1,
        instruments: [{ bankAccountId: 2, amount: 50_000, reference: 'CONS-9' }],
      },
      actor,
    );
    expect(Number(receipt.totalAmount)).toBe(80_000);
    expect(Number(receipt.retentionTotal)).toBe(5_000);
    expect(tx.bankAccountMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.creditPayment.create).toHaveBeenCalledTimes(2);
    // 50.000 - 20.000 abono - 5.000 retención = 25.000
    expect(tx.invoiceCredit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({ balance: 25_000, status: 'PARCIAL' }),
      }),
    );
  });

  it('rechaza un desglose distinto del total', async () => {
    const { service, tx } = setup({ credits: [credit(1, 100_000)] });
    await expect(
      service.createCollection(
        {
          ...base,
          allocations: [{ creditId: 1, amount: 60_000 }],
          instruments: [{ bankAccountId: 2, amount: 50_000 }],
        },
        actor,
      ),
    ).rejects.toThrow(/desglose/);
    expect(tx.bankAccountMovement.create).not.toHaveBeenCalled();
  });

  it('rechaza abonar más que el saldo (incluida la retención)', async () => {
    const { service } = setup({ credits: [credit(1, 100_000)] });
    await expect(
      service.createCollection(
        {
          ...base,
          allocations: [{ creditId: 1, amount: 99_000, retention: 2_000 }],
          instruments: [{ bankAccountId: 2, amount: 99_000 }],
        },
        actor,
      ),
    ).rejects.toThrow(/supera el saldo/);
  });

  it('rechaza un número de documento (ticket) repetido', async () => {
    const { service, tx } = setup({ credits: [credit(1, 100_000)] });
    tx.paymentReceipt.findFirst.mockResolvedValue({ id: 99 });
    await expect(
      service.createCollection(
        { ...base, allocations: [{ creditId: 1, amount: 1_000 }], instruments: [{ bankAccountId: 2, amount: 1_000 }] },
        actor,
      ),
    ).rejects.toThrow(/ya fue usado/);
  });
});

describe('RecibosService.createPayment', () => {
  const order = (id: number, total: number) => ({
    id,
    providerId: 9,
    consecutive: `OC-${id}`,
    status: 'RECIBIDA',
    total: dec(total),
    payableTotal: dec(total),
  });

  it('descuenta de las cuentas en orden y deja un egreso por tramo con el ticket', async () => {
    const { service, tx } = setup({ orders: [order(1, 100_000), order(2, 50_000)] });
    await service.createPayment(
      {
        providerId: 9,
        documentNumber: 'T-7',
        detail: 'Pago proveedor',
        allocations: [
          { purchaseOrderId: 1, amount: 100_000 },
          { purchaseOrderId: 2, amount: 20_000 },
        ],
        cashAmount: 70_000,
        cashAccountId: 1,
        instruments: [{ bankAccountId: 2, amount: 50_000 }],
      },
      actor,
    );
    const descriptions = tx.bankAccountMovement.create.mock.calls.map(
      ([arg]: [{ data: { description: string; amount: number } }]) => arg.data.description,
    );
    // OC-1 usa 70.000 de efectivo + 30.000 de la cuenta; OC-2 usa 20.000 de la cuenta.
    expect(tx.bankAccountMovement.create).toHaveBeenCalledTimes(3);
    expect(descriptions[0]).toBe('Pago compra OC-1 - Doc T-7');
    expect(descriptions.every((text: string) => text.startsWith('Pago compra OC-'))).toBe(true);
  });

  it('no permite pagar más que el saldo pendiente de la compra', async () => {
    const { service } = setup({
      orders: [order(1, 100_000)],
      paidMovements: [{ amount: dec(90_000), description: 'Pago compra OC-1' }],
    });
    await expect(
      service.createPayment(
        {
          providerId: 9,
          documentNumber: 'T-8',
          detail: 'Pago',
          allocations: [{ purchaseOrderId: 1, amount: 20_000 }],
          instruments: [{ bankAccountId: 2, amount: 20_000 }],
        },
        actor,
      ),
    ).rejects.toThrow(/supera su saldo/);
  });
});

describe('RecibosService.voidCollection', () => {
  it('devuelve los saldos y registra un egreso por cada ingreso', async () => {
    const { service, tx } = setup();
    (tx as unknown as { paymentReceipt: Record<string, unknown> }).paymentReceipt.findUnique = jest
      .fn()
      .mockResolvedValue({
        id: 1,
        kind: 'COBRO',
        status: 'VIGENTE',
        documentNumber: 'T-100',
        instruments: [{ bankAccountId: 2, amount: 80_000 }],
        payments: [{ invoiceCreditId: 1, amount: dec(80_000), retention: dec(0) }],
      });
    (tx as unknown as { paymentReceipt: Record<string, unknown> }).paymentReceipt.update = jest
      .fn()
      .mockResolvedValue({ id: 1, receiptNumber: 'RC-1', totalAmount: dec(80_000), kind: 'COBRO' });
    (tx.invoiceCredit as unknown as Record<string, unknown>).findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ id: 1, balance: dec(20_000), paidAmount: dec(80_000) });
    await service.voidCollection(1, 'Error de digitación', actor);
    expect(tx.invoiceCredit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balance: 100_000, paidAmount: 0, status: 'PENDIENTE' }),
      }),
    );
    expect(tx.bankAccount.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { currentBalance: { increment: -80_000 } },
    });
  });
});
