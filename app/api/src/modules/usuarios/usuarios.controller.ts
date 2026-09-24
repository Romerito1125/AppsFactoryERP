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
  Put,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserPermissionsDto } from './dto/update-user-permissions.dto';
import { UsuariosService } from './usuarios.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usuariosService.findAll(query);
  }

  @Get('vendedores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR)
  findSalesUsers() {
    return this.usuariosService.findSalesUsers();
  }

  @Get(':id/permisos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getPermissions(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.getPermissions(id);
  }

  @Put(':id/permisos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserPermissionsDto,
    @Req() request: AuthRequest,
  ) {
    return this.usuariosService.updatePermissions(id, dto, request.user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() createUserDto: CreateUserDto, @Req() request: AuthRequest) {
    return this.usuariosService.create(createUserDto, request.user);
  }

  @Post('funcionarios')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  createEmployee(
    @Body() createEmployeeDto: CreateEmployeeDto,
    @Req() request: AuthRequest,
  ) {
    return this.usuariosService.createEmployee(createEmployeeDto, request.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Req() request: AuthRequest,
  ) {
    return this.usuariosService.update(id, updateUserDto, request.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.usuariosService.remove(id, request.user);
  }
}
