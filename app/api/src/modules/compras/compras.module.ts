import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';

@Module({
  imports: [AuthModule],
  controllers: [ComprasController],
  providers: [ComprasService, PermissionsGuard],
  exports: [ComprasService],
})
export class ComprasModule {}
