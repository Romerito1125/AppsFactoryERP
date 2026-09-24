import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { SendReportEmailDto } from './dto/send-report-email.dto';
import { ReportesService } from './reportes.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('reportes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN, Role.CONTADOR)
@Permissions('REPORTS_VIEW')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Post('email')
  sendEmail(@Body() payload: SendReportEmailDto, @Req() request: AuthRequest) {
    return this.reportesService.sendEmail(payload, request.user);
  }
}
