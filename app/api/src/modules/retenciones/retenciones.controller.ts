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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Role } from '../../common/enums/role.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CreateRetentionDto } from './dto/create-retention.dto';
import { FilterRetentionsDto } from './dto/filter-retentions.dto';
import { UpdateRetentionDto } from './dto/update-retention.dto';
import { RetencionesService } from './retenciones.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('retenciones')
export class RetencionesController {
  constructor(private readonly retencionesService: RetencionesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('RETENTIONS_VIEW')
  findAll(@Query() filter: FilterRetentionsDto) {
    return this.retencionesService.findAll(filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('RETENTIONS_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.retencionesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('RETENTIONS_EDIT')
  create(@Body() dto: CreateRetentionDto, @Req() request: AuthRequest) {
    return this.retencionesService.create(dto, request.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('RETENTIONS_EDIT')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRetentionDto,
    @Req() request: AuthRequest,
  ) {
    return this.retencionesService.update(id, dto, request.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('RETENTIONS_EDIT')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.retencionesService.remove(id, request.user);
  }

  @Patch(':id/reactivar')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('RETENTIONS_EDIT')
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthRequest,
  ) {
    return this.retencionesService.reactivate(id, request.user);
  }
}
