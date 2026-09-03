import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { CreateStoreOrderDto } from './dto/create-store-order.dto';
import { ListStoreOrdersQueryDto } from './dto/list-store-orders-query.dto';
import { StorefrontProductsQueryDto } from './dto/storefront-products-query.dto';
import { TiendaService } from './tienda.service';

@Controller('tienda')
export class TiendaController {
  constructor(private readonly tiendaService: TiendaService) {}

  @Get('productos')
  findProducts(@Query() query: StorefrontProductsQueryDto) {
    return this.tiendaService.findProducts(query);
  }

  @Get('productos/:id')
  findProduct(@Param('id', ParseIntPipe) id: number) {
    return this.tiendaService.findProduct(id);
  }

  @Get('categorias')
  findCategories() {
    return this.tiendaService.findCategories();
  }

  @Get('etiquetas')
  findTags() {
    return this.tiendaService.findTags();
  }

  @Get('ofertas')
  findOffers() {
    return this.tiendaService.findOffers();
  }

  @Post('pedidos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENTE)
  createOrder(
    @Body() createStoreOrderDto: CreateStoreOrderDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.tiendaService.createOrder(createStoreOrderDto, request.user);
  }

  @Get('pedidos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findOrders(@Query() query: ListStoreOrdersQueryDto) {
    return this.tiendaService.findOrders(query);
  }

  @Get('mis-pedidos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENTE)
  findMyOrders(
    @Query() query: ListStoreOrdersQueryDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.tiendaService.findClientOrders(request.user.clientId, query);
  }
}
