import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FilterProductPricesDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['ACTIVOS', 'INACTIVOS', 'DEFAULT', 'TODOS'])
  estado?: 'ACTIVOS' | 'INACTIVOS' | 'DEFAULT' | 'TODOS';
}
