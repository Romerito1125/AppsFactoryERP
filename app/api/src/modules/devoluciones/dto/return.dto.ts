import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ReturnRefundMethod } from '@prisma/client';

export class CreateReturnItemDto {
  @Type(() => Number) @IsInt() @IsPositive() invoiceItemId: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() quantity: number;
}

export class CreateReturnDto {
  @Type(() => Number) @IsInt() @IsPositive() invoiceId: number;
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items: CreateReturnItemDto[];

  // Solo se exige cuando la devolución excede la deuda pendiente del crédito
  // (o la factura fue de contado): devolver en dinero o dejar saldo a favor.
  @IsOptional() @IsEnum(ReturnRefundMethod) refundMethod?: ReturnRefundMethod;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() bankAccountId?: number;
}

export class ListReturnsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() invoiceId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() clientId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() productId?: number;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
