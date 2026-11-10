import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { CreditStatus } from '@prisma/client';

export class CreateInvoiceCreditDto {
  @IsDateString() dueDate: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  totalAmount?: number;
}

export class CreateCreditPaymentDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  bankAccountId?: number;
  @IsOptional() @IsString() notes?: string;
  // Número de consignación/transferencia o recibo externo.
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  // Soporte persistente (imagen/PDF en data URL, hasta 8 MB codificados).
  @IsOptional() @IsString() @MaxLength(8_000_000) supportData?: string;
  @IsOptional() @IsString() @MaxLength(200) supportName?: string;
  @IsOptional() @IsString() @MaxLength(100) supportMimeType?: string;
}

export class UpdateCreditStatusDto {
  @IsEnum(CreditStatus) status: CreditStatus;
}
