import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { ProveedoresController } from './proveedores.controller';
import { ProveedoresService } from './proveedores.service';

@Module({
  imports: [PrismaModule, AuditLogModule, AuthModule],
  controllers: [ProveedoresController],
  providers: [ProveedoresService],
})
export class ProveedoresModule {}
