import { BarcodeType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

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
