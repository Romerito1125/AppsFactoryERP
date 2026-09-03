import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateRetentionDto } from './dto/create-retention.dto';
import { FilterRetentionsDto } from './dto/filter-retentions.dto';
import { UpdateRetentionDto } from './dto/update-retention.dto';

@Injectable()
export class RetencionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(filter: FilterRetentionsDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.retention.count({ where }),
      this.prisma.retention.findMany({
        where,
        include: { ranges: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const retention = await this.prisma.retention.findUnique({
      where: { id },
      include: { ranges: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    if (!retention) throw new NotFoundException('Retención no encontrada');
    return retention;
  }

  async create(dto: CreateRetentionDto, actor: AuthUser) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.retention.findUnique({
      where: { code },
    });
    if (existing)
      throw new ConflictException('El código de retención ya existe');
    const retention = await this.prisma.retention.create({
      data: {
        code,
        description: dto.description.trim(),
        subtracting: dto.subtracting ?? 0,
        minimumBase: dto.minimumBase ?? 0,
        operationCode: dto.operationCode?.trim() || null,
        operationDescription: dto.operationDescription?.trim() || null,
        applySales: dto.applySales ?? false,
        applyPurchases: dto.applyPurchases ?? false,
        isActive: dto.isActive ?? true,
        ranges: dto.ranges?.length
          ? { create: this.normalizeRanges(dto.ranges) }
          : undefined,
      },
      include: { ranges: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    await this.auditLogService.log({
      actor,
      module: 'RETENCIONES',
      action: 'CREATE',
      entityType: 'Retention',
      entityId: retention.id,
      entityLabel: retention.code,
      description: `Creo la retención ${retention.code}`,
    });
    return retention;
  }

  async update(id: number, dto: UpdateRetentionDto, actor: AuthUser) {
    const current = await this.findOne(id);
    const code = dto.code?.trim().toUpperCase();
    if (code && code !== current.code) {
      const existing = await this.prisma.retention.findUnique({
        where: { code },
      });
      if (existing)
        throw new ConflictException('El código de retención ya existe');
    }
    const { ranges, ...retentionData } = dto;
    const retention = await this.prisma.$transaction(async (tx) => {
      await tx.retention.update({
        where: { id },
        data: {
          ...retentionData,
          ...(code ? { code } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() }
            : {}),
          ...(dto.operationCode !== undefined
            ? { operationCode: dto.operationCode.trim() || null }
            : {}),
          ...(dto.operationDescription !== undefined
            ? { operationDescription: dto.operationDescription.trim() || null }
            : {}),
        },
      });
      if (ranges !== undefined) {
        await tx.retentionRange.deleteMany({ where: { retentionId: id } });
        if (ranges.length) {
          await tx.retentionRange.createMany({
            data: this.normalizeRanges(ranges).map((range) => ({
              ...range,
              retentionId: id,
            })),
          });
        }
      }
      return tx.retention.findUniqueOrThrow({
        where: { id },
        include: { ranges: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      });
    });
    await this.auditLogService.log({
      actor,
      module: 'RETENCIONES',
      action: 'UPDATE',
      entityType: 'Retention',
      entityId: retention.id,
      entityLabel: retention.code,
      description: `Actualizo la retención ${retention.code}`,
      metadata: { changedFields: Object.keys(dto) },
    });
    return retention;
  }

  async remove(id: number, actor: AuthUser) {
    const current = await this.findOne(id);
    const retention = await this.prisma.retention.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: { ranges: true },
    });
    await this.auditLogService.log({
      actor,
      module: 'RETENCIONES',
      action: 'DEACTIVATE',
      entityType: 'Retention',
      entityId: id,
      entityLabel: current.code,
      description: `Desactivo la retención ${current.code}`,
    });
    return retention;
  }

  async reactivate(id: number, actor: AuthUser) {
    const current = await this.findOne(id);
    const retention = await this.prisma.retention.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
      include: { ranges: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    await this.auditLogService.log({
      actor,
      module: 'RETENCIONES',
      action: 'REACTIVATE',
      entityType: 'Retention',
      entityId: id,
      entityLabel: current.code,
      description: `Reactivo la retención ${current.code}`,
    });
    return retention;
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) return undefined;
    return { isActive: status === RecordStatusQuery.INACTIVOS ? false : true };
  }

  private getSearchWhere(q?: string) {
    const search = q?.trim();
    if (!search) return undefined;
    return {
      OR: [
        { code: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
        { operationCode: { contains: search, mode: 'insensitive' as const } },
      ],
    };
  }

  private normalizeRanges(ranges: CreateRetentionDto['ranges']) {
    return (ranges ?? []).map((range, index) => {
      if (range.maximum < range.minimum) {
        throw new ConflictException(
          'El rango máximo no puede ser menor al mínimo',
        );
      }
      return {
        minimum: range.minimum,
        maximum: range.maximum,
        percentage: range.percentage,
        sortOrder: range.sortOrder ?? index,
      } satisfies Prisma.RetentionRangeCreateWithoutRetentionInput;
    });
  }
}
