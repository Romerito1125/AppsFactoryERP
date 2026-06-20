import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class InventoryEntryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

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
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

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
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

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
