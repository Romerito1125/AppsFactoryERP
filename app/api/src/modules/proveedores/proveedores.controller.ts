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
import { CreateProviderDto } from './dto/create-provider.dto';
import { FilterProvidersDto } from './dto/filter-providers.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProveedoresService } from './proveedores.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Get()
  findAll(@Query() filter: FilterProvidersDto) {
    return this.proveedoresService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.proveedoresService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateProviderDto, @Req() request: AuthRequest) {
    return this.proveedoresService.create(dto, request.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProviderDto,
    @Req() request: AuthRequest,
  ) {
    return this.proveedoresService.update(id, dto, request.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.proveedoresService.remove(id, request.user);
  }

  @Patch(':id/reactivar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthRequest,
  ) {
    return this.proveedoresService.reactivate(id, request.user);
  }
}
