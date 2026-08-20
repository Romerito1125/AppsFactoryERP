import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ProductFavoritesService } from './product-favorites.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('productos')
@UseGuards(JwtAuthGuard)
export class ProductFavoritesController {
  constructor(
    private readonly productFavoritesService: ProductFavoritesService,
  ) {}

  @Get('favoritos/mios')
  findMine(@Req() request: AuthRequest) {
    return this.productFavoritesService.findMine(request.user.sub);
  }

  @Put(':id/favorito')
  add(
    @Param('id', ParseIntPipe) productId: number,
    @Req() request: AuthRequest,
  ) {
    return this.productFavoritesService.add(request.user.sub, productId);
  }

  @Delete(':id/favorito')
  remove(
    @Param('id', ParseIntPipe) productId: number,
    @Req() request: AuthRequest,
  ) {
    return this.productFavoritesService.remove(request.user.sub, productId);
  }
}
