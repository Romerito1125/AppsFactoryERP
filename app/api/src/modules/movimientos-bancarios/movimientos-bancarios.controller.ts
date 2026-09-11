import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BankAdjustmentDto,
  BankAmountDto,
  BankTransferDto,
} from '../cuentas-bancarias/dto/bank-account.dto';
import { ListBankMovementsQueryDto } from './dto/list-bank-movements-query.dto';
import { MovimientosBancariosService } from './movimientos-bancarios.service';

@Controller('movimientos-bancarios')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN, Role.CAJERO, Role.CONTADOR)
@Permissions('BANKS_VIEW')
export class MovimientosBancariosController {
  constructor(private readonly service: MovimientosBancariosService) {}
  @Get() findAll(@Query() query: ListBankMovementsQueryDto) {
    return this.service.findAll(query);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post('ingreso')
  @Permissions('BANKS_EDIT')
  income(@Body() dto: BankAmountDto) {
    return this.service.income(dto.bankAccountId, dto);
  }
  @Post('egreso')
  @Permissions('BANKS_EDIT')
  expense(@Body() dto: BankAmountDto) {
    return this.service.expense(dto.bankAccountId, dto);
  }
  @Post('transferencia')
  @Permissions('BANKS_EDIT')
  transfer(@Body() dto: BankTransferDto) {
    return this.service.transfer(dto);
  }
  @Post('ajuste')
  @Permissions('BANKS_EDIT')
  adjustment(@Body() dto: BankAdjustmentDto) {
    return this.service.adjustment(dto.bankAccountId, dto);
  }
}
