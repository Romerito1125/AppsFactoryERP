import {
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
@UseGuards(JwtAuthGuard)
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  findAll(
    @Query() query: ListNotificationsQueryDto,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.notificacionesService.findCenter(request.user, query.limit);
  }

  @Patch(':id/leer')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request & { user: AuthUser },
  ) {
    return this.notificacionesService.markAsRead(id, request.user.sub);
  }

  @Post('marcar-todas-leidas')
  markAllAsRead(@Req() request: Request & { user: AuthUser }) {
    return this.notificacionesService.markAllAsRead(request.user.sub);
  }
}
