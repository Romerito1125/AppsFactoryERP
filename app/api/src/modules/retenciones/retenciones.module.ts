import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { RetencionesController } from './retenciones.controller';
import { RetencionesService } from './retenciones.service';

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [RetencionesController],
  providers: [RetencionesService],
})
export class RetencionesModule {}
