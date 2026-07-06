import { Module } from '@nestjs/common';
import { SharedProductsModule } from '../../shared/products/products.module';
import { AuthModule } from '../auth/auth.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { FacturasController } from './facturas.controller';
import { FacturasService } from './facturas.service';

@Module({
  imports: [NotificacionesModule, AuthModule, SharedProductsModule],
  controllers: [FacturasController],
  providers: [FacturasService],
})
export class FacturasModule {}
