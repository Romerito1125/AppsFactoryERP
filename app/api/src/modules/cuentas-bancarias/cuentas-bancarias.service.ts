import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dto';

@Injectable()
export class CuentasBancariasService {
  constructor(private readonly prisma: PrismaService) {}
  findAll() {
    return this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
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
}
