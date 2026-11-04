import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BankMovementType } from '@prisma/client';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dto';
import { FilterBankAccountsDto } from './dto/filter-bank-accounts.dto';

@Injectable()
export class CuentasBancariasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}
  async findAll(filter: FilterBankAccountsDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.bankAccount.count({ where }),
      this.prisma.bankAccount.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }
  async findOne(id: number) {
    this.ensurePositiveId(id);
    const item = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { movements: true },
    });
    if (!item) throw new NotFoundException('Cuenta bancaria no encontrada');
    return item;
  }
  async create(dto: CreateBankAccountDto, actor?: AuthUser) {
    const { currentBalance = 0, ...data } = dto;
    if (currentBalance < 0)
      throw new BadRequestException('El saldo inicial no puede ser negativo');
    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({
        data: { ...data, currentBalance: 0 },
      });
      if (currentBalance === 0) return created;
      // El saldo inicial entra como movimiento: el saldo nunca se escribe sin respaldo.
      await tx.bankAccountMovement.create({
        data: {
          bankAccountId: created.id,
          movementType: BankMovementType.INGRESO,
          amount: currentBalance,
          baseAmount: currentBalance,
          totalAmount: currentBalance,
          description: 'Saldo inicial',
        },
      });
      return tx.bankAccount.update({
        where: { id: created.id },
        data: { currentBalance },
      });
    });
    await this.auditLog.log({
      actor,
      module: 'BANCOS',
      action: 'CREAR_CUENTA',
      entityType: 'BankAccount',
      entityId: account.id,
      entityLabel: account.name,
      description: `Creó la cuenta ${account.name}`,
      metadata: { saldoInicial: currentBalance },
    });
    return account;
  }
  async update(id: number, dto: UpdateBankAccountDto, actor?: AuthUser) {
    await this.findOne(id);
    const account = await this.prisma.bankAccount.update({
      where: { id },
      data: dto,
    });
    await this.auditLog.log({
      actor,
      module: 'BANCOS',
      action: 'EDITAR_CUENTA',
      entityType: 'BankAccount',
      entityId: account.id,
      entityLabel: account.name,
      description: `Editó la cuenta ${account.name}`,
      metadata: { campos: Object.keys(dto) },
    });
    return account;
  }
  async remove(id: number, actor?: AuthUser) {
    await this.findOne(id);
    const account = await this.prisma.bankAccount.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    await this.auditLog.log({
      actor,
      module: 'BANCOS',
      action: 'DESACTIVAR_CUENTA',
      entityType: 'BankAccount',
      entityId: account.id,
      entityLabel: account.name,
      description: `Desactivó la cuenta ${account.name}`,
    });
    return account;
  }
  async reactivate(id: number, actor?: AuthUser) {
    await this.findOne(id);
    const account = await this.prisma.bankAccount.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
    await this.auditLog.log({
      actor,
      module: 'BANCOS',
      action: 'REACTIVAR_CUENTA',
      entityType: 'BankAccount',
      entityId: account.id,
      entityLabel: account.name,
      description: `Reactivó la cuenta ${account.name}`,
    });
    return account;
  }
  private ensurePositiveId(id: number) {
    if (id <= 0)
      throw new BadRequestException('El id debe ser un número positivo');
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) {
      return undefined;
    }

    if (status === RecordStatusQuery.INACTIVOS) {
      return { isActive: false };
    }

    return { isActive: true };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { bankName: { contains: q, mode: 'insensitive' as const } },
        { accountNumber: { contains: q, mode: 'insensitive' as const } },
        { accountType: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }
}
