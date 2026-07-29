import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductFavoritesController } from './product-favorites.controller';
import { ProductFavoritesService } from './product-favorites.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductFavoritesController],
  providers: [ProductFavoritesService],
})
export class ProductFavoritesModule {}
