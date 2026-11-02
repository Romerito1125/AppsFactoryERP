import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AdvanceStatus } from '@prisma/client';

export class CreateAdvanceDto {
  @Type(() => Number) @IsInt() @IsPositive() clientId: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
  @Type(() => Number) @IsInt() @IsPositive() bankAccountId: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class ApplyAdvanceDto {
  @Type(() => Number) @IsInt() @IsPositive() creditId: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount: number;
}

export class RefundAdvanceDto {
  @Type(() => Number) @IsInt() @IsPositive() bankAccountId: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class VoidAdvanceDto {
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class ListAdvancesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() clientId?: number;
  @IsOptional() @IsEnum(AdvanceStatus) status?: AdvanceStatus;
}
