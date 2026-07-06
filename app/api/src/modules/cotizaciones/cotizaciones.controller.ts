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
import { CotizacionesService } from './cotizaciones.service';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  UpdateQuoteStatusDto,
} from './dto/quote.dto';

@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly service: CotizacionesService) {}
  @Get() findAll(@Query() query: ListQuotesQueryDto) {
    return this.service.findAll(query);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post() create(@Body() dto: CreateQuoteDto) {
    return this.service.create(dto);
  }
  @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @Patch(':id/estado') updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuoteStatusDto,
  ) {
    return this.service.updateStatus(id, dto);
  }
  @Post(':id/convertir-factura') convertToInvoice(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.convertToInvoice(id);
  }
}
