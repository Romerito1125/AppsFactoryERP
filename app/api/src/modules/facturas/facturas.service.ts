import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

@Injectable()
export class FacturasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.invoice.findMany({
      include: this.invoiceInclude,
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.invoiceInclude,
    });

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    return invoice;
  }

  async create(createInvoiceDto: CreateInvoiceDto) {
    // Factura, detalles y descuento de stock deben confirmarse o fallar juntos.
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: createInvoiceDto.clientId },
      });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (!client.isActive) {
        throw new BadRequestException(
          'No se puede facturar a un cliente inactivo',
        );
      }

      const groupedItems = this.groupItems(createInvoiceDto.items);
      const productIds = groupedItems.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      if (products.length !== productIds.length) {
        throw new NotFoundException('Uno o más productos no existen');
      }

      const invoiceItems = groupedItems.map((item) => {
        const product = products.find(
          (current) => current.id === item.productId,
        );

        if (!product) {
          throw new NotFoundException('Producto no encontrado');
        }

        if (!product.isActive) {
          throw new BadRequestException(
            `El producto ${product.id} está inactivo`,
          );
        }

        if (product.quantity < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para el producto ${product.id}`,
          );
        }

        const unitPrice = Number(product.price);
        const taxRate = Number(product.taxRate);
        // El precio e impuesto se congelan en el detalle para conservar histórico.
        const subtotal = unitPrice * item.quantity;
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        return {
          productId: product.id,
          quantity: item.quantity,
          unitPrice,
          taxRate,
          subtotal,
          taxAmount,
          total,
        };
      });

      for (const item of invoiceItems) {
        // updateMany evita vender si otro proceso consumió el stock antes.
        const updated = await tx.product.updateMany({
          where: { id: item.productId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });

        if (updated.count !== 1) {
          throw new BadRequestException(
            `Stock insuficiente para el producto ${item.productId}`,
          );
        }
      }

      const subtotal = invoiceItems.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );
      const taxes = invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0);
      const total = invoiceItems.reduce((sum, item) => sum + item.total, 0);

      return tx.invoice.create({
        data: {
          consecutive: this.generateConsecutive(),
          clientId: createInvoiceDto.clientId,
          subtotal,
          taxes,
          total,
          items: { create: invoiceItems },
        },
        include: this.invoiceInclude,
      });
    });
  }

  async update(id: number, updateInvoiceDto: UpdateInvoiceDto) {
    this.ensurePositiveId(id);
    await this.findOne(id);

    if (updateInvoiceDto.consecutive) {
      const existingInvoice = await this.prisma.invoice.findUnique({
        where: { consecutive: updateInvoiceDto.consecutive },
      });

      if (existingInvoice && existingInvoice.id !== id) {
        throw new ConflictException('El consecutivo ya existe');
      }
    }

    // Los totales e items no se actualizan aquí para evitar inconsistencias contables.
    return this.prisma.invoice.update({
      where: { id },
      data: updateInvoiceDto,
      include: this.invoiceInclude,
    });
  }

  async remove(id: number) {
    this.ensurePositiveId(id);

    // Anular devuelve stock y conserva la factura para trazabilidad.
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!invoice) {
        throw new NotFoundException('Factura no encontrada');
      }

      if (invoice.status === InvoiceStatus.ANULADA) {
        throw new BadRequestException('La factura ya está anulada');
      }

      for (const item of invoice.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
      }

      return tx.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.ANULADA },
        include: this.invoiceInclude,
      });
    });
  }

  private readonly invoiceInclude = {
    client: true,
    items: { include: { product: { include: { productType: true } } } },
  } as const;

  private groupItems(items: CreateInvoiceDto['items']) {
    const groupedItems = new Map<number, number>();

    // Agrupa productos repetidos para validar stock contra la cantidad total.
    for (const item of items) {
      groupedItems.set(
        item.productId,
        (groupedItems.get(item.productId) ?? 0) + item.quantity,
      );
    }

    return Array.from(groupedItems.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }

  private generateConsecutive() {
    return `FAC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
