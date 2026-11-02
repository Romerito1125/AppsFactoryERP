import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsInt, IsObject, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { BorradoresService } from './borradores.service';

type AuthRequest = Request & { user: AuthUser };

class SaveDraftDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() id?: number;
  @IsString() kind: string;
  @IsString() @MaxLength(120) title: string;
  @IsObject() payload: Record<string, unknown>;
}

@Controller('borradores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR, Role.BODEGA)
export class BorradoresController {
  constructor(private readonly service: BorradoresService) {}

  @Get()
  list(@Query('kind') kind: string, @Req() request: AuthRequest) {
    return this.service.list(kind, request.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.service.findOne(id, request.user);
  }

  @Post()
  save(@Body() dto: SaveDraftDto, @Req() request: AuthRequest) {
    return this.service.save(dto, request.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: AuthRequest) {
    return this.service.remove(id, request.user);
  }
}
