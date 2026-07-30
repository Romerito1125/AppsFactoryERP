import { Module } from '@nestjs/common';
import { StorageModule } from '../../shared/storage/storage.module';
import { ProductTypesController } from './product-types.controller';
import { ProductTypesService } from './product-types.service';

@Module({
  imports: [StorageModule],
  controllers: [ProductTypesController],
  providers: [ProductTypesService],
})
export class ProductTypesModule {}
