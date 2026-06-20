import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BankMovementType, CreditStatus, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateCreditPaymentDto,
  CreateInvoiceCreditDto,
  UpdateCreditStatusDto,
} from './dto/credit.dto';

@Injectable()
export class CreditosService {
  constructor(private readonly prisma: PrismaService) {}

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
        dueDate: new Date(dto.dueDate),
        totalAmount: invoice.total,
        paidAmount: 0,
        balance: invoice.total,
        status: CreditStatus.PENDIENTE,
      },
      include: this.include,
    });
  }

  findAll() {
    return this.prisma.invoiceCredit
      .findMany({ include: this.include, orderBy: { id: 'desc' } })
      .then((items) => items.map((item) => this.withDueStatus(item)));
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
      where: { invoice: { clientId } },
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
            invoiceId: credit.invoiceId,
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
    payments: { include: { bankMovement: true }, orderBy: { id: 'desc' } },
  } as const;
  private withDueStatus(credit) {
    return Number(credit.balance) > 0 && credit.dueDate < new Date()
      ? { ...credit, reportedStatus: CreditStatus.VENCIDA }
      : credit;
  }
}
