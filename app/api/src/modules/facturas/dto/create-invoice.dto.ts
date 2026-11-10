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
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoiceSource, SaleMode } from '@prisma/client';
import { CreateInvoiceItemDto } from './create-invoice-item.dto';
import { CreateInvoicePaymentDto } from './create-invoice-payment.dto';

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

  // Preventa/cotización que se factura (conversión única).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quoteId?: number;

  // Persona que vendió y cajero que registra/cobra la factura se guardan por separado.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  sellerUserId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  cashierUserId?: number;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoicePaymentDto)
  payments?: CreateInvoicePaymentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentSupportName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentSupportMimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000_000)
  @Matches(/^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i, {
    message: 'El soporte debe ser una imagen o un PDF',
  })
  paymentSupportData?: string;

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
