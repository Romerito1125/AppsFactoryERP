import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateReferralLevelDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  referralLevel: number;
}
