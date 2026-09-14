import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePurchasePaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  bankAccountId: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
