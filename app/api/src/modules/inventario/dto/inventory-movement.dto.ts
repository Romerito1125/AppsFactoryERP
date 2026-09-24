import { Type } from 'class-transformer';
import { UnitType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  Validate,
} from 'class-validator';
import { HasProductIdentifierConstraint } from '../../../shared/products/validators/has-product-identifier.validator';

export class InventoryEntryDto {
  @Validate(HasProductIdentifierConstraint)
  private readonly productIdentifier?: never;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;

  @IsOptional()
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
  @IsEnum(UnitType)
  unit?: UnitType;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class InventoryExitDto {
  @Validate(HasProductIdentifierConstraint)
  private readonly productIdentifier?: never;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;

  @IsOptional()
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
  @IsEnum(UnitType)
  unit?: UnitType;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class InventoryTransferDto extends InventoryExitDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  toWarehouseId: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  supportNote?: string;
}

export class InventoryAdjustmentDto {
  @Validate(HasProductIdentifierConstraint)
  private readonly productIdentifier?: never;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  barcode?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;

  @IsString()
  @MinLength(3)
  reason: string;
}
