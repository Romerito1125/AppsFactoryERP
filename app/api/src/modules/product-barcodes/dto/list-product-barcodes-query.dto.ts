import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { BarcodeType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatusQuery } from '../../../common/enums/record-status-query.enum';

export class ListProductBarcodesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RecordStatusQuery)
  estado?: RecordStatusQuery;

  @IsOptional()
  @IsEnum(BarcodeType)
  type?: BarcodeType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId?: number;
}
