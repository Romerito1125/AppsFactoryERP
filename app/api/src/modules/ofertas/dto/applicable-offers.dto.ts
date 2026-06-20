import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class ApplicableOfferItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productPriceId?: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class ApplicableOffersDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApplicableOfferItemDto)
  items: ApplicableOfferItemDto[];
}
