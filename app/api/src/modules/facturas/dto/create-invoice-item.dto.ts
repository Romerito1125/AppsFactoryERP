import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateInvoiceItemDto {
  @ValidateIf((item) => !item.barcode)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;

  @ValidateIf((item) => !item.productId)
  @IsString()
  @MinLength(1)
  barcode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productPriceId?: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;
}
