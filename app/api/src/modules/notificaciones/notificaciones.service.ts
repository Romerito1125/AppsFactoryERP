import { Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceSource,
  NotificationPriority,
  NotificationType,
  Prisma,
  Role,
} from '@prisma/client';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
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
  warehouseId?: number | null;
  items?: Array<{ warehouseId?: number | null }>;
};

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findCenter(authUser: AuthUser, limit = 25) {
    const take = Math.min(Math.max(Number(limit) || 25, 1), 50);
    const [notifications, activity] = await Promise.all([
      this.prisma.notification.findMany({
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where:
          authUser.role === Role.BODEGA
            ? {
                recipientUserId: authUser.sub,
              }
            : undefined,
        include: {
          reads: {
            where: { userId: authUser.sub },
            select: { id: true, readAt: true },
          },
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
      }),
      this.prisma.auditLog.findMany({
        take,
        where: authUser.role === 'ADMIN' ? undefined : { userId: authUser.sub },
        include: {
          user: {
            select: { id: true, username: true, role: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const legacyConsecutives = Array.from(
      new Set(
        notifications.flatMap((item) => {
          if (item.invoiceId || item.actionEntityId) return [];
          const consecutive = this.extractInvoiceConsecutive(item.message);
          return consecutive ? [consecutive] : [];
        }),
      ),
    );
    const legacyInvoices = legacyConsecutives.length
      ? await this.prisma.invoice.findMany({
          where: { consecutive: { in: legacyConsecutives } },
          select: { id: true, consecutive: true },
        })
      : [];
    const legacyInvoiceIds = new Map(
      legacyInvoices.map((invoice) => [invoice.consecutive, invoice.id]),
    );

    const mappedNotifications = notifications.map(({ reads, ...item }) => ({
      ...item,
      isRead: reads.length > 0,
      action: this.resolveNotificationAction(
        item,
        legacyInvoiceIds.get(this.extractInvoiceConsecutive(item.message) ?? "") ?? null,
      ),
    }));

    return {
      notifications: mappedNotifications,
      activity: activity.map((item) => ({
        ...item,
        action: this.resolveActivityAction(item),
      })),
      unreadCount: mappedNotifications.filter((item) => !item.isRead).length,
      generatedAt: new Date().toISOString(),
    };
  }

  async markAsRead(id: number, userId: number) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    return this.prisma.notificationRead.upsert({
      where: { notificationId_userId: { notificationId: id, userId } },
      create: { notificationId: id, userId },
      update: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: number) {
    const unread = await this.prisma.notification.findMany({
      where: { reads: { none: { userId } } },
      select: { id: true },
    });

    if (unread.length) {
      await this.prisma.notificationRead.createMany({
        data: unread.map(({ id }) => ({ notificationId: id, userId })),
        skipDuplicates: true,
      });
    }

    return { marked: unread.length };
  }

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

    const data = {
        type: notificationType,
        title: this.resolveTitle(invoice.source),
        message: `${invoice.consecutive} · ${clientName || 'Cliente sin nombre'} · ${actorLabel} · $${total.toFixed(2)}`,
        source: invoice.source,
        invoiceId: invoice.id,
        actionLabel: this.resolveActionLabel(invoice.source),
        actionModule: this.resolveActionModule(invoice.source),
        actionView: this.resolveActionView(invoice.source),
        actionEntityId: invoice.id,
        priority: this.resolvePriority(invoice.source),
    };

    if (invoice.source === InvoiceSource.APP_MOVIL) {
      const warehouseIds = Array.from(
        new Set(
          [invoice.warehouseId, ...(invoice.items ?? []).map((item) => item.warehouseId)]
            .filter((warehouseId): warehouseId is number => Number.isInteger(warehouseId)),
        ),
      );
      const recipients = warehouseIds.length
        ? await tx.user.findMany({
            where: {
              role: Role.BODEGA,
              warehouseId: { in: warehouseIds },
              isActive: true,
              deletedAt: null,
            },
            select: { id: true },
          })
        : [];

      if (recipients.length) {
        return tx.notification.createMany({
          data: recipients.map((recipient) => ({
            ...data,
            recipientUserId: recipient.id,
          })),
        });
      }
    }

    return tx.notification.create({ data });
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

  async createWarehouseTaskNotification(payload: {
    recipientUserId: number;
    quoteId: number;
    quoteConsecutive: string;
    warehouseName: string;
  }) {
    return this.prisma.notification.create({
      data: {
        type: NotificationType.BODEGA_TAREA,
        title: 'Cotización enviada a Bodega',
        message: `${payload.quoteConsecutive} · Revisa productos y cantidades en ${payload.warehouseName}`,
        actionLabel: 'Ver cotización',
        actionModule: 'warehouse',
        actionView: 'quote',
        actionEntityId: payload.quoteId,
        recipientUserId: payload.recipientUserId,
        priority: NotificationPriority.IMPORTANTE,
      },
    });
  }

  async createPurchaseOrderNotifications(
    tx: Prisma.TransactionClient,
    payload: {
      purchaseOrderId: number;
      consecutive: string;
      providerName: string;
      warehouseId: number;
      warehouseName: string;
      itemCount: number;
      total: Prisma.Decimal | number;
    },
  ) {
    const recipients = await tx.user.findMany({
      where: {
        role: Role.BODEGA,
        warehouseId: payload.warehouseId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    const baseNotification = {
      type: NotificationType.BODEGA_TAREA,
      title: 'Nueva compra ordenada para Bodega',
      message: `${payload.consecutive} · ${payload.providerName} · ${payload.itemCount} producto(s) · $${Number(payload.total).toFixed(2)} · Revisar en ${payload.warehouseName}`,
      actionLabel: 'Ver compra',
      actionModule: 'warehouse',
      actionView: 'purchase-order',
      actionEntityId: payload.purchaseOrderId,
      priority: NotificationPriority.IMPORTANTE,
    };

    return tx.notification.createMany({
      data: recipients.length
        ? recipients.map((recipient) => ({
            ...baseNotification,
            recipientUserId: recipient.id,
          }))
        : [{ ...baseNotification, recipientUserId: null }],
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

  private resolveNotificationAction(notification: {
    type: NotificationType;
    source: InvoiceSource | null;
    message: string;
    actionLabel: string | null;
    actionModule: string | null;
    actionView: string | null;
    actionEntityId: number | null;
    invoiceId: number | null;
  }, fallbackInvoiceId: number | null = null) {
    if (notification.type === NotificationType.BODEGA_TAREA) {
      return {
        label: notification.actionLabel ?? 'Ver cotización',
        module: notification.actionModule ?? 'warehouse',
        view: notification.actionView ?? 'quote',
        entityId: notification.actionEntityId,
      };
    }
    const source = notification.source;
    const isPosSale = notification.type === NotificationType.VENTA_POS || source === InvoiceSource.POS;
    return {
      label: isPosSale
        ? 'Ver facturación'
        : notification.actionLabel ?? this.resolveActionLabel(source, notification.type),
      module: isPosSale
        ? 'sales'
        : notification.actionModule ?? this.resolveActionModule(source, notification.type),
      view: isPosSale
        ? 'billing'
        : notification.actionView ?? this.resolveActionView(source, notification.type),
      entityId:
        notification.actionEntityId ?? notification.invoiceId ?? fallbackInvoiceId,
    };
  }

  private extractInvoiceConsecutive(message: string | null | undefined) {
    return message?.split(' · ')[0]?.trim() || null;
  }

  private resolveActivityAction(item: {
    module: string;
    action: string;
    entityId: number | null;
    metadata: Prisma.JsonValue | null;
  }) {
    const module = item.module.trim().toUpperCase();
    const source =
      item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? (item.metadata as Record<string, unknown>).source
        : undefined;
    const sourceLabel = String(source ?? '').toUpperCase();

    if (module === 'FACTURAS' && sourceLabel === 'POS') {
      return { label: 'Ver facturación', module: 'sales', view: 'billing', entityId: item.entityId };
    }
    if (module === 'FACTURAS' && sourceLabel === 'APP_MOVIL') {
      return { label: 'Revisar pedidos', module: 'sales', view: 'orders', entityId: item.entityId };
    }
    if (module === 'FACTURAS') {
      return { label: 'Ver facturación', module: 'sales', view: 'billing', entityId: item.entityId };
    }
    if (module.includes('COTIZ')) {
      return { label: 'Abrir cotizaciones', module: 'sales', view: 'quotes', entityId: item.entityId };
    }
    if (module.includes('COMPRA')) {
      return { label: 'Abrir compras', module: 'purchases', view: 'purchases', entityId: item.entityId };
    }
    if (module.includes('BANCO') || module.includes('FINAN')) {
      return { label: 'Abrir finanzas', module: 'banks', view: 'home', entityId: item.entityId };
    }
    if (module.includes('USUAR')) {
      return { label: 'Abrir usuarios', module: 'administrative', view: 'users', entityId: item.entityId };
    }
    if (module.includes('CLIENT')) {
      return { label: 'Abrir clientes', module: 'administrative', view: 'clients', entityId: item.entityId };
    }
    if (module.includes('PROVEED')) {
      return { label: 'Abrir proveedores', module: 'administrative', view: 'providers', entityId: item.entityId };
    }
    if (module.includes('BODEG')) {
      return { label: 'Abrir bodegas', module: 'administrative', view: 'warehouses', entityId: item.entityId };
    }
    if (module.includes('PRODUCT') || module.includes('INVENT')) {
      return { label: 'Abrir productos', module: 'administrative', view: 'products', entityId: item.entityId };
    }
    return { label: 'Ver módulo administrativo', module: 'administrative', view: null, entityId: item.entityId };
  }

  private resolveActionLabel(source: InvoiceSource | null, type?: NotificationType) {
    if (source === InvoiceSource.POS || type === NotificationType.VENTA_POS) return 'Ver facturación';
    if (source === InvoiceSource.APP_MOVIL || type === NotificationType.PEDIDO_APP) return 'Revisar pedidos';
    if (type === NotificationType.OBRA_SOCIAL) return 'Abrir finanzas';
    return 'Ver facturación';
  }

  private resolveActionModule(source: InvoiceSource | null, type?: NotificationType) {
    if (source === InvoiceSource.POS || type === NotificationType.VENTA_POS) return 'sales';
    if (source === InvoiceSource.APP_MOVIL || type === NotificationType.PEDIDO_APP) return 'sales';
    if (type === NotificationType.OBRA_SOCIAL) return 'banks';
    return 'sales';
  }

  private resolveActionView(source: InvoiceSource | null, type?: NotificationType) {
    if (source === InvoiceSource.POS || type === NotificationType.VENTA_POS) return 'billing';
    if (source === InvoiceSource.APP_MOVIL || type === NotificationType.PEDIDO_APP) return 'orders';
    if (type === NotificationType.OBRA_SOCIAL) return 'home';
    return 'billing';
  }

  private resolvePriority(source: InvoiceSource) {
    return source === InvoiceSource.APP_MOVIL
      ? NotificationPriority.IMPORTANTE
      : NotificationPriority.NORMAL;
  }
}
