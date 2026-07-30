import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProductTypeDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
