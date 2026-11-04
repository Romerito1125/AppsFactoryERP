import { validateSync } from 'class-validator';
import { COP_MAX, IsCop } from './is-cop.decorator';

class Sample {
  @IsCop()
  price!: number;

  @IsCop({ allowNegative: true })
  adjustment!: number;
}

function errorsFor(price: number, adjustment = 0) {
  const sample = Object.assign(new Sample(), { price, adjustment });
  return validateSync(sample).map((error) => error.property);
}

describe('IsCop', () => {
  it('acepta pesos enteros', () => {
    expect(errorsFor(1234567)).toEqual([]);
    expect(errorsFor(0)).toEqual([]);
  });

  it('rechaza centavos', () => {
    expect(errorsFor(1234.5)).toContain('price');
    expect(errorsFor(4165.01)).toContain('price');
  });

  it('rechaza negativos en precios', () => {
    expect(errorsFor(-500)).toContain('price');
  });

  it('acepta negativos en ajustes cuando se permiten', () => {
    expect(errorsFor(100, -500)).toEqual([]);
  });

  it('rechaza valores por encima del máximo', () => {
    expect(errorsFor(COP_MAX + 1)).toContain('price');
  });
});
