import { Module } from '@nestjs/common';
import { BodegasController } from './bodegas.controller';
import { BodegasService } from './bodegas.service';

@Module({
  controllers: [BodegasController],
  providers: [BodegasService],
})
export class BodegasModule {}
