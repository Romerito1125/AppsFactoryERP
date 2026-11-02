import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { NotasController } from './notas.controller';
import { NotasService } from './notas.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [NotasController],
  providers: [NotasService, PermissionsGuard],
})
export class NotasModule {}
