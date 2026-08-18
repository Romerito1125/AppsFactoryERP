import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  IsNumber,
  Min,
  Validate,
} from 'class-validator';
import { HasProductIdentifierConstraint } from '../../../shared/products/validators/has-product-identifier.validator';

export class CreateInvoiceItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId?: number;
  @Validate(HasProductIdentifierConstraint)
  private readonly productIdentifier?: never;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;

  @IsOptional()
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;
}
