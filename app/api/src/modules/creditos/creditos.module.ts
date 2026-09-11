import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { CreditosController } from './creditos.controller';
import { CreditosService } from './creditos.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CreditosController],
  providers: [CreditosService, PermissionsGuard],
})
export class CreditosModule {}
