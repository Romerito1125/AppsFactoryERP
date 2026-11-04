import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { MovimientosBancariosController } from './movimientos-bancarios.controller';
import { MovimientosBancariosService } from './movimientos-bancarios.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [MovimientosBancariosController],
  providers: [MovimientosBancariosService, PermissionsGuard],
})
export class MovimientosBancariosModule {}
