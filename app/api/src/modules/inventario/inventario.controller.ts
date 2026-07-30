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
import { Request } from 'express';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
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
  findByWarehouse(@Param('warehouseId', ParseIntPipe) warehouseId: number) {
    return this.inventarioService.findByWarehouse(warehouseId);
  }

  @Post('entrada')
  entry(@Body() dto: InventoryEntryDto, @Req() request: AuthRequest) {
    return this.inventarioService.entry(dto, request.user);
  }

  @Post('salida')
  exit(@Body() dto: InventoryExitDto, @Req() request: AuthRequest) {
    return this.inventarioService.exit(dto, request.user);
  }

  @Post('traslado')
  transfer(@Body() dto: InventoryTransferDto, @Req() request: AuthRequest) {
    return this.inventarioService.transfer(dto, request.user);
  }

  @Post('ajuste')
  adjustment(@Body() dto: InventoryAdjustmentDto, @Req() request: AuthRequest) {
    return this.inventarioService.adjustment(dto, request.user);
  }

  @Get('movimientos')
  findMovements(@Query() query: ListInventoryQueryDto) {
    return this.inventarioService.findMovements(query);
  }

  @Get('movimientos/:id')
  findMovement(@Param('id', ParseIntPipe) id: number) {
    return this.inventarioService.findMovement(id);
  }

  @Get('traslados/tickets')
  findTransferTickets(@Query() query: ListInventoryQueryDto) {
    return this.inventarioService.findTransferTickets(query);
  }

  @Get('traslados/tickets/:id')
  findTransferTicket(@Param('id', ParseIntPipe) id: number) {
    return this.inventarioService.findTransferTicket(id);
  }
}
