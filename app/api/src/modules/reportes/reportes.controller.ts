import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { SendReportEmailDto } from './dto/send-report-email.dto';
import { ReportesService } from './reportes.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('reportes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CONTADOR)
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Post('email')
  sendEmail(@Body() payload: SendReportEmailDto, @Req() request: AuthRequest) {
    return this.reportesService.sendEmail(payload, request.user);
  }
}
