import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
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
  @Type(() => Number) @IsInt() @IsPositive() quantity: number;
}

export class CreateQuoteDto {
  @Type(() => Number) @IsInt() @IsPositive() clientId: number;
  @IsOptional() @IsDateString() expiresAt?: string;
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
