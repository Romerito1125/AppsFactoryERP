import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ComprasService } from './compras.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { PurchaseReportQueryDto } from './dto/purchase-report-query.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Get()
  findAll(@Query() query: ListPurchaseOrdersQueryDto) {
    return this.comprasService.findAll(query);
  }

  @Get('reportes/resumen')
  getSummary(@Query() query: PurchaseReportQueryDto) {
    return this.comprasService.getSummary(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.comprasService.create(dto);
  }

  @Patch(':id')
  updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.comprasService.updateDraft(id, dto);
  }

  @Post(':id/ordenar')
  order(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.order(id);
  }

  @Post(':id/recibir')
  receive(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.receive(id);
  }

  @Patch(':id/anular')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.cancel(id);
  }
}
