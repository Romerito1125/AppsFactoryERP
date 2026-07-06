import { IsEnum, IsOptional } from 'class-validator';
import { CreditStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListCreditsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CreditStatus)
  status?: CreditStatus;
}
