import { applyDecorators } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';

// Pesos colombianos: enteros, sin centavos, hasta 12 dígitos (cabe en Decimal(14,2)).
export const COP_MAX = 999_999_999_999;

export function IsCop(options: { allowNegative?: boolean } = {}) {
  return applyDecorators(
    IsInt({ message: 'El valor en COP debe ser un número entero de pesos, sin centavos' }),
    Min(options.allowNegative ? -COP_MAX : 0),
    Max(COP_MAX),
  );
}
