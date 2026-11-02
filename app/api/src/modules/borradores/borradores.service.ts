import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';

const KINDS = ['VENTA', 'COMPRA'] as const;
export type DraftKind = (typeof KINDS)[number];

/**
 * Documentos en espera. Guardan solo la captura (líneas, precios, cliente/proveedor):
 * no tocan inventario, caja, bancos ni cartera hasta que el documento se confirma.
 * Cada usuario ve sus propios borradores; el ADMIN ve todos.
 */
@Injectable()
export class BorradoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  list(kind: string, actor: AuthUser) {
    this.assertKind(kind);
    return this.prisma.documentDraft.findMany({
      where: { kind, ...(actor.role === 'ADMIN' ? {} : { userId: actor.sub }) },
      omit: { payload: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: number, actor: AuthUser) {
    const draft = await this.prisma.documentDraft.findUnique({ where: { id } });
    if (!draft || (actor.role !== 'ADMIN' && draft.userId !== actor.sub)) {
      throw new NotFoundException('Borrador no encontrado');
    }
    return draft;
  }

  async save(
    dto: { id?: number; kind: string; title: string; payload: unknown },
    actor: AuthUser,
  ) {
    this.assertKind(dto.kind);
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Escribe un nombre para el borrador');
    const payload = dto.payload as Prisma.InputJsonValue;
    if (JSON.stringify(payload ?? null).length > 3_000_000) {
      throw new BadRequestException('El borrador es demasiado grande');
    }
    const saved = dto.id
      ? await this.update(dto.id, title, payload, actor)
      : await this.prisma.documentDraft.create({
          data: { kind: dto.kind, title, payload, userId: actor.sub, username: actor.username },
        });
    await this.auditLogService.log({
      actor,
      module: 'BORRADORES',
      action: dto.id ? 'UPDATE' : 'CREATE',
      entityType: 'DocumentDraft',
      entityId: saved.id,
      entityLabel: saved.title,
      description: `${dto.id ? 'Actualizo' : 'Guardo'} el borrador ${dto.kind} «${saved.title}»`,
    });
    return saved;
  }

  async remove(id: number, actor: AuthUser) {
    const draft = await this.findOne(id, actor);
    await this.prisma.documentDraft.delete({ where: { id } });
    await this.auditLogService.log({
      actor,
      module: 'BORRADORES',
      action: 'DELETE',
      entityType: 'DocumentDraft',
      entityId: id,
      entityLabel: draft.title,
      description: `Elimino el borrador ${draft.kind} «${draft.title}»`,
    });
    return { id };
  }

  private async update(id: number, title: string, payload: Prisma.InputJsonValue, actor: AuthUser) {
    await this.findOne(id, actor);
    return this.prisma.documentDraft.update({ where: { id }, data: { title, payload } });
  }

  private assertKind(kind: string) {
    if (!(KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException('Tipo de borrador no válido');
    }
  }
}
