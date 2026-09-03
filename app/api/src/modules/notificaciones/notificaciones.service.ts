import { Injectable } from '@nestjs/common';
import { InvoiceSource, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

type InvoiceNotificationPayload = {
  id: number;
  consecutive: string;
  source: InvoiceSource;
  total: Prisma.Decimal | number;
  client: {
    firstName: string;
    lastName: string;
  };
  createdByRole?: string | null;
  createdByUsername?: string | null;
};

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  findRecent(limit = 12) {
    return this.prisma.notification.findMany({
      take: limit,
      orderBy: { id: 'desc' },
      include: {
        invoice: {
          select: {
            id: true,
            consecutive: true,
            source: true,
            total: true,
            status: true,
            createdAt: true,
            createdByRole: true,
            createdByUsername: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
  }

  async createInvoiceNotification(
    tx: Prisma.TransactionClient,
    invoice: InvoiceNotificationPayload,
  ) {
    const notificationType = this.resolveNotificationType(invoice.source);
    const actorLabel = this.resolveActorLabel(
      invoice.source,
      invoice.createdByRole,
      invoice.createdByUsername,
    );
    const clientName =
      `${invoice.client.firstName} ${invoice.client.lastName}`.trim();
    const total = Number(invoice.total ?? 0);

    return tx.notification.create({
      data: {
        type: notificationType,
        title: this.resolveTitle(invoice.source),
        message: `${invoice.consecutive} · ${clientName || 'Cliente sin nombre'} · ${actorLabel} · $${total.toFixed(2)}`,
        source: invoice.source,
        invoiceId: invoice.id,
      },
    });
  }

  async createSocialWorkNotification(
    tx: Prisma.TransactionClient,
    payload: { invoiceId: number; amount: number },
  ) {
    return tx.notification.create({
      data: {
        type: NotificationType.OBRA_SOCIAL,
        title: 'Aporte para obra social',
        message: `La generación 4 de referidos destinó $${Number(payload.amount).toFixed(2)} a utilidades generales para obra social. Este valor no se entrega como beneficio al cliente.`,
        invoiceId: payload.invoiceId,
      },
    });
  }

  private resolveNotificationType(source: InvoiceSource) {
    if (source === InvoiceSource.APP_MOVIL) {
      return NotificationType.PEDIDO_APP;
    }

    if (source === InvoiceSource.POS) {
      return NotificationType.VENTA_POS;
    }

    return NotificationType.FACTURA;
  }

  private resolveTitle(source: InvoiceSource) {
    if (source === InvoiceSource.APP_MOVIL) {
      return 'Nuevo pedido desde la app';
    }

    if (source === InvoiceSource.POS) {
      return 'Nueva venta en POS';
    }

    return 'Nueva factura registrada';
  }

  private resolveActorLabel(
    source: InvoiceSource,
    createdByRole?: string | null,
    createdByUsername?: string | null,
  ) {
    if (source === InvoiceSource.APP_MOVIL) {
      return 'App movil';
    }

    if (!createdByRole && !createdByUsername) {
      return 'Usuario interno';
    }

    return [createdByRole, createdByUsername].filter(Boolean).join(' · ');
  }
}
