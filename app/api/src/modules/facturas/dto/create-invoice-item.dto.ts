import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  Validate,
} from 'class-validator';
import { HasProductIdentifierConstraint } from '../../../shared/products/validators/has-product-identifier.validator';

export class CreateInvoiceItemDto {
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
}
