import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';

@Module({
  imports: [AuthModule, NotificacionesModule],
  controllers: [ComprasController],
  providers: [ComprasService, PermissionsGuard],
  exports: [ComprasService],
})
export class ComprasModule {}
