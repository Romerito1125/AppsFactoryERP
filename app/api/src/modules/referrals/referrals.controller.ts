import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CreateReferralDto } from './dto/create-referral.dto';
import { ValidateReferralDto } from './dto/validate-referral.dto';
import { ReferralsService } from './referrals.service';

@Controller('referidos')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get()
  findAll() {
    return this.referralsService.findAll();
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
