import { Module } from '@nestjs/common';
import { OfertasController } from './ofertas.controller';
import { OfertasService } from './ofertas.service';
import { AuthModule } from '../auth/auth.module';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Module({
  controllers: [OfertasController],
  imports: [AuthModule],
  providers: [OfertasService, PermissionsGuard],
})
export class OfertasModule {}
