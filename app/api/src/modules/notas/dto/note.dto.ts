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
  MinLength,
} from 'class-validator';
import { AccountSide } from '@prisma/client';

export class CreateNoteDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() clientId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() providerId?: number;
  // Cuenta por cobrar (nota de crédito) a la que se aplica.
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() creditId?: number;
  // Compra a la que se aplica (notas de proveedor).
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() purchaseOrderId?: number;
  @IsString() @MinLength(1) @MaxLength(40) documentNumber: string;
  @IsString() @MinLength(2) @MaxLength(300) detail: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsOptional() @IsDateString() dueDate?: string;
  // Cuenta de la que sale el anticipo a un proveedor.
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() bankAccountId?: number;
}

export class ApplyAdvanceNoteDto {
  @Type(() => Number) @IsInt() @IsPositive() purchaseOrderId: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
}

export class VoidNoteDto {
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class ListNotesQueryDto {
  @IsOptional() @IsEnum(AccountSide) side?: AccountSide;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() clientId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() providerId?: number;
}
