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
import { ApplicableOffersDto } from './dto/applicable-offers.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { FilterOffersDto } from './dto/filter-offers.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OfertasService } from './ofertas.service';

@Controller('ofertas')
export class OfertasController {
  constructor(private readonly ofertasService: OfertasService) {}

  @Get()
  findAll(@Query() filter: FilterOffersDto) {
    return this.ofertasService.findAll(filter);
  }

  @Post('aplicables')
  findApplicable(@Body() applicableOffersDto: ApplicableOffersDto) {
    return this.ofertasService.findApplicable(applicableOffersDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ofertasService.findOne(id);
  }

  @Post()
  create(@Body() createOfferDto: CreateOfferDto) {
    return this.ofertasService.create(createOfferDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOfferDto: UpdateOfferDto,
  ) {
    return this.ofertasService.update(id, updateOfferDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ofertasService.remove(id);
  }

  @Patch(':id/reactivar')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.ofertasService.reactivate(id);
  }
}
