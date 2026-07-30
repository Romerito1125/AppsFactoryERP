import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Client, InvoiceStatus, ReferralBenefitStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

type ReferralClient = Pick<
  Client,
  | 'id'
  | 'identification'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'address'
  | 'isActive'
  | 'referralCode'
>;

type ReferralGeneration = {
  generation: number;
  clients: ReferralClient[];
};

type ReferralMetrics = {
  cantidadCompras: number;
  compras: number;
  utilidadBaseHistorica: number;
  descuentoGenerado: number;
  descuentoDisponible: number;
};

@Injectable()
export class ReferralStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNetwork(clientId: number) {
    await this.ensureActiveClient(clientId);
    const generations = await this.buildGenerations(clientId);
    const enrichedGenerations = await this.enrichGenerations(
      clientId,
      generations,
    );

    return {
      clientId,
      generations: enrichedGenerations,
    };
  }

  async getStats(clientId: number) {
    await this.ensureActiveClient(clientId);
    const generations = await this.buildGenerations(clientId);
    const enrichedGenerations = await this.enrichGenerations(
      clientId,
      generations,
    );
    const totals = enrichedGenerations.reduce(
      (result, generation) =>
        this.addMetrics(result, {
          cantidadCompras: generation.cantidadCompras,
          compras: generation.compras,
          utilidadBaseHistorica: generation.utilidadBaseHistorica,
          descuentoGenerado: generation.descuentoGenerado,
          descuentoDisponible: generation.descuentoDisponible,
        }),
      this.emptyMetrics(),
    );
    const directGeneration = enrichedGenerations.find(
      (generation) => generation.generation === 1,
    );

    return {
      clientId,
      totalReferidosDirectos: directGeneration?.totalClientes ?? 0,
      totalReferidosRed: enrichedGenerations.reduce(
        (sum, generation) => sum + generation.totalClientes,
        0,
      ),
      cantidadCompras: totals.cantidadCompras,
      compras: totals.compras,
      utilidadBaseHistorica: totals.utilidadBaseHistorica,
      descuentoGenerado: totals.descuentoGenerado,
      descuentoDisponible: totals.descuentoDisponible,
      generaciones: enrichedGenerations,
      // Se conservan estas claves para consumidores existentes, ahora calculadas
      // con beneficios sobre utilidad en lugar de porcentajes sobre ventas.
      totalCompradoPorReferidos: totals.compras,
      ventasPorGeneracion: enrichedGenerations.map((generation) => ({
        generation: generation.generation,
        total: generation.compras,
      })),
      comisionGanada: totals.descuentoGenerado,
      comisionDisponible: totals.descuentoDisponible,
      comisionPorGeneracion: enrichedGenerations.map((generation) => ({
        generation: generation.generation,
        percentage: generation.percentage,
        baseProfit: generation.utilidadBaseHistorica,
        commission: generation.descuentoGenerado,
        available: generation.descuentoDisponible,
      })),
    };
  }

  private async enrichGenerations(
    beneficiaryClientId: number,
    generations: ReferralGeneration[],
  ) {
    const clientIds = generations.flatMap((generation) =>
      generation.clients.map((client) => client.id),
    );
    const [invoices, benefits, policies] = await Promise.all([
      clientIds.length
        ? this.prisma.invoice.findMany({
            where: {
              clientId: { in: clientIds },
              status: InvoiceStatus.ACTIVA,
            },
            select: {
              clientId: true,
              total: true,
              items: { select: { profitAmount: true } },
            },
          })
        : [],
      this.prisma.referralBenefit.findMany({
        where: {
          beneficiaryClientId,
          status: { not: ReferralBenefitStatus.ANULADO },
        },
        select: {
          buyerClientId: true,
          generation: true,
          amount: true,
          remainingAmount: true,
        },
      }),
      this.prisma.referralProfitPolicy.findMany({
        where: { isActive: true },
        select: { generation: true, percentage: true },
      }),
    ]);
    const metricsByClient = new Map<number, ReferralMetrics>();
    const policyByGeneration = new Map(
      policies.map((policy) => [policy.generation, Number(policy.percentage)]),
    );

    for (const clientId of clientIds) {
      metricsByClient.set(clientId, this.emptyMetrics());
    }

    for (const invoice of invoices) {
      const metrics = metricsByClient.get(invoice.clientId);

      if (!metrics) continue;

      metrics.cantidadCompras += 1;
      metrics.compras = this.roundMoney(
        metrics.compras + Number(invoice.total),
      );
      metrics.utilidadBaseHistorica = this.roundMoney(
        metrics.utilidadBaseHistorica +
          invoice.items.reduce(
            (sum, item) => sum + Number(item.profitAmount ?? 0),
            0,
          ),
      );
    }

    for (const benefit of benefits) {
      const metrics = metricsByClient.get(benefit.buyerClientId);

      if (!metrics) continue;

      metrics.descuentoGenerado = this.roundMoney(
        metrics.descuentoGenerado + Number(benefit.amount),
      );
      metrics.descuentoDisponible = this.roundMoney(
        metrics.descuentoDisponible + Number(benefit.remainingAmount),
      );
    }

    return generations.map((generation) => {
      const clients = generation.clients.map((client) => ({
        ...client,
        ...(metricsByClient.get(client.id) ?? this.emptyMetrics()),
      }));
      const totals = clients.reduce(
        (result, client) => this.addMetrics(result, client),
        this.emptyMetrics(),
      );

      return {
        generation: generation.generation,
        percentage: policyByGeneration.get(generation.generation) ?? 0,
        totalClientes: clients.length,
        ...totals,
        clients,
      };
    });
  }

  private async buildGenerations(clientId: number) {
    const generations: ReferralGeneration[] = [];
    let currentClientIds = [clientId];
    let generation = 1;
    const visited = new Set<number>([clientId]);

    while (currentClientIds.length && generation <= 4) {
      const referrals = await this.prisma.referral.findMany({
        where: { referrerClientId: { in: currentClientIds } },
        include: {
          referredClient: {
            select: {
              id: true,
              identification: true,
              firstName: true,
              lastName: true,
              phone: true,
              address: true,
              isActive: true,
              referralCode: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      });
      const clients = referrals
        .map((referral) => referral.referredClient)
        .filter((client) => !visited.has(client.id));

      if (!clients.length) break;

      clients.forEach((client) => visited.add(client.id));
      generations.push({ generation, clients });
      currentClientIds = clients.map((client) => client.id);
      generation += 1;
    }

    return generations;
  }

  private emptyMetrics(): ReferralMetrics {
    return {
      cantidadCompras: 0,
      compras: 0,
      utilidadBaseHistorica: 0,
      descuentoGenerado: 0,
      descuentoDisponible: 0,
    };
  }

  private addMetrics(
    target: ReferralMetrics,
    source: ReferralMetrics,
  ): ReferralMetrics {
    return {
      cantidadCompras: target.cantidadCompras + source.cantidadCompras,
      compras: this.roundMoney(target.compras + source.compras),
      utilidadBaseHistorica: this.roundMoney(
        target.utilidadBaseHistorica + source.utilidadBaseHistorica,
      ),
      descuentoGenerado: this.roundMoney(
        target.descuentoGenerado + source.descuentoGenerado,
      ),
      descuentoDisponible: this.roundMoney(
        target.descuentoDisponible + source.descuentoDisponible,
      ),
    };
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async ensureActiveClient(clientId: number) {
    if (clientId <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!client.isActive) {
      throw new BadRequestException('El cliente está inactivo');
    }
  }
}
