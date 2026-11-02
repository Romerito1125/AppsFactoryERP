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
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { DevolucionesService } from './devoluciones.service';
import { CreateReturnDto, ListReturnsQueryDto } from './dto/return.dto';

type AuthRequest = Request & { user: AuthUser };

@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly service: DevolucionesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RETURNS_VIEW')
  findAll(@Query() query: ListReturnsQueryDto) {
    return this.service.findAll(query);
  }

  @Get('factura/:invoiceId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RETURNS_VIEW')
  returnable(@Param('invoiceId', ParseIntPipe) invoiceId: number) {
    return this.service.returnable(invoiceId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RETURNS_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO)
  @Permissions('RETURNS_CREATE')
  create(@Body() dto: CreateReturnDto, @Req() request: AuthRequest) {
    return this.service.create(dto, request.user);
  }
}
