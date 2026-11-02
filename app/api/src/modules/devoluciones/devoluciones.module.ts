import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { DevolucionesController } from './devoluciones.controller';
import { DevolucionesService } from './devoluciones.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [DevolucionesController],
  providers: [DevolucionesService, PermissionsGuard],
})
export class DevolucionesModule {}
