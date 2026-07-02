import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductCostDto } from './dto/create-product-cost.dto';
import { UpdateProductCostDto } from './dto/update-product-cost.dto';
import { ProductCostsService } from './product-costs.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CONTADOR)
export class ProductCostsController {
  constructor(private readonly productCostsService: ProductCostsService) {}

  @Get('productos/:id/costos')
  findByProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productCostsService.findByProduct(id);
  }

  @Post('productos/:id/costos')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() createProductCostDto: CreateProductCostDto,
  ) {
    return this.productCostsService.create(id, createProductCostDto);
  }

  @Patch('costos-producto/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductCostDto: UpdateProductCostDto,
  ) {
    return this.productCostsService.update(id, updateProductCostDto);
  }

  @Delete('costos-producto/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productCostsService.remove(id);
  }
}
