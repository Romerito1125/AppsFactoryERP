import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class InventoryEntryDto {
  @ValidateIf((item) => !item.barcode)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;

  @ValidateIf((item) => !item.productId)
  @IsString()
  @MinLength(1)
  barcode?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  toWarehouseId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class InventoryExitDto {
  @ValidateIf((item) => !item.barcode)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;

  @ValidateIf((item) => !item.productId)
  @IsString()
  @MinLength(1)
  barcode?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fromWarehouseId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class InventoryTransferDto extends InventoryExitDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  toWarehouseId: number;
}

export class InventoryAdjustmentDto {
  @ValidateIf((item) => !item.barcode)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;

  @ValidateIf((item) => !item.productId)
  @IsString()
  @MinLength(1)
  barcode?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @IsString()
  @MinLength(3)
  reason: string;
}
