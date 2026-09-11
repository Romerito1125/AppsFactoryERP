import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { ReferralStatsService } from './referral-stats.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [ClientesController],
  providers: [ClientesService, ReferralStatsService, PermissionsGuard],
})
export class ClientesModule {}
