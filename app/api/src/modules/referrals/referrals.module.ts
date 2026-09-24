import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, PermissionsGuard],
})
export class ReferralsModule {}
