import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDeliveryDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
