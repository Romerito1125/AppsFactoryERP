import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { ProductPricesController } from './product-prices.controller';
import { ProductPricesService } from './product-prices.service';

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [ProductPricesController],
  providers: [ProductPricesService],
})
export class ProductPricesModule {}
