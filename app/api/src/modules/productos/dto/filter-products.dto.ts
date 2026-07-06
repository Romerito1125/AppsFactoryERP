import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatusQuery } from '../../../common/enums/record-status-query.enum';

export enum ProductStockFilter {
  CON_STOCK = 'CON_STOCK',
  SIN_STOCK = 'SIN_STOCK',
  BAJO_MINIMO = 'BAJO_MINIMO',
  EN_RANGO = 'EN_RANGO',
  SOBRE_MAXIMO = 'SOBRE_MAXIMO',
}

export class FilterProductsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RecordStatusQuery)
  estado?: RecordStatusQuery;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productTypeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  providerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  warehouseId?: number;

  @IsOptional()
  @IsEnum(ProductStockFilter)
  stockStatus?: ProductStockFilter;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  barcode?: string;
}
