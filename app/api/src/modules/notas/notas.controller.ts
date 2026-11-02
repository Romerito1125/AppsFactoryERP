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
import {
  ApplyAdvanceNoteDto,
  CreateNoteDto,
  ListNotesQueryDto,
  VoidNoteDto,
} from './dto/note.dto';
import { NotasService } from './notas.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('notas')
export class NotasController {
  constructor(private readonly service: NotasService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR, Role.BODEGA)
  list(@Query() query: ListNotesQueryDto) {
    return this.service.list(query);
  }

  @Post('cobrar/debito')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  clientDebit(@Body() dto: CreateNoteDto, @Req() request: AuthRequest) {
    return this.service.createClientDebit(dto, request.user);
  }

  @Post('cobrar/credito')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  clientCredit(@Body() dto: CreateNoteDto, @Req() request: AuthRequest) {
    return this.service.createClientCredit(dto, request.user);
  }

  @Post('pagar/debito')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('PAYABLES_EDIT')
  providerDebit(@Body() dto: CreateNoteDto, @Req() request: AuthRequest) {
    return this.service.createProviderDebit(dto, request.user);
  }

  @Post('pagar/credito')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('PAYABLES_EDIT')
  providerCredit(@Body() dto: CreateNoteDto, @Req() request: AuthRequest) {
    return this.service.createProviderCredit(dto, request.user);
  }

  @Post('pagar/anticipo')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('PAYABLES_EDIT')
  providerAdvance(@Body() dto: CreateNoteDto, @Req() request: AuthRequest) {
    return this.service.createProviderAdvance(dto, request.user);
  }

  @Post(':id/aplicar')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('PAYABLES_EDIT')
  apply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyAdvanceNoteDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.applyProviderAdvance(id, dto, request.user);
  }

  @Post(':id/anular')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  void(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidNoteDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.void(id, dto.reason, request.user);
  }
}
