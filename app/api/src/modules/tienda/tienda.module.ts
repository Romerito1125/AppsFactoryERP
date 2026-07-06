import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { TiendaController } from './tienda.controller';
import { TiendaService } from './tienda.service';

@Module({
  imports: [NotificacionesModule],
  controllers: [TiendaController],
  providers: [TiendaService],
})
export class TiendaModule {}
