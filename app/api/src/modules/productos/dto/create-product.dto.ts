import { BarcodeType, UnitType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateInitialProductPriceDto {
  @IsString()
  @MinLength(2)
  name: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  price: number;

  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class ProductPackagingProfileDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  unitsPerPackage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  packagesPerBox?: number;

  @IsOptional()
  @IsBoolean()
  saleByUnitOnly?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateProductDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productTypeId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  providerId: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  providerIds?: number[];

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRate: number;

  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;

  @IsString()
  @MinLength(1)
  brand: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumStock: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumStock?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  tagIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInitialProductPriceDto)
  prices?: CreateInitialProductPriceDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInitialProductWarehouseDto)
  warehouses?: CreateInitialProductWarehouseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductBarcodeDto)
  barcodes?: CreateProductBarcodeDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductPackagingProfileDto)
  packaging?: ProductPackagingProfileDto;
}

export class CreateProductBarcodeDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsOptional()
  @IsEnum(BarcodeType)
  type?: BarcodeType;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateInitialProductWarehouseDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;
}
