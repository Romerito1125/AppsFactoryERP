import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
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
  constructor(private readonly prisma: PrismaService) {}
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
  create(dto: CreateBankAccountDto) {
    return this.prisma.bankAccount.create({ data: dto });
  }
  async update(id: number, dto: UpdateBankAccountDto) {
    await this.findOne(id);
    return this.prisma.bankAccount.update({ where: { id }, data: dto });
  }
  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.bankAccount.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }
  async reactivate(id: number) {
    await this.findOne(id);
    return this.prisma.bankAccount.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
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
