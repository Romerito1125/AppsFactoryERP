import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CuentasBancariasController } from './cuentas-bancarias.controller';
import { CuentasBancariasService } from './cuentas-bancarias.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CuentasBancariasController],
  providers: [CuentasBancariasService, PermissionsGuard],
})
export class CuentasBancariasModule {}
