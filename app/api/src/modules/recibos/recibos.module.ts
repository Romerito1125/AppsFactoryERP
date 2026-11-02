import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { RecibosController } from './recibos.controller';
import { RecibosService } from './recibos.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [RecibosController],
  providers: [RecibosService, PermissionsGuard],
  exports: [RecibosService],
})
export class RecibosModule {}
