import { IsEnum, IsOptional } from 'class-validator';
import { QuoteStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListQuotesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;
}
