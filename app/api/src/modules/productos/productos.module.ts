import { Module } from '@nestjs/common';
import { SharedProductsModule } from '../../shared/products/products.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { ProductFavoritesModule } from '../product-favorites/product-favorites.module';
import { ProductProfitService } from './product-profit.service';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    SharedProductsModule,
    ProductFavoritesModule,
  ],
  controllers: [ProductosController],
  providers: [ProductosService, ProductProfitService],
})
export class ProductosModule {}
