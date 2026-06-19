import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class CreateInvoiceItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

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
