import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderItemDto } from './purchase-order-item.dto';

export class CreatePurchaseOrderDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  providerId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  orderedAt?: string;

  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  documentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentMimeType?: string;

  @IsOptional()
  @IsString()
  documentData?: string;

  // --- Total operación (condiciones comerciales de la compra) ---
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount1Percent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount2Percent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freight?: number;

  // Base de retención (antes de IVA). Si difiere de la calculada exige permiso y motivo.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  retentionBase?: number;

  // true cuando el usuario corrigió la base calculada (exige permiso y motivo).
  @IsOptional()
  @IsBoolean()
  retentionBaseEdited?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  retentionBaseReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  retentionRate?: number;

  @IsOptional()
  @IsIn(['CONTADO', 'CREDITO'])
  paymentCondition?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  operationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  purchaseOrderRef?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}
