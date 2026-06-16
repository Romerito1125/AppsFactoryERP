import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  ValidateNested,
} from 'class-validator';

export class ApplicableOfferItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

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
