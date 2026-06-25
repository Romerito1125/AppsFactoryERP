import { Module } from '@nestjs/common';
import { TiendaController } from './tienda.controller';
import { TiendaService } from './tienda.service';

@Module({
  controllers: [TiendaController],
  providers: [TiendaService],
})
export class TiendaModule {}
