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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import {
  CreateReceiptDto,
  ListReceiptsQueryDto,
  StatementQueryDto,
  UpdateReceiptDto,
  VoidReceiptDto,
} from './dto/receipt.dto';
import { RecibosService } from './recibos.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('recibos')
export class RecibosController {
  constructor(private readonly service: RecibosService) {}

  @Get('cobros')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RECEIVABLES_VIEW')
  listCollections(@Query() query: ListReceiptsQueryDto) {
    return this.service.list({ ...query, kind: 'COBRO' });
  }

  @Get('pagos')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
  @Permissions('PAYABLES_VIEW')
  listPayments(@Query() query: ListReceiptsQueryDto) {
    return this.service.list({ ...query, kind: 'PAGO' });
  }

  @Get('estado-cuenta/cliente/:clientId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RECEIVABLES_VIEW')
  clientStatement(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query() query: StatementQueryDto,
  ) {
    return this.service.clientStatement(clientId, query);
  }

  @Get('estado-cuenta/proveedor/:providerId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR, Role.BODEGA)
  @Permissions('PAYABLES_VIEW')
  providerStatement(
    @Param('providerId', ParseIntPipe) providerId: number,
    @Query() query: StatementQueryDto,
  ) {
    return this.service.providerStatement(providerId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR, Role.BODEGA)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post('cobro')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  createCollection(@Body() dto: CreateReceiptDto, @Req() request: AuthRequest) {
    return this.service.createCollection(dto, request.user);
  }

  @Post('pago')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('PAYABLES_EDIT')
  createPayment(@Body() dto: CreateReceiptDto, @Req() request: AuthRequest) {
    return this.service.createPayment(dto, request.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.CONTADOR)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReceiptDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.update(id, dto, request.user);
  }

  @Post(':id/anular')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  voidCollection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidReceiptDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.voidCollection(id, dto.reason, request.user);
  }
}
