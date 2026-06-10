import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class CreateInvoiceItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;
}
