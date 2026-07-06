import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatusQuery } from '../../../common/enums/record-status-query.enum';

export class FilterOffersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RecordStatusQuery)
  estado?: RecordStatusQuery;
}
