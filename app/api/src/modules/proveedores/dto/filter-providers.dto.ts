import { IsEnum, IsOptional } from 'class-validator';
import { RecordStatusQuery } from '../../../common/enums/record-status-query.enum';

export class FilterProvidersDto {
  @IsOptional()
  @IsEnum(RecordStatusQuery)
  estado?: RecordStatusQuery;
}
