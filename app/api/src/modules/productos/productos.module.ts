import { Module } from '@nestjs/common';
import { StorageModule } from '../../shared/storage/storage.module';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';

@Module({
  imports: [StorageModule],
  controllers: [ProductosController],
  providers: [ProductosService],
})
export class ProductosModule {}
