import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

type AuditLogPayload = {
  actor?: AuthUser | null;
  module: string;
  action: string;
  entityType?: string;
  entityId?: number | null;
  entityLabel?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAuditLogQueryDto) {
    const { page, limit, skip, take } = resolvePagination(query);
    const where = this.buildWhere(query);
    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  findOne(id: number) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
      },
    });
  }

  log(payload: AuditLogPayload) {
    return this.prisma.auditLog.create({
      data: {
        userId: payload.actor?.sub ?? null,
        username: payload.actor?.username ?? null,
        userRole: payload.actor?.role ?? null,
        module: payload.module,
        action: payload.action,
        entityType: payload.entityType ?? null,
        entityId: payload.entityId ?? null,
        entityLabel: payload.entityLabel ?? null,
        description: payload.description ?? null,
        ...(payload.metadata
          ? { metadata: this.sanitizeMetadata(payload.metadata) }
          : {}),
      },
    });
  }

  private sanitizeMetadata(metadata?: Record<string, unknown> | null) {
    const normalized = JSON.parse(
      JSON.stringify(metadata, (key, value) => {
        if (
          ['password', 'accessToken', 'token', 'image'].includes(key) &&
          value !== undefined
        ) {
          return '[REDACTED]';
        }

        return value;
      }),
    ) as Record<string, unknown>;

    return normalized as Prisma.InputJsonValue;
  }

  private buildWhere(query: ListAuditLogQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    const and: Prisma.AuditLogWhereInput[] = [];
    const q = query.q?.trim();

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.module) {
      where.module = query.module.trim().toUpperCase();
    }

    if (query.action) {
      where.action = query.action.trim().toUpperCase();
    }

    const actionGroupPrefixes: Record<string, string[]> = {
      ELIMINACIONES: ['DEACTIVATE', 'DELETE', 'REMOVE', 'CANCEL', 'ANUL'],
      CREACIONES: ['CREATE', 'ENTRY'],
      MODIFICACIONES: ['UPDATE', 'CHANGE', 'ADJUSTMENT'],
      APROBACIONES: ['APPROVE', 'VALIDATE'],
      MOVIMIENTOS: ['EXIT', 'TRANSFER', 'ADJUSTMENT'],
    };
    const prefixes =
      actionGroupPrefixes[query.actionGroup?.trim().toUpperCase() ?? ''];
    if (prefixes?.length) {
      and.push({
        OR: prefixes.map((prefix) => ({ action: { startsWith: prefix } })),
      });
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate
          ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) }
          : {}),
        ...(query.endDate
          ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) }
          : {}),
      };
    }

    if (q) {
      and.push({
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { module: { contains: q, mode: 'insensitive' } },
          { action: { contains: q, mode: 'insensitive' } },
          { entityType: { contains: q, mode: 'insensitive' } },
          { entityLabel: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    if (and.length) where.AND = and;

    return where;
  }
}
