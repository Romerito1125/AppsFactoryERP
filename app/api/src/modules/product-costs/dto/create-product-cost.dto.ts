import { UnitType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
} from 'class-validator';

export class CreateProductCostDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  cost: number;

  @IsEnum(UnitType)
  unit: UnitType;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
