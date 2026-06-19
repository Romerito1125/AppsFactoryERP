import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateProductPriceDto } from './dto/create-product-price.dto';
import { UpdateProductPriceDto } from './dto/update-product-price.dto';
import { ProductPricesService } from './product-prices.service';

@Controller()
export class ProductPricesController {
  constructor(private readonly productPricesService: ProductPricesService) {}

  @Get('precios-producto')
  findAll() {
    return this.productPricesService.findAll();
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
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() createProductPriceDto: CreateProductPriceDto,
  ) {
    return this.productPricesService.create(id, createProductPriceDto);
  }

  @Patch('precios-producto/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductPriceDto: UpdateProductPriceDto,
  ) {
    return this.productPricesService.update(id, updateProductPriceDto);
  }

  @Delete('precios-producto/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productPricesService.remove(id);
  }

  @Patch('precios-producto/:id/default')
  markDefault(@Param('id', ParseIntPipe) id: number) {
    return this.productPricesService.markDefault(id);
  }
}
