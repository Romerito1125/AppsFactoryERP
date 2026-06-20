import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CreditosController } from './creditos.controller';
import { CreditosService } from './creditos.service';

@Module({
  imports: [PrismaModule],
  controllers: [CreditosController],
  providers: [CreditosService],
})
export class CreditosModule {}
