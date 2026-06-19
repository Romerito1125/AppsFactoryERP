import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.delivery.findMany({
      include: this.deliveryInclude,
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);

    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: this.deliveryInclude,
    });

    if (!delivery) {
      throw new NotFoundException('Domicilio no encontrado');
    }

    return delivery;
  }

  async create(createDeliveryDto: CreateDeliveryDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: createDeliveryDto.invoiceId },
      include: { delivery: true },
    });

    if (!invoice) {
      throw new NotFoundException('Factura no encontrada');
    }

    if (invoice.status === InvoiceStatus.ANULADA) {
      throw new BadRequestException(
        'No se puede crear domicilio para una factura anulada',
      );
    }

    if (invoice.delivery) {
      throw new ConflictException('La factura ya tiene un domicilio');
    }

    return this.prisma.delivery.create({
      data: {
        ...createDeliveryDto,
        status: DeliveryStatus.PENDIENTE,
      },
      include: this.deliveryInclude,
    });
  }

  async update(id: number, updateDeliveryDto: UpdateDeliveryDto) {
    await this.findOne(id);

    return this.prisma.delivery.update({
      where: { id },
      data: updateDeliveryDto,
      include: this.deliveryInclude,
    });
  }

  async updateStatus(
    id: number,
    updateDeliveryStatusDto: UpdateDeliveryStatusDto,
  ) {
    const delivery = await this.findOne(id);
    const status = updateDeliveryStatusDto.status;

    return this.prisma.delivery.update({
      where: { id },
      data: {
        status,
        deliveredAt:
          status === DeliveryStatus.ENTREGADO
            ? new Date()
            : delivery.status === DeliveryStatus.ENTREGADO
              ? null
              : delivery.deliveredAt,
      },
      include: this.deliveryInclude,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.delivery.update({
      where: { id },
      data: {
        status: DeliveryStatus.CANCELADO,
        // Delivery no tiene isActive; cancelar conserva trazabilidad sin borrado físico.
        deliveredAt: null,
      },
      include: this.deliveryInclude,
    });
  }

  private readonly deliveryInclude = {
    invoice: {
      select: { id: true, consecutive: true, status: true, total: true },
    },
  } as const;

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
