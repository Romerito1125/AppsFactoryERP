import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateRetentionRangeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimum: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximum: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentage: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateRetentionDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(2)
  description: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtracting?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumBase?: number;

  @IsOptional()
  @IsString()
  operationCode?: string;

  @IsOptional()
  @IsString()
  operationDescription?: string;

  @IsOptional()
  @IsBoolean()
  applySales?: boolean;

  @IsOptional()
  @IsBoolean()
  applyPurchases?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRetentionRangeDto)
  ranges?: CreateRetentionRangeDto[];
}
