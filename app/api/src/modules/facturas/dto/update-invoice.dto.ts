import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  consecutive?: string;
}
