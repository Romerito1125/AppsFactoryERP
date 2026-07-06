import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  InventoryAdjustmentDto,
  InventoryEntryDto,
  InventoryExitDto,
  InventoryTransferDto,
} from './dto/inventory-movement.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { InventarioService } from './inventario.service';

@Controller('inventario')
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
  entry(@Body() dto: InventoryEntryDto) {
    return this.inventarioService.entry(dto);
  }

  @Post('salida')
  exit(@Body() dto: InventoryExitDto) {
    return this.inventarioService.exit(dto);
  }

  @Post('traslado')
  transfer(@Body() dto: InventoryTransferDto) {
    return this.inventarioService.transfer(dto);
  }

  @Post('ajuste')
  adjustment(@Body() dto: InventoryAdjustmentDto) {
    return this.inventarioService.adjustment(dto);
  }

  @Get('movimientos')
  findMovements(@Query() query: ListInventoryQueryDto) {
    return this.inventarioService.findMovements(query);
  }

  @Get('movimientos/:id')
  findMovement(@Param('id', ParseIntPipe) id: number) {
    return this.inventarioService.findMovement(id);
  }
}
