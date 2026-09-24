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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CotizacionesService } from './cotizaciones.service';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import {
  CreateQuoteDto,
  SendQuoteToWarehouseDto,
  UpdateQuoteDto,
  UpdateQuoteStatusDto,
} from './dto/quote.dto';

@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly service: CotizacionesService) {}
  @Get() findAll(@Query() query: ListQuotesQueryDto) {
    return this.service.findAll(query);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post() create(@Body() dto: CreateQuoteDto) {
    return this.service.create(dto);
  }
  @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @Patch(':id/estado') updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuoteStatusDto,
  ) {
    return this.service.updateStatus(id, dto);
  }
  @Post(':id/convertir-factura') convertToInvoice(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.convertToInvoice(id);
  }
  @Post(':id/enviar-bodega')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.CONTADOR)
  sendToWarehouse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendQuoteToWarehouseDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.service.sendToWarehouse(id, dto.userId, request.user);
  }
}
