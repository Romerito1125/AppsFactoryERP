import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateCreditPaymentDto,
  CreateInvoiceCreditDto,
  UpdateCreditStatusDto,
} from './dto/credit.dto';
import { ListCreditsQueryDto } from './dto/list-credits-query.dto';
import { CreditosService } from './creditos.service';

@Controller()
export class CreditosController {
  constructor(private readonly service: CreditosService) {}
  @Post('creditos') createDirect(@Body() dto: CreateInvoiceCreditDto) {
    return this.service.createDirect(dto);
  }
  @Post('facturas/:id/credito') createForInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateInvoiceCreditDto,
  ) {
    return this.service.createForInvoice(id, dto);
  }
  @Get('creditos') findAll(@Query() query: ListCreditsQueryDto) {
    return this.service.findAll(query);
  }
  @Get('creditos/:id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Get('clientes/:id/creditos') findByClient(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findByClient(id);
  }
  @Post('creditos/:id/pagos') pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCreditPaymentDto,
  ) {
    return this.service.pay(id, dto);
  }
  @Patch('creditos/:id/estado') updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCreditStatusDto,
  ) {
    return this.service.updateStatus(id, dto);
  }
}
