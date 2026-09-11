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
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CuentasBancariasService } from './cuentas-bancarias.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dto';
import { FilterBankAccountsDto } from './dto/filter-bank-accounts.dto';

@Controller('cuentas-bancarias')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN, Role.CAJERO, Role.CONTADOR)
@Permissions('BANKS_VIEW')
export class CuentasBancariasController {
  constructor(private readonly service: CuentasBancariasService) {}
  @Get() findAll(@Query() filter: FilterBankAccountsDto) {
    return this.service.findAll(filter);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post()
  @Permissions('BANKS_EDIT')
  create(@Body() dto: CreateBankAccountDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @Permissions('BANKS_EDIT')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @Permissions('BANKS_EDIT')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
  @Patch(':id/reactivar')
  @Permissions('BANKS_EDIT')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.service.reactivate(id);
  }
}
