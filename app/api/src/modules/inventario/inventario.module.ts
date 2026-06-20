import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';

@Module({
  imports: [PrismaModule],
  controllers: [InventarioController],
  providers: [InventarioService],
})
export class InventarioModule {}
