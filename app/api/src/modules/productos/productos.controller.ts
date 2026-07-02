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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';
import { ProfitProductsQueryDto } from './dto/profit-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ParseProductMultipartInterceptor } from './interceptors/parse-product-multipart.interceptor';
import { ProductProfitService } from './product-profit.service';
import { ProductosService } from './productos.service';

const imageUploadOptions = {
  limits: { fileSize: 5 * 1024 * 1024 },
};

@Controller('productos')
export class ProductosController {
  constructor(
    private readonly productosService: ProductosService,
    private readonly productProfitService: ProductProfitService,
  ) {}

  @Get()
  findAll(@Query() filter: FilterProductsDto) {
    return this.productosService.findAll(filter);
  }

  @Get('utilidades')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  findAllProfits(@Query() query: ProfitProductsQueryDto) {
    return this.productProfitService.findAllProductProfits(query);
  }

  @Get(':id/utilidades')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  findProfits(@Param('id', ParseIntPipe) id: number) {
    return this.productProfitService.findProductProfit(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.findOne(id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('image', imageUploadOptions),
    ParseProductMultipartInterceptor,
  )
  create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.productosService.create(createProductDto, image);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('image', imageUploadOptions),
    ParseProductMultipartInterceptor,
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.productosService.update(id, updateProductDto, image);
  }

  @Patch(':id/imagen')
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  updateImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.productosService.updateImage(id, image);
  }

  @Delete(':id/imagen')
  removeImage(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.removeImage(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.remove(id);
  }

  @Patch(':id/reactivar')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.reactivate(id);
  }
}
