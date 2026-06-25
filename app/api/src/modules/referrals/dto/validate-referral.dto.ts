import { Type } from 'class-transformer';
import { IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class ValidateReferralDto {
  @IsString()
  @MinLength(3)
  codeUsed: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  referredClientId: number;
}
