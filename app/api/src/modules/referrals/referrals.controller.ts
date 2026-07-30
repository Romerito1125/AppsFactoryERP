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
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
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
  findAll(@Query() query: ListReferralsQueryDto) {
    return this.referralsService.findAll(query);
  }

  @Get('politicas-utilidad')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findProfitPolicies() {
    return this.referralsService.findProfitPolicies();
  }

  @Put('politicas-utilidad')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  replaceProfitPolicies(
    @Body() policies: UpdateReferralProfitPolicyDto[],
    @Req() request: AuthRequest,
  ) {
    return this.referralsService.updateProfitPolicies(policies, request.user);
  }

  @Patch('politicas-utilidad')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateProfitPolicies(
    @Body() policies: UpdateReferralProfitPolicyDto[],
    @Req() request: AuthRequest,
  ) {
    return this.referralsService.updateProfitPolicies(policies, request.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.referralsService.findOne(id);
  }

  @Post()
  create(@Body() createReferralDto: CreateReferralDto) {
    return this.referralsService.create(createReferralDto);
  }

  @Post('validar')
  validate(@Body() validateReferralDto: ValidateReferralDto) {
    return this.referralsService.validate(validateReferralDto);
  }
}
