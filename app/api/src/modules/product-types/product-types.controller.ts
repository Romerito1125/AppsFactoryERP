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
} from '@nestjs/common';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { FilterProductTypesDto } from './dto/filter-product-types.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';
import { ProductTypesService } from './product-types.service';

@Controller('tipos-producto')
export class ProductTypesController {
  constructor(private readonly productTypesService: ProductTypesService) {}

  @Get()
  findAll(@Query() filter: FilterProductTypesDto) {
    return this.productTypesService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productTypesService.findOne(id);
  }

  @Post()
  create(@Body() createProductTypeDto: CreateProductTypeDto) {
    return this.productTypesService.create(createProductTypeDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductTypeDto: UpdateProductTypeDto,
  ) {
    return this.productTypesService.update(id, updateProductTypeDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productTypesService.remove(id);
  }

  @Patch(':id/reactivar')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.productTypesService.reactivate(id);
  }
}
