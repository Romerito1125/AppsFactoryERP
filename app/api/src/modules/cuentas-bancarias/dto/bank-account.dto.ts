import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  Min,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateBankAccountDto {
  @IsString() @MinLength(2) name: string;
  @IsString() @MinLength(2) bankName: string;
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() accountType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() currentBalance?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) gmfRate?: number;
}

export class UpdateBankAccountDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(2) bankName?: string;
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() accountType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) gmfRate?: number;
}

export class BankAmountDto {
  @Type(() => Number) @IsInt() @IsPositive() bankAccountId: number;
  @Type(() => Number) @IsNumber() @IsPositive() amount: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() invoiceId?: number;
  @IsOptional() @IsBoolean() appliesGmf?: boolean;
}

export class BankTransferDto {
  @Type(() => Number) @IsInt() @IsPositive() fromBankAccountId: number;
  @Type(() => Number) @IsInt() @IsPositive() toBankAccountId: number;
  @Type(() => Number) @IsNumber() @IsPositive() amount: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() appliesGmf?: boolean;
}

export class BankAdjustmentDto {
  @Type(() => Number) @IsInt() @IsPositive() bankAccountId: number;
  @Type(() => Number) @IsNumber() @Min(0) balance: number;
  @IsString() @MinLength(3) description: string;
}
