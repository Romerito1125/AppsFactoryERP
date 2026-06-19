import { DeliveryStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
}
