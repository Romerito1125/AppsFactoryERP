import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ReceiptKind } from '@prisma/client';

const SUPPORT_PATTERN = /^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i;

export class ReceiptInstrumentDto {
  @Type(() => Number) @IsInt() @IsPositive() bankAccountId: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

export class ReceiptAllocationDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() creditId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() purchaseOrderId?: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) retention?: number;
}

export class CreateReceiptDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() clientId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() providerId?: number;

  // Número de documento: es el ticket del pago o del abono.
  @IsString() @MinLength(1) @MaxLength(40) documentNumber: string;
  @IsString() @MinLength(2) @MaxLength(200) detail: string;
  @IsOptional() @IsDateString() paidAt?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  allocations: ReceiptAllocationDto[];

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cashAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() cashAccountId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ReceiptInstrumentDto)
  instruments?: ReceiptInstrumentDto[];

  @IsOptional() @IsString() @MaxLength(1000) comments?: string;
  @IsOptional() @IsString() @MaxLength(80) operationType?: string;
  @IsOptional() @IsString() @MaxLength(120) sellerName?: string;

  @IsOptional() @IsString() @MaxLength(200) supportName?: string;
  @IsOptional() @IsString() @MaxLength(100) supportMimeType?: string;
  @IsOptional()
  @IsString()
  @MaxLength(8_000_000)
  @Matches(SUPPORT_PATTERN, { message: 'El soporte debe ser una imagen o un PDF' })
  supportData?: string;
}

export class UpdateReceiptDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) documentNumber?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) detail?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) comments?: string;
  @IsOptional() @IsString() @MaxLength(80) operationType?: string;
  @IsOptional() @IsString() @MaxLength(120) sellerName?: string;
  @IsOptional() @IsBoolean() removeSupport?: boolean;
  @IsOptional() @IsString() @MaxLength(200) supportName?: string;
  @IsOptional() @IsString() @MaxLength(100) supportMimeType?: string;
  @IsOptional()
  @IsString()
  @MaxLength(8_000_000)
  @Matches(SUPPORT_PATTERN, { message: 'El soporte debe ser una imagen o un PDF' })
  supportData?: string;
}

export class VoidReceiptDto {
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class ListReceiptsQueryDto {
  @IsOptional() @IsEnum(ReceiptKind) kind?: ReceiptKind;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() clientId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() providerId?: number;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class StatementQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
