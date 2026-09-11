import {
  Body,
  Controller,
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
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
  @Post('creditos')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  createDirect(@Body() dto: CreateInvoiceCreditDto) {
    return this.service.createDirect(dto);
  }
  @Post('facturas/:id/credito')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  createForInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateInvoiceCreditDto,
  ) {
    return this.service.createForInvoice(id, dto);
  }
  @Get('creditos')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('RECEIVABLES_VIEW')
  findAll(@Query() query: ListCreditsQueryDto) {
    return this.service.findAll(query);
  }
  @Get('creditos/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('RECEIVABLES_VIEW')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Get('clientes/:id/creditos')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('RECEIVABLES_VIEW')
  findByClient(@Param('id', ParseIntPipe) id: number) {
    return this.service.findByClient(id);
  }
  @Post('creditos/:id/pagos')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCreditPaymentDto,
  ) {
    return this.service.pay(id, dto);
  }
  @Patch('creditos/:id/estado')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.CONTADOR)
  @Permissions('RECEIVABLES_EDIT')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCreditStatusDto,
  ) {
    return this.service.updateStatus(id, dto);
  }
}
