import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuoteStatus } from '@prisma/client';

export class QuoteItemDto {
  @Type(() => Number) @IsInt() @IsPositive() productId: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productPriceId?: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() quantity: number;
  // Bodega que surte esta línea (preventa).
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() warehouseId?: number;
}

export class CreateQuoteDto {
  @Type(() => Number) @IsInt() @IsPositive() clientId: number;
  @IsOptional() @IsDateString() expiresAt?: string;
  // PREVENTA: la crea el vendedor, la revisa la caja y avisa a cada bodega por sus líneas.
  @IsOptional() @IsIn(['COTIZACION', 'PREVENTA']) kind?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  priceLevel?: number;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];
}

export class UpdateQuoteDto {
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class UpdateQuoteStatusDto {
  @IsEnum(QuoteStatus) status: QuoteStatus;
}

export class SendQuoteToWarehouseDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId: number;
}

export class UpdateLineFulfillmentDto {
  @IsIn(['ATENDIDO', 'SURTIDO']) status: string;
}
