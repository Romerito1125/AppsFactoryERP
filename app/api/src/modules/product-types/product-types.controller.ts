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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { FilterProductTypesDto } from './dto/filter-product-types.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';
import { ProductTypesService } from './product-types.service';

const imageUploadOptions = {
  limits: { fileSize: 5 * 1024 * 1024 },
};

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
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  create(
    @Body() createProductTypeDto: CreateProductTypeDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.productTypesService.create(createProductTypeDto, image);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductTypeDto: UpdateProductTypeDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.productTypesService.update(id, updateProductTypeDto, image);
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
