import { IsCop } from '../../../common/validators/is-cop.decorator';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePurchasePaymentDto {
  @Type(() => Number)
  @IsCop()
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
