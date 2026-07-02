import { Module } from '@nestjs/common';
import { StorageModule } from '../../shared/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { ProductProfitService } from './product-profit.service';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ProductosController],
  providers: [ProductosService, ProductProfitService],
})
export class ProductosModule {}
