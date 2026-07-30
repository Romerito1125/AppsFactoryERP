import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatusQuery } from '../../common/enums/record-status-query.enum';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { FilterProvidersDto } from './dto/filter-providers.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(filter: FilterProvidersDto) {
    const where = {
      ...this.getStatusWhere(filter.estado),
      ...this.getSearchWhere(filter.q),
    };
    const { page, limit, skip, take } = resolvePagination(filter);
    const [total, data] = await Promise.all([
      this.prisma.provider.count({ where }),
      this.prisma.provider.findMany({
        where,
        include: {
          _count: { select: { productLinks: true, purchaseOrders: true } },
        },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      include: {
        _count: { select: { productLinks: true, purchaseOrders: true } },
      },
    });
    if (!provider) throw new NotFoundException('Proveedor no encontrado');
    return provider;
  }

  async create(dto: CreateProviderDto, actor: AuthUser) {
    await this.ensureUniqueName(dto.name);
    await this.ensureUniqueTaxId(dto.taxId);
    const provider = await this.prisma.provider.create({
      data: { ...dto, taxId: dto.taxId?.trim() || null },
    });
    await this.auditLogService.log({
      actor,
      module: 'PROVEEDORES',
      action: 'CREATE',
      entityType: 'Provider',
      entityId: provider.id,
      entityLabel: provider.name,
      description: `Creo el proveedor ${provider.name}`,
      metadata: { providerId: provider.id, taxId: provider.taxId },
    });
    return provider;
  }

  async update(id: number, dto: UpdateProviderDto, actor: AuthUser) {
    this.ensurePositiveId(id);
    const current = await this.findOne(id);
    if (dto.name) await this.ensureUniqueName(dto.name, id);
    if (dto.taxId !== undefined) await this.ensureUniqueTaxId(dto.taxId, id);
    const provider = await this.prisma.provider.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.taxId !== undefined ? { taxId: dto.taxId?.trim() || null } : {}),
      },
    });
    await this.auditLogService.log({
      actor,
      module: 'PROVEEDORES',
      action: 'UPDATE',
      entityType: 'Provider',
      entityId: provider.id,
      entityLabel: provider.name,
      description: `Actualizo el proveedor ${provider.name}`,
      metadata: {
        providerId: provider.id,
        changedFields: Object.keys(dto),
        previousTaxId: current.taxId,
        nextTaxId: provider.taxId,
      },
    });
    return provider;
  }

  async remove(id: number, actor: AuthUser) {
    this.ensurePositiveId(id);
    await this.findOne(id);
    const activeProducts = await this.prisma.productProvider.count({
      where: { providerId: id, product: { isActive: true } },
    });
    if (activeProducts > 0) {
      throw new BadRequestException(
        'No se puede desactivar un proveedor con productos activos asociados',
      );
    }
    const provider = await this.prisma.provider.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    await this.auditLogService.log({
      actor,
      module: 'PROVEEDORES',
      action: 'DEACTIVATE',
      entityType: 'Provider',
      entityId: provider.id,
      entityLabel: provider.name,
      description: `Desactivo el proveedor ${provider.name}`,
      metadata: { providerId: provider.id },
    });
    return provider;
  }

  async reactivate(id: number, actor: AuthUser) {
    this.ensurePositiveId(id);
    await this.findOne(id);
    const provider = await this.prisma.provider.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });
    await this.auditLogService.log({
      actor,
      module: 'PROVEEDORES',
      action: 'REACTIVATE',
      entityType: 'Provider',
      entityId: provider.id,
      entityLabel: provider.name,
      description: `Reactivo el proveedor ${provider.name}`,
      metadata: { providerId: provider.id },
    });
    return provider;
  }

  private async ensureUniqueName(name: string, exceptId?: number) {
    const existing = await this.prisma.provider.findUnique({ where: { name } });
    if (existing && existing.id !== exceptId)
      throw new ConflictException('El nombre del proveedor ya existe');
  }

  private async ensureUniqueTaxId(taxId?: string | null, exceptId?: number) {
    const normalizedTaxId = taxId?.trim();

    if (!normalizedTaxId) return;

    const existing = await this.prisma.provider.findUnique({
      where: { taxId: normalizedTaxId },
    });

    if (existing && existing.id !== exceptId) {
      throw new ConflictException('El NIT o ID fiscal del proveedor ya existe');
    }
  }

  private getStatusWhere(status?: RecordStatusQuery) {
    if (status === RecordStatusQuery.TODOS) return undefined;
    if (status === RecordStatusQuery.INACTIVOS) return { isActive: false };
    return { isActive: true };
  }

  private getSearchWhere(search?: string) {
    const q = search?.trim();

    if (!q) return undefined;

    return {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { taxId: { contains: q, mode: 'insensitive' as const } },
        { providerType: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
        { address: { contains: q, mode: 'insensitive' as const } },
        { country: { contains: q, mode: 'insensitive' as const } },
        { phonePrimary: { contains: q, mode: 'insensitive' as const } },
        { phoneSecondary: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
        { legalRepresentative: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }

  private ensurePositiveId(id: number) {
    if (id <= 0)
      throw new BadRequestException('El id debe ser un número positivo');
  }
}
