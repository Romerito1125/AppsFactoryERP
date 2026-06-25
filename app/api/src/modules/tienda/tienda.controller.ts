import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CreateStoreOrderDto } from './dto/create-store-order.dto';
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
  createOrder(@Body() createStoreOrderDto: CreateStoreOrderDto) {
    return this.tiendaService.createOrder(createStoreOrderDto);
  }

  @Get('pedidos')
  findOrders() {
    return this.tiendaService.findOrders();
  }
}
