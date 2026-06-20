import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { MovimientosBancariosController } from './movimientos-bancarios.controller';
import { MovimientosBancariosService } from './movimientos-bancarios.service';

@Module({
  imports: [PrismaModule],
  controllers: [MovimientosBancariosController],
  providers: [MovimientosBancariosService],
})
export class MovimientosBancariosModule {}
