import {
  Body,
  Controller,
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
  findAll(
    @Query() query: ListPurchaseOrdersQueryDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.comprasService.findAll(query, request.user);
  }

  @Get('reportes/resumen')
  @Roles(Role.ADMIN, Role.CONTADOR)
  getSummary(
    @Query() query: PurchaseReportQueryDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.comprasService.getSummary(query, request.user);
  }

  @Get('pendientes-hoy')
  @Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
  getPendingToday(@Req() request: Request & { user: AuthUser }) {
    return this.comprasService.getPendingToday(request.user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.comprasService.findOne(id, request.user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.CONTADOR)
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.comprasService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.CONTADOR)
  updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.comprasService.updateDraft(id, dto);
  }

  @Post(':id/ordenar')
  @Roles(Role.ADMIN, Role.CONTADOR)
  order(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.order(id);
  }

  @Post(':id/recibir')
  @Roles(Role.ADMIN, Role.CONTADOR)
  receive(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.receive(id);
  }

  @Patch(':id/anular')
  @Roles(Role.ADMIN, Role.CONTADOR)
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.cancel(id);
  }
}
