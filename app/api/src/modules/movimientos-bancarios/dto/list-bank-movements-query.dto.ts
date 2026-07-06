import { IsEnum, IsOptional } from 'class-validator';
import { BankMovementType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListBankMovementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BankMovementType)
  movementType?: BankMovementType;
}
