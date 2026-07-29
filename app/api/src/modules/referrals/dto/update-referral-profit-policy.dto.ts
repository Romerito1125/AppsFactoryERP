import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateReferralProfitPolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  generation: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentage: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
