import { IsEnum, IsOptional } from 'class-validator';
import { DeliveryStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListStoreOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;
}
