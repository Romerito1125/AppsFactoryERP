import { BarcodeType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateProductBarcodeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsEnum(BarcodeType)
  type?: BarcodeType;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
