import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CuentasBancariasController } from './cuentas-bancarias.controller';
import { CuentasBancariasService } from './cuentas-bancarias.service';

@Module({
  imports: [PrismaModule],
  controllers: [CuentasBancariasController],
  providers: [CuentasBancariasService],
})
export class CuentasBancariasModule {}
