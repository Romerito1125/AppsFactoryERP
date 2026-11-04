import { IsCop } from '../../../common/validators/is-cop.decorator';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

// Una línea de pago de una venta de contado. Debe indicar una cuenta bancaria
// (ingreso) o un anticipo/saldo a favor del cliente (sin movimiento bancario).
export class CreateInvoicePaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  bankAccountId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  advanceId?: number;

  // Pago con bonus / miembro fiel: descuenta del saldo de beneficios del cliente.
  @IsOptional()
  @IsBoolean()
  bonus?: boolean;

  @Type(() => Number)
  @IsCop()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
