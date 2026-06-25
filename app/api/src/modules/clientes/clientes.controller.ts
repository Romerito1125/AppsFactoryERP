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
} from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { CreateClientDto } from './dto/create-client.dto';
import { FilterClientsDto } from './dto/filter-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateReferralLevelDto } from './dto/update-referral-level.dto';
import { ReferralStatsService } from './referral-stats.service';

@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientesService: ClientesService,
    private readonly referralStatsService: ReferralStatsService,
  ) {}

  @Get()
  findAll(@Query() filter: FilterClientsDto) {
    return this.clientesService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.findOne(id);
  }

  @Get(':id/referidos')
  findReferrals(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.findReferrals(id);
  }

  @Get(':id/red-referidos')
  getReferralNetwork(@Param('id', ParseIntPipe) id: number) {
    return this.referralStatsService.getNetwork(id);
  }

  @Get(':id/estadisticas-referidos')
  getReferralStats(@Param('id', ParseIntPipe) id: number) {
    return this.referralStatsService.getStats(id);
  }

  @Post()
  create(@Body() createClientDto: CreateClientDto) {
    return this.clientesService.create(createClientDto);
  }

  @Post(':id/codigo-referido')
  generateReferralCode(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.generateReferralCode(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    return this.clientesService.update(id, updateClientDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.remove(id);
  }

  @Patch(':id/reactivar')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.reactivate(id);
  }

  @Patch(':id/nivel-referido')
  updateReferralLevel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReferralLevelDto,
  ) {
    return this.clientesService.updateReferralLevel(id, dto.referralLevel);
  }
}
