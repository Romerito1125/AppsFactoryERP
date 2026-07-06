import { Module } from '@nestjs/common';
import { BarcodeFormatService } from './barcode-format.service';
import { ProductResolverService } from './product-resolver.service';

@Module({
  providers: [BarcodeFormatService, ProductResolverService],
  exports: [BarcodeFormatService, ProductResolverService],
})
export class SharedProductsModule {}
