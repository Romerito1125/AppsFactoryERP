import { Module } from '@nestjs/common';
import { SharedProductsModule } from '../../shared/products/products.module';
import { AuthModule } from '../auth/auth.module';
import { ProductBarcodesController } from './product-barcodes.controller';
import { ProductBarcodesService } from './product-barcodes.service';

@Module({
  imports: [AuthModule, SharedProductsModule],
  controllers: [ProductBarcodesController],
  providers: [ProductBarcodesService],
})
export class ProductBarcodesModule {}
