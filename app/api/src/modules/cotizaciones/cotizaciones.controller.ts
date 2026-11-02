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
  UpdateLineFulfillmentDto,
  UpdateQuoteDto,
  UpdateQuoteStatusDto,
} from './dto/quote.dto';

@Controller('cotizaciones')
@UseGuards(JwtAuthGuard)
export class CotizacionesController {
  constructor(private readonly service: CotizacionesService) {}
  @Get() findAll(
    @Query() query: ListQuotesQueryDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.service.findAll(query, request.user);
  }
  @Get(':id') findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.service.findOne(id, request.user);
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateQuoteDto, @Req() request: Request & { user: AuthUser }) {
    return this.service.create(dto, request.user);
  }
  @Patch(':id/lineas/:itemId/surtido')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.BODEGA)
  fulfillLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateLineFulfillmentDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.service.fulfillLine(id, itemId, dto.status, request.user);
  }
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @Patch(':id/estado')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuoteStatusDto,
  ) {
    return this.service.updateStatus(id, dto);
  }
  @Post(':id/convertir-factura')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  convertToInvoice(
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
