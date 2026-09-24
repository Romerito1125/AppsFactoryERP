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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Role } from '../../common/enums/role.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ComprasService } from './compras.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreatePurchasePaymentDto } from './dto/create-purchase-payment.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { PurchaseReportQueryDto } from './dto/purchase-report-query.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
@Permissions('PURCHASES_VIEW')
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
  @Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
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
  @Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
  @Permissions('PURCHASES_EDIT')
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.comprasService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
  @Permissions('PURCHASES_EDIT')
  updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.comprasService.updateDraft(id, dto);
  }

  @Post(':id/ordenar')
  @Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
  @Permissions('PURCHASES_EDIT')
  order(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.order(id);
  }

  @Post(':id/recibir')
  @Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
  @Permissions('PURCHASES_EDIT')
  receive(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.comprasService.receive(id, request.user);
  }

  @Post(':id/pagos')
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('PAYABLES_EDIT')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePurchasePaymentDto,
  ) {
    return this.comprasService.pay(id, dto);
  }

  @Patch(':id/anular')
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('PURCHASES_EDIT')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.cancel(id);
  }
}
