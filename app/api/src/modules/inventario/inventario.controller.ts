import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import {
  InventoryAdjustmentDto,
  InventoryEntryDto,
  InventoryExitDto,
  InventoryTransferDto,
} from './dto/inventory-movement.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { InventarioService } from './inventario.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('inventario')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
@Permissions('PRODUCTS_VIEW')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  findAll(@Query() query: ListInventoryQueryDto) {
    return this.inventarioService.findAll(query);
  }

  @Get('productos/:productId')
  findByProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.inventarioService.findByProduct(productId);
  }

  @Get('bodegas/:warehouseId')
  findByWarehouse(
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Req() request: AuthRequest,
  ) {
    return this.inventarioService.findByWarehouse(warehouseId, request.user);
  }

  @Post('entrada')
  @Permissions('INVENTORY_EDIT')
  entry(@Body() dto: InventoryEntryDto, @Req() request: AuthRequest) {
    return this.inventarioService.entry(dto, request.user);
  }

  @Post('salida')
  @Permissions('INVENTORY_EDIT')
  exit(@Body() dto: InventoryExitDto, @Req() request: AuthRequest) {
    return this.inventarioService.exit(dto, request.user);
  }

  @Post('traslado')
  @Permissions('INVENTORY_EDIT')
  transfer(@Body() dto: InventoryTransferDto, @Req() request: AuthRequest) {
    return this.inventarioService.transfer(dto, request.user);
  }

  @Post('ajuste')
  @Permissions('INVENTORY_EDIT')
  adjustment(@Body() dto: InventoryAdjustmentDto, @Req() request: AuthRequest) {
    return this.inventarioService.adjustment(dto, request.user);
  }

  @Get('movimientos')
  findMovements(@Query() query: ListInventoryQueryDto, @Req() request: AuthRequest) {
    return this.inventarioService.findMovements(query, request.user);
  }

  @Get('movimientos/:id')
  findMovement(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.inventarioService.findMovement(id, request.user);
  }

  @Get('traslados/tickets')
  findTransferTickets(@Query() query: ListInventoryQueryDto, @Req() request: AuthRequest) {
    return this.inventarioService.findTransferTickets(query, request.user);
  }

  @Get('traslados/tickets/:id')
  findTransferTicket(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.inventarioService.findTransferTicket(id, request.user);
  }
}
