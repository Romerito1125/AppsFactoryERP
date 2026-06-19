import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateDeliveryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  invoiceId: number;

  @IsString()
  @MinLength(5)
  address: string;

  @IsString()
  @MinLength(2)
  recipientName: string;

  @IsString()
  @MinLength(5)
  recipientPhone: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
