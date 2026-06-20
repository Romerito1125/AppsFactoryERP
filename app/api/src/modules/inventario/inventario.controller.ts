import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  InventoryAdjustmentDto,
  InventoryEntryDto,
  InventoryExitDto,
  InventoryTransferDto,
} from './dto/inventory-movement.dto';
import { InventarioService } from './inventario.service';

@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  findAll() {
    return this.inventarioService.findAll();
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
  findMovements() {
    return this.inventarioService.findMovements();
  }

  @Get('movimientos/:id')
  findMovement(@Param('id', ParseIntPipe) id: number) {
    return this.inventarioService.findMovement(id);
  }
}
