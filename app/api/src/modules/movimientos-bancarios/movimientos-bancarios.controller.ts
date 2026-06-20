import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  BankAdjustmentDto,
  BankAmountDto,
  BankTransferDto,
} from '../cuentas-bancarias/dto/bank-account.dto';
import { MovimientosBancariosService } from './movimientos-bancarios.service';

@Controller('movimientos-bancarios')
export class MovimientosBancariosController {
  constructor(private readonly service: MovimientosBancariosService) {}
  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post('ingreso') income(@Body() dto: BankAmountDto) {
    return this.service.income(dto.bankAccountId, dto);
  }
  @Post('egreso') expense(@Body() dto: BankAmountDto) {
    return this.service.expense(dto.bankAccountId, dto);
  }
  @Post('transferencia') transfer(@Body() dto: BankTransferDto) {
    return this.service.transfer(dto);
  }
  @Post('ajuste') adjustment(@Body() dto: BankAdjustmentDto) {
    return this.service.adjustment(dto.bankAccountId, dto);
  }
}
