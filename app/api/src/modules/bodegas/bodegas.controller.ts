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
} from '@nestjs/common';
import { BodegasService } from './bodegas.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { FilterWarehousesDto } from './dto/filter-warehouses.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Controller('bodegas')
export class BodegasController {
  constructor(private readonly bodegasService: BodegasService) {}

  @Get()
  findAll(@Query() filter: FilterWarehousesDto) {
    return this.bodegasService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.bodegasService.findOne(id);
  }

  @Post()
  create(@Body() createWarehouseDto: CreateWarehouseDto) {
    return this.bodegasService.create(createWarehouseDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWarehouseDto: UpdateWarehouseDto,
  ) {
    return this.bodegasService.update(id, updateWarehouseDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.bodegasService.remove(id);
  }

  @Patch(':id/reactivar')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.bodegasService.reactivate(id);
  }
}
