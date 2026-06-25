import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateInvoiceItemDto } from '../../facturas/dto/create-invoice-item.dto';

export class CreateStoreOrderDeliveryDto {
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

export class CreateStoreOrderDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @ValidateNested()
  @Type(() => CreateStoreOrderDeliveryDto)
  delivery: CreateStoreOrderDeliveryDto;
}
