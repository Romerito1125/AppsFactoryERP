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
  UseGuards,
} from '@nestjs/common';
import { ListProductBarcodesQueryDto } from './dto/list-product-barcodes-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductBarcodeDto } from './dto/create-product-barcode.dto';
import { UpdateProductBarcodeDto } from './dto/update-product-barcode.dto';
import { ProductBarcodesService } from './product-barcodes.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.BODEGA, Role.VENDEDOR)
@Controller()
export class ProductBarcodesController {
  constructor(
    private readonly productBarcodesService: ProductBarcodesService,
  ) {}

  @Get('codigos-barras')
  findAll(@Query() query: ListProductBarcodesQueryDto) {
    return this.productBarcodesService.findAll(query);
  }

  @Get('codigos-barras/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productBarcodesService.findOne(id);
  }

  @Get('productos/:id/codigos-barras')
  findByProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productBarcodesService.findByProduct(id);
  }

  @Post('productos/:id/codigos-barras')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductBarcodeDto,
  ) {
    return this.productBarcodesService.create(id, dto);
  }

  @Patch('codigos-barras/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductBarcodeDto,
  ) {
    return this.productBarcodesService.update(id, dto);
  }

  @Delete('codigos-barras/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productBarcodesService.remove(id);
  }

  @Patch('codigos-barras/:id/principal')
  markPrimary(@Param('id', ParseIntPipe) id: number) {
    return this.productBarcodesService.markPrimary(id);
  }
}
