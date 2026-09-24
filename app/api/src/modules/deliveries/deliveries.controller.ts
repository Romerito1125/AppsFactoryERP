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
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';

@Controller('domicilios')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.BODEGA, Role.DOMICILIARIO)
  @Permissions('DELIVERIES_VIEW')
  findAll(@Query() query: ListDeliveriesQueryDto, @Req() request: Request & { user: AuthUser }) {
    return this.deliveriesService.findAll(query, request.user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.BODEGA, Role.DOMICILIARIO)
  @Permissions('DELIVERIES_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() request: Request & { user: AuthUser }) {
    return this.deliveriesService.findOne(id, request.user);
  }

  @Post()
  @Roles(Role.ADMIN)
  @Permissions('DELIVERIES_EDIT')
  create(@Body() createDeliveryDto: CreateDeliveryDto) {
    return this.deliveriesService.create(createDeliveryDto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @Permissions('DELIVERIES_EDIT')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDeliveryDto: UpdateDeliveryDto,
  ) {
    return this.deliveriesService.update(id, updateDeliveryDto);
  }

  @Patch(':id/estado')
  @Roles(Role.ADMIN, Role.BODEGA, Role.DOMICILIARIO)
  @Permissions('DELIVERIES_DISPATCH')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDeliveryStatusDto: UpdateDeliveryStatusDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.deliveriesService.updateStatus(
      id,
      updateDeliveryStatusDto,
      request.user,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @Permissions('DELIVERIES_EDIT')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.deliveriesService.remove(id);
  }
}
