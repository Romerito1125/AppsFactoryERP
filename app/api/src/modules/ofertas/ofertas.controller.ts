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
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Role } from '../../common/enums/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApplicableOffersDto } from './dto/applicable-offers.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { FilterOffersDto } from './dto/filter-offers.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OfertasService } from './ofertas.service';

@Controller('ofertas')
export class OfertasController {
  constructor(private readonly ofertasService: OfertasService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('OFFERS_VIEW')
  findAll(@Query() filter: FilterOffersDto) {
    return this.ofertasService.findAll(filter);
  }

  @Post('aplicables')
  findApplicable(@Body() applicableOffersDto: ApplicableOffersDto) {
    return this.ofertasService.findApplicable(applicableOffersDto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('OFFERS_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ofertasService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('OFFERS_EDIT')
  create(@Body() createOfferDto: CreateOfferDto) {
    return this.ofertasService.create(createOfferDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('OFFERS_EDIT')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOfferDto: UpdateOfferDto,
  ) {
    return this.ofertasService.update(id, updateOfferDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('OFFERS_EDIT')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ofertasService.remove(id);
  }

  @Patch(':id/reactivar')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @Permissions('OFFERS_EDIT')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.ofertasService.reactivate(id);
  }
}
