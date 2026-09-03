import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CreateProductPriceDto } from './dto/create-product-price.dto';
import { FilterProductPricesDto } from './dto/filter-product-prices.dto';
import { UpdateProductPriceDto } from './dto/update-product-price.dto';
import { ProductPricesService } from './product-prices.service';

type AuthRequest = Request & { user: AuthUser };

@Controller()
export class ProductPricesController {
  constructor(private readonly productPricesService: ProductPricesService) {}

  @Get('precios-producto')
  findAll(@Query() query: FilterProductPricesDto) {
    return this.productPricesService.findAll(query);
  }

  @Get('precios-producto/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productPricesService.findOne(id);
  }

  @Get('productos/:id/precios')
  findByProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productPricesService.findByProduct(id);
  }

  @Post('productos/:id/precios')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() createProductPriceDto: CreateProductPriceDto,
    @Req() request: AuthRequest,
  ) {
    return this.productPricesService.create(
      id,
      createProductPriceDto,
      request.user,
    );
  }

  @Patch('precios-producto/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductPriceDto: UpdateProductPriceDto,
    @Req() request: AuthRequest,
  ) {
    return this.productPricesService.update(
      id,
      updateProductPriceDto,
      request.user,
    );
  }

  @Delete('precios-producto/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.productPricesService.remove(id, request.user);
  }

  @Patch('precios-producto/:id/default')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  markDefault(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthRequest,
  ) {
    return this.productPricesService.markDefault(id, request.user);
  }

  @Get('precios-producto/:id/historial')
  history(@Param('id', ParseIntPipe) id: number) {
    return this.productPricesService.history(id);
  }
}
