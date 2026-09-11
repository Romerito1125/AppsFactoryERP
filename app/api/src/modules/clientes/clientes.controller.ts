import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { ClientesService } from './clientes.service';
import { CreateClientDto } from './dto/create-client.dto';
import { FilterClientsDto } from './dto/filter-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateReferralLevelDto } from './dto/update-referral-level.dto';
import { ReferralStatsService } from './referral-stats.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientesService: ClientesService,
    private readonly referralStatsService: ReferralStatsService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('CLIENTS_VIEW')
  findAll(@Query() filter: FilterClientsDto) {
    return this.clientesService.findAll(filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('CLIENTS_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.findOne(id);
  }

  @Get(':id/referidos')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('CLIENTS_VIEW')
  findReferrals(@Param('id', ParseIntPipe) id: number) {
    // La pestaña Referidos es una consulta del cliente seleccionado, igual que
    // el listado público de clientes. Las operaciones sobre la red completa,
    // estadísticas y cambios siguen protegidas más abajo.
    return this.clientesService.findReferrals(id);
  }

  @Get(':id/red-referidos')
  @UseGuards(JwtAuthGuard)
  getReferralNetwork(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthRequest,
  ) {
    this.ensureClientAccess(id, request.user);
    return this.referralStatsService.getNetwork(id);
  }

  @Get(':id/estadisticas-referidos')
  @UseGuards(JwtAuthGuard)
  getReferralStats(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthRequest,
  ) {
    this.ensureClientAccess(id, request.user);
    return this.referralStatsService.getStats(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('CLIENTS_EDIT')
  create(
    @Body() createClientDto: CreateClientDto,
    @Req() request: AuthRequest,
  ) {
    return this.clientesService.create(createClientDto, request.user);
  }

  @Post(':id/codigo-referido')
  @UseGuards(JwtAuthGuard)
  generateReferralCode(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthRequest,
  ) {
    this.ensureClientAccess(id, request.user);
    return this.clientesService.generateReferralCode(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('CLIENTS_EDIT')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateClientDto: UpdateClientDto,
    @Req() request: AuthRequest,
  ) {
    return this.clientesService.update(id, updateClientDto, request.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('CLIENTS_EDIT')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.clientesService.remove(id, request.user);
  }

  @Patch(':id/reactivar')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('CLIENTS_EDIT')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.reactivate(id);
  }

  @Patch(':id/nivel-referido')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateReferralLevel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReferralLevelDto,
  ) {
    return this.clientesService.updateReferralLevel(id, dto.referralLevel);
  }

  private ensureClientAccess(id: number, user: AuthUser) {
    if (user.role === Role.CLIENTE && user.clientId !== id) {
      throw new ForbiddenException(
        'No puedes consultar la red de otro cliente',
      );
    }
  }
}
