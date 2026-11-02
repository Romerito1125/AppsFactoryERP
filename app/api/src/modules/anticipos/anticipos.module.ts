import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { AnticiposController } from './anticipos.controller';
import { AnticiposService } from './anticipos.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [AnticiposController],
  providers: [AnticiposService, PermissionsGuard],
  exports: [AnticiposService],
})
export class AnticiposModule {}
