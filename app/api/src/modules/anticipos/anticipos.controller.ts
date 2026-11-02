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
import { AnticiposService } from './anticipos.service';
import {
  ApplyAdvanceDto,
  CreateAdvanceDto,
  ListAdvancesQueryDto,
  RefundAdvanceDto,
  VoidAdvanceDto,
} from './dto/advance.dto';

type AuthRequest = Request & { user: AuthUser };

@Controller('anticipos')
export class AnticiposController {
  constructor(private readonly service: AnticiposService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('RECEIVABLES_VIEW')
  findAll(@Query() query: ListAdvancesQueryDto) {
    return this.service.findAll(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  create(@Body() dto: CreateAdvanceDto, @Req() request: AuthRequest) {
    return this.service.create(dto, request.user);
  }

  @Post(':id/aplicar')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.CONTADOR, Role.VENDEDOR)
  @Permissions('RECEIVABLES_EDIT')
  apply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyAdvanceDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.applyToCredit(id, dto, request.user);
  }

  @Post(':id/anular')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  voidAdvance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidAdvanceDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.voidAdvance(id, dto.reason, request.user);
  }

  @Post(':id/devolver')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundAdvanceDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.refund(id, dto, request.user);
  }
}
