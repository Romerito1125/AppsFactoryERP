import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { CreditStatus } from '@prisma/client';

export class CreateInvoiceCreditDto {
  @IsDateString() dueDate: string;
}

export class CreateCreditPaymentDto {
  @Type(() => Number) @IsNumber() @IsPositive() amount: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  bankAccountId?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCreditStatusDto {
  @IsEnum(CreditStatus) status: CreditStatus;
}
