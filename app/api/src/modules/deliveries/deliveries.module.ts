import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Module({
  imports: [AuthModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, PermissionsGuard],
})
export class DeliveriesModule {}
