import { Module } from '@nestjs/common';
import { SharedProductsModule } from '../../shared/products/products.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { TiendaController } from './tienda.controller';
import { TiendaService } from './tienda.service';

@Module({
  imports: [NotificacionesModule, SharedProductsModule],
  controllers: [TiendaController],
  providers: [TiendaService],
})
export class TiendaModule {}
