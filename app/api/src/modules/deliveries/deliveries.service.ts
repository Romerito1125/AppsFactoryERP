import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, InvoiceStatus } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListDeliveriesQueryDto) {
    const where = {
      ...this.getStatusWhere(query.status),
      ...this.getSearchWhere(query.q),
    };
    const { page, limit, skip, take } = resolvePagination(query);
    const [total, data] = await Promise.all([
      this.prisma.delivery.count({ where }),
      this.prisma.delivery.findMany({
        where,
        include: this.deliveryInclude,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
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

  private getStatusWhere(status?: ListDeliveriesQueryDto['status']) {
    if (!status) return undefined;
    return { status };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { address: { contains: q, mode: 'insensitive' as const } },
        { recipientName: { contains: q, mode: 'insensitive' as const } },
        { recipientPhone: { contains: q, mode: 'insensitive' as const } },
        {
          invoice: {
            consecutive: { contains: q, mode: 'insensitive' as const },
          },
        },
      ],
    };
  }
}
