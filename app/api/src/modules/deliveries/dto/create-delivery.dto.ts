import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  assignedUserId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryFee?: number;
}
