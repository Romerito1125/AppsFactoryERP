import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FacturasModule } from '../facturas/facturas.module';
import { TiendaController } from './tienda.controller';
import { TiendaService } from './tienda.service';

@Module({
  imports: [AuthModule, FacturasModule],
  controllers: [TiendaController],
  providers: [TiendaService],
})
export class TiendaModule {}
