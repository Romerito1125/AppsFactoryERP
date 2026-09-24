import { UnitType } from '@prisma/client';
import {
  convertProductQuantityToBase,
  convertProductUnitCost,
  getProductStockStatus,
} from './product-quantity.util';

describe('product quantity conversion', () => {
  const packaging = { unitsPerPackage: 10, packagesPerBox: 2 };

  it('converts packages and boxes to the product stock unit', () => {
    expect(
      convertProductQuantityToBase(3, UnitType.CAJA, UnitType.UND, packaging),
    ).toBe(60);
    expect(
      convertProductQuantityToBase(3, UnitType.PAQUETE, UnitType.UND, packaging),
    ).toBe(30);
    expect(
      convertProductQuantityToBase(3, UnitType.UND, UnitType.UND, packaging),
    ).toBe(3);
  });

  it('normalizes the cost of a commercial package to one stock unit', () => {
    expect(
      convertProductUnitCost(12500, UnitType.CAJA, UnitType.UND, packaging),
    ).toBe(625);
  });

  it('rejects packaging conversion without a configured profile', () => {
    expect(
      convertProductQuantityToBase(1, UnitType.CAJA, UnitType.UND, null),
    ).toBeNull();
  });
});

describe('stock semaphore', () => {
  it('returns red, green and yellow according to configured thresholds', () => {
    expect(getProductStockStatus(0, 2, 20)).toBe('ROJO');
    expect(getProductStockStatus(10, 2, 20)).toBe('VERDE');
    expect(getProductStockStatus(20, 2, 20)).toBe('AMARILLO');
  });
});
