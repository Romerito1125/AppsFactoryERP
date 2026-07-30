import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { SharedProductsModule } from '../../shared/products/products.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';

@Module({
  imports: [PrismaModule, SharedProductsModule, AuditLogModule, AuthModule],
  controllers: [InventarioController],
  providers: [InventarioService],
})
export class InventarioModule {}
