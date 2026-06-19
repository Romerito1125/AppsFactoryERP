import { Type } from 'class-transformer';
import { IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateReferralDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  referredClientId: number;

  @IsString()
  @MinLength(3)
  codeUsed: string;
}
