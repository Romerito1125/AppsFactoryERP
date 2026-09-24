import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportesController],
  providers: [ReportesService, PermissionsGuard],
})
export class ReportesModule {}
