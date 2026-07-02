import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductCostsController } from './product-costs.controller';
import { ProductCostsService } from './product-costs.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductCostsController],
  providers: [ProductCostsService],
})
export class ProductCostsModule {}
