import { NotasService } from './notas.service';

const actor = { sub: 4, username: 'conta@test.co', role: 'CONTADOR' } as never;
const dec = (value: number) => value as never;

function setup(overrides: Record<string, unknown> = {}) {
  const tx = {
    client: { findUnique: jest.fn().mockResolvedValue({ id: 3, isActive: true }) },
    provider: { findUnique: jest.fn().mockResolvedValue({ id: 9, name: 'Proveedor' }) },
    invoiceCredit: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 1, clientId: 3, balance: dec(100_000), paidAmount: dec(0), status: 'PENDIENTE' }),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 50 }),
      update: jest.fn(),
    },
    purchaseOrder: {
      findUnique: jest.fn().mockResolvedValue({
        id: 7,
        providerId: 9,
        consecutive: 'OC-7',
        status: 'RECIBIDA',
        total: dec(100_000),
        payableTotal: dec(100_000),
      }),
      findUniqueOrThrow: jest.fn(),
    },
    accountNote: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, documentNumber: 'N-1', ...data })),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    bankAccount: {
      findUnique: jest.fn().mockResolvedValue({ id: 2, name: 'Cuenta', isActive: true, currentBalance: 1_000_000 }),
      update: jest.fn(),
    },
    bankAccountMovement: {
      create: jest.fn().mockResolvedValue({ id: 5 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  const prisma = { $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
  const audit = { log: jest.fn() };
  return { service: new NotasService(prisma as never, audit as never), tx };
}

describe('NotasService (cobrar)', () => {
  it('la nota de débito crea una cuenta por cobrar por el valor del cargo', async () => {
    const { service, tx } = setup();
    const note = await service.createClientDebit(
      { clientId: 3, documentNumber: 'ND-1', detail: 'Intereses de mora', amount: 25_000 },
      actor,
    );
    expect(tx.invoiceCredit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 3, totalAmount: 25_000, balance: 25_000 }),
    });
    expect(note.creditId).toBe(50);
  });

  it('la nota de crédito baja el saldo de la cuenta sin mover el banco', async () => {
    const { service, tx } = setup();
    await service.createClientCredit(
      { clientId: 3, creditId: 1, documentNumber: 'NC-1', detail: 'Descuento pactado', amount: 40_000 },
      actor,
    );
    expect(tx.invoiceCredit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balance: 60_000, totalAmount: { decrement: 40_000 } }),
      }),
    );
    expect(tx.bankAccountMovement.create).not.toHaveBeenCalled();
  });

  it('rechaza una nota de crédito mayor al saldo pendiente', async () => {
    const { service } = setup();
    await expect(
      service.createClientCredit(
        { clientId: 3, creditId: 1, documentNumber: 'NC-2', detail: 'Exceso', amount: 150_000 },
        actor,
      ),
    ).rejects.toThrow(/saldo pendiente/);
  });

  it('no anula una nota de débito que ya tiene abonos', async () => {
    const { service, tx } = setup();
    tx.accountNote.findUnique.mockResolvedValue({
      id: 1, side: 'COBRAR', kind: 'DEBITO', status: 'VIGENTE', creditId: 1, amount: dec(100_000), balance: dec(0), documentNumber: 'ND-1',
    });
    tx.invoiceCredit.findUnique.mockResolvedValue({ id: 1, balance: dec(60_000), paidAmount: dec(40_000) });
    await expect(service.void(1, 'Error', actor)).rejects.toThrow(/abonos/);
  });
});

describe('NotasService (pagar)', () => {
  it('la nota de débito de proveedor no puede superar el saldo de la compra', async () => {
    const { service } = setup();
    await expect(
      service.createProviderDebit(
        { providerId: 9, purchaseOrderId: 7, documentNumber: 'N-9', detail: 'Retención', amount: 130_000 },
        actor,
      ),
    ).rejects.toThrow(/saldo pendiente/);
  });

  it('la nota de débito de proveedor se registra sobre la compra', async () => {
    const { service, tx } = setup();
    await service.createProviderDebit(
      { providerId: 9, purchaseOrderId: 7, documentNumber: 'N-10', detail: 'Retención', amount: 30_000 },
      actor,
    );
    expect(tx.accountNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ side: 'PAGAR', kind: 'DEBITO', purchaseOrderId: 7, amount: 30_000 }),
    });
  });

  it('el anticipo a proveedor saca el dinero de la cuenta elegida', async () => {
    const { service, tx } = setup();
    await service.createProviderAdvance(
      { providerId: 9, documentNumber: 'AN-1', detail: 'Anticipo pedido', amount: 200_000, bankAccountId: 2 },
      actor,
    );
    expect(tx.bankAccount.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { currentBalance: { increment: -200_000 } },
    });
  });

  it('anular un anticipo ya aplicado se rechaza', async () => {
    const { service, tx } = setup();
    tx.accountNote.findUnique.mockResolvedValue({
      id: 1, side: 'PAGAR', kind: 'ANTICIPO', status: 'VIGENTE', amount: dec(200_000), balance: dec(150_000), bankAccountId: 2, documentNumber: 'AN-1',
    });
    await expect(service.void(1, 'Error', actor)).rejects.toThrow(/ya se aplicó/);
  });
});
