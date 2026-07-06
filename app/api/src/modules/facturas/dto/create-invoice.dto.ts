import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import { InvoiceSource } from '@prisma/client';
import { CreateInvoiceItemDto } from './create-invoice-item.dto';

export class CreateInvoiceDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  createdByUserId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsOptional()
  @IsEnum(InvoiceSource)
  source?: InvoiceSource;
}
