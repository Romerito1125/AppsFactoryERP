import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { BorradoresController } from './borradores.controller';
import { BorradoresService } from './borradores.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogModule],
  controllers: [BorradoresController],
  providers: [BorradoresService],
})
export class BorradoresModule {}
