import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Client, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

const COMMISSION_RATES_BY_GENERATION: Record<number, number> = {
  1: 0.05,
  2: 0.03,
  3: 0.01,
};

type ReferralGeneration = {
  generation: number;
  clients: Pick<
    Client,
    | 'id'
    | 'identification'
    | 'firstName'
    | 'lastName'
    | 'phone'
    | 'address'
    | 'isActive'
    | 'referralCode'
  >[];
};

@Injectable()
export class ReferralStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNetwork(clientId: number) {
    await this.ensureActiveClient(clientId);

    return {
      clientId,
      generations: await this.buildGenerations(clientId),
    };
  }

  async getStats(clientId: number) {
    await this.ensureActiveClient(clientId);
    const generations = await this.buildGenerations(clientId);
    const generationStats = await Promise.all(
      generations.map(async (generation) => {
        const clientIds = generation.clients.map((client) => client.id);
        const totalSold = await this.sumInvoicesByClientIds(clientIds);
        const commissionRate =
          COMMISSION_RATES_BY_GENERATION[generation.generation] ?? 0;

        return {
          generation: generation.generation,
          totalClientes: clientIds.length,
          totalVendido: totalSold,
          commissionRate,
          commission: totalSold * commissionRate,
        };
      }),
    );

    const directGeneration = generationStats.find(
      (item) => item.generation === 1,
    );

    return {
      clientId,
      totalReferidosDirectos: directGeneration?.totalClientes ?? 0,
      totalReferidosRed: generationStats.reduce(
        (sum, item) => sum + item.totalClientes,
        0,
      ),
      totalCompradoPorReferidos: generationStats.reduce(
        (sum, item) => sum + item.totalVendido,
        0,
      ),
      ventasPorGeneracion: generationStats.map((item) => ({
        generation: item.generation,
        total: item.totalVendido,
      })),
      comisionGanada: generationStats.reduce(
        (sum, item) => sum + item.commission,
        0,
      ),
      comisionPorGeneracion: generationStats.map((item) => ({
        generation: item.generation,
        percentage: item.commissionRate * 100,
        commission: item.commission,
      })),
    };
  }

  private async buildGenerations(clientId: number) {
    const generations: ReferralGeneration[] = [];
    let currentClientIds = [clientId];
    let generation = 1;
    const visited = new Set<number>([clientId]);

    while (currentClientIds.length) {
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

  private async sumInvoicesByClientIds(clientIds: number[]) {
    if (!clientIds.length) return 0;

    const result = await this.prisma.invoice.aggregate({
      where: { clientId: { in: clientIds }, status: InvoiceStatus.ACTIVA },
      _sum: { total: true },
    });

    return Number(result._sum.total ?? 0);
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
