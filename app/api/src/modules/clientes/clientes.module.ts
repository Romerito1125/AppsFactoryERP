import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { ReferralStatsService } from './referral-stats.service';

@Module({
  controllers: [ClientesController],
  providers: [ClientesService, ReferralStatsService],
})
export class ClientesModule {}
