import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateRetentionRangeDto } from './create-retention.dto';

export class UpdateRetentionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

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
