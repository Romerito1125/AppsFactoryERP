import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertClientCreditCapacity } from './credit-limit.util';

describe('assertClientCreditCapacity', () => {
  function transaction({ hasCredit = true, maxCredit = 100, outstanding = 30 } = {}) {
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      client: {
        findUnique: jest.fn().mockResolvedValue({ hasCredit, maxCredit }),
      },
      invoiceCredit: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { balance: outstanding },
        }),
      },
    } as unknown as Prisma.TransactionClient;
  }

  it('rejects a client without credit enabled', async () => {
    await expect(
      assertClientCreditCapacity(
        transaction({ hasCredit: false }),
        12,
        10,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a sale that exceeds the remaining limit', async () => {
    await expect(
      assertClientCreditCapacity(transaction(), 12, 71),
    ).rejects.toThrow('disponible: 70.00');
  });

  it('locks the client and allows a sale within the available limit', async () => {
    const tx = transaction();
    await expect(assertClientCreditCapacity(tx, 12, 70)).resolves.toEqual({
      limit: 100,
      outstanding: 30,
      available: 70,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
