import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoiceSource, SaleMode } from '@prisma/client';
import { CreateInvoiceItemDto } from './create-invoice-item.dto';

export class CreateInvoiceDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  createdByUserId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsOptional()
  @IsEnum(InvoiceSource)
  source?: InvoiceSource;

  @IsOptional()
  @IsEnum(SaleMode)
  saleMode?: SaleMode;

  @IsOptional()
  @IsDateString({}, {
    message: 'La fecha de vencimiento del crédito no es válida.',
  })
  creditDueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  priceLevel?: number;

  @IsOptional()
  zone?: string;

  @IsOptional()
  city?: string;

  @IsOptional()
  station?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  referralDiscount?: number;
}
