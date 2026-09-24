import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Put,
  Query,
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
import { CreateReferralDto } from './dto/create-referral.dto';
import { ListReferralsQueryDto } from './dto/list-referrals-query.dto';
import { UpdateReferralProfitPolicyDto } from './dto/update-referral-profit-policy.dto';
import { ValidateReferralDto } from './dto/validate-referral.dto';
import { ReferralsService } from './referrals.service';

type AuthRequest = Request & { user: AuthUser };

@Controller('referidos')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('REFERRALS_VIEW')
  findAll(@Query() query: ListReferralsQueryDto) {
    return this.referralsService.findAll(query);
  }

  @Get('resumen-utilidades')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('REFERRALS_VIEW')
  getProfitSummary() {
    return this.referralsService.getProfitSummary();
  }

  @Get('politicas-utilidad')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('REFERRALS_VIEW')
  findProfitPolicies() {
    return this.referralsService.findProfitPolicies();
  }

  @Put('politicas-utilidad')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('REFERRALS_EDIT')
  replaceProfitPolicies(
    @Body() policies: UpdateReferralProfitPolicyDto[],
    @Req() request: AuthRequest,
  ) {
    return this.referralsService.updateProfitPolicies(policies, request.user);
  }

  @Patch('politicas-utilidad')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('REFERRALS_EDIT')
  updateProfitPolicies(
    @Body() policies: UpdateReferralProfitPolicyDto[],
    @Req() request: AuthRequest,
  ) {
    return this.referralsService.updateProfitPolicies(policies, request.user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('REFERRALS_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.referralsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createReferralDto: CreateReferralDto,
    @Req() request: AuthRequest,
  ) {
    return this.referralsService.create(createReferralDto, request.user);
  }

  @Post('validar')
  @UseGuards(JwtAuthGuard)
  validate(
    @Body() validateReferralDto: ValidateReferralDto,
    @Req() request: AuthRequest,
  ) {
    return this.referralsService.validate(validateReferralDto, request.user);
  }
}
