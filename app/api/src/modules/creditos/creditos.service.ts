import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BankMovementType, CreditStatus, InvoiceStatus } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateCreditPaymentDto,
  CreateInvoiceCreditDto,
  UpdateCreditStatusDto,
} from './dto/credit.dto';
import { ListCreditsQueryDto } from './dto/list-credits-query.dto';

@Injectable()
export class CreditosService {
  constructor(private readonly prisma: PrismaService) {}

  async createDirect(dto: CreateInvoiceCreditDto) {
    if (!dto.clientId) {
      throw new BadRequestException('Selecciona un cliente para el credito');
    }

    if (!dto.totalAmount) {
      throw new BadRequestException('Ingresa el monto total del credito');
    }

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (!client.isActive) throw new BadRequestException('El cliente esta inactivo');

    return this.prisma.invoiceCredit.create({
      data: {
        clientId: dto.clientId,
        dueDate: new Date(dto.dueDate),
        totalAmount: dto.totalAmount,
        paidAmount: 0,
        balance: dto.totalAmount,
        status: CreditStatus.PENDIENTE,
      },
      include: this.include,
    });
  }

  async createForInvoice(invoiceId: number, dto: CreateInvoiceCreditDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status === InvoiceStatus.ANULADA)
      throw new BadRequestException(
        'No se permite crédito sobre factura anulada',
      );
    return this.prisma.invoiceCredit.create({
      data: {
        invoiceId,
        clientId: invoice.clientId,
        dueDate: new Date(dto.dueDate),
        totalAmount: invoice.total,
        paidAmount: 0,
        balance: invoice.total,
        status: CreditStatus.PENDIENTE,
      },
      include: this.include,
    });
  }

  async findAll(query: ListCreditsQueryDto) {
    const where = {
      ...this.getStatusWhere(query.status),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, items] = await Promise.all([
      this.prisma.invoiceCredit.count({ where }),
      this.prisma.invoiceCredit.findMany({
        where,
        include: this.include,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(
      items.map((item) => this.withDueStatus(item)),
      total,
      page,
      limit,
    );
  }
  async findOne(id: number) {
    const credit = await this.prisma.invoiceCredit.findUnique({
      where: { id },
      include: this.include,
    });
    if (!credit) throw new NotFoundException('Crédito no encontrado');
    return this.withDueStatus(credit);
  }
  findByClient(clientId: number) {
    return this.prisma.invoiceCredit.findMany({
      where: { clientId },
      include: this.include,
      orderBy: { id: 'desc' },
    });
  }

  pay(id: number, dto: CreateCreditPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const credit = await tx.invoiceCredit.findUnique({ where: { id } });
      if (!credit) throw new NotFoundException('Crédito no encontrado');
      if (Number(credit.balance) < dto.amount)
        throw new BadRequestException(
          'El pago no puede superar el saldo pendiente',
        );
      let bankMovementId: number | undefined;
      if (dto.bankAccountId) {
        const account = await tx.bankAccount.findUnique({
          where: { id: dto.bankAccountId },
        });
        if (!account || !account.isActive)
          throw new BadRequestException(
            'Cuenta bancaria inexistente o inactiva',
          );
        await tx.bankAccount.update({
          where: { id: dto.bankAccountId },
          data: { currentBalance: { increment: dto.amount } },
        });
        const movement = await tx.bankAccountMovement.create({
          data: {
            bankAccountId: dto.bankAccountId,
            movementType: BankMovementType.INGRESO,
            amount: dto.amount,
            description: `Pago crédito ${id}`,
            invoiceId: credit.invoiceId ?? undefined,
          },
        });
        bankMovementId = movement.id;
      }
      await tx.creditPayment.create({
        data: {
          invoiceCreditId: id,
          amount: dto.amount,
          notes: dto.notes,
          bankMovementId,
        },
      });
      const paidAmount = Number(credit.paidAmount) + dto.amount;
      const balance = Number(credit.balance) - dto.amount;
      return tx.invoiceCredit.update({
        where: { id },
        data: {
          paidAmount,
          balance,
          status: balance === 0 ? CreditStatus.PAGADA : CreditStatus.PARCIAL,
        },
        include: this.include,
      });
    });
  }

  async updateStatus(id: number, dto: UpdateCreditStatusDto) {
    await this.findOne(id);
    return this.prisma.invoiceCredit.update({
      where: { id },
      data: { status: dto.status },
      include: this.include,
    });
  }

  private readonly include = {
    invoice: { include: { client: true } },
    client: true,
    payments: { include: { bankMovement: true }, orderBy: { id: 'desc' } },
  } as const;
  private withDueStatus(credit) {
    return Number(credit.balance) > 0 && credit.dueDate < new Date()
      ? { ...credit, reportedStatus: CreditStatus.VENCIDA }
      : credit;
  }

  private getStatusWhere(status?: ListCreditsQueryDto['status']) {
    if (!status) return undefined;
    return { status };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
        OR: [
          { invoice: { consecutive: { contains: q, mode: 'insensitive' as const } } },
          { client: { firstName: { contains: q, mode: 'insensitive' as const } } },
          { client: { lastName: { contains: q, mode: 'insensitive' as const } } },
          { client: { identification: { contains: q, mode: 'insensitive' as const } } },
          { invoice: { client: { firstName: { contains: q, mode: 'insensitive' as const } } } },
          { invoice: { client: { lastName: { contains: q, mode: 'insensitive' as const } } } },
          { invoice: { client: { identification: { contains: q, mode: 'insensitive' as const } } } },
      ],
    };
  }
}
