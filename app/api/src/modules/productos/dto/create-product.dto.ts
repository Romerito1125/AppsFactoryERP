import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
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

export class CreateProductDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productTypeId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  providerId: number;

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
