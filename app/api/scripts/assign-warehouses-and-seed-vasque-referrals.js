require('dotenv').config();

const { PrismaClient, ClientType, NotificationType, Role } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const rootUser = await prisma.user.findUnique({
    where: { username: 'vasquesoto@gmail.com' },
    include: { client: true },
  });

  if (!rootUser?.client) {
    throw new Error('No se encontró el usuario/cliente vasquesoto@gmail.com');
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    take: 2,
  });

  if (warehouses.length < 2) {
    throw new Error('Se necesitan al menos dos bodegas activas para asignar los usuarios BODEGA');
  }

  const warehouseAssignments = [
    { username: 'diego.bodega@appsfactory.local', warehouseId: warehouses[0].id },
    { username: 'sergio.bodega@appsfactory.local', warehouseId: warehouses[1].id },
  ];

  const result = await prisma.$transaction(async (tx) => {
    for (const assignment of warehouseAssignments) {
      const user = await tx.user.findUnique({ where: { username: assignment.username } });
      if (!user || user.role !== Role.BODEGA) {
        throw new Error(`No se encontró el usuario BODEGA ${assignment.username}`);
      }

      await tx.user.update({
        where: { id: user.id },
        data: { warehouseId: assignment.warehouseId },
      });
    }

    const root = await tx.client.update({
      where: { id: rootUser.client.id },
      data: {
        referralCode: rootUser.client.referralCode ?? `VASQ${rootUser.client.id}ROOT`,
        referralLevel: 0,
      },
    });

    const generations = [1, 2, 3, 4].map((generation) => ({
      generation,
      identification: `VASQUE-REF-G${generation}`,
      firstName: 'Referido',
      lastName: `Vasquesoto G${generation}`,
      referralCode: `VASQ-G${generation}-${root.id}`,
    }));

    const chain = [root];
    for (const entry of generations) {
      const previous = chain[chain.length - 1];
      const client = await tx.client.upsert({
        where: { identification: entry.identification },
        update: {
          firstName: entry.firstName,
          lastName: entry.lastName,
          referralCode: entry.referralCode,
          referralLevel: entry.generation,
          isActive: true,
          deletedAt: null,
        },
        create: {
          identification: entry.identification,
          firstName: entry.firstName,
          lastName: entry.lastName,
          referralCode: entry.referralCode,
          referralLevel: entry.generation,
          clientType: ClientType.MINORISTA,
        },
      });

      await tx.referral.upsert({
        where: { referredClientId: client.id },
        update: {
          referrerClientId: previous.id,
          codeUsed: previous.referralCode,
        },
        create: {
          referrerClientId: previous.id,
          referredClientId: client.id,
          codeUsed: previous.referralCode,
        },
      });

      chain.push(client);
    }

    const policies = [
      { generation: 1, percentage: 10, isSocialWork: false },
      { generation: 2, percentage: 5, isSocialWork: false },
      { generation: 3, percentage: 2, isSocialWork: false },
      { generation: 4, percentage: 5, isSocialWork: true },
    ];

    for (const policy of policies) {
      await tx.referralProfitPolicy.upsert({
        where: { generation: policy.generation },
        update: {
          percentage: policy.percentage,
          isActive: true,
          isSocialWork: policy.isSocialWork,
        },
        create: {
          ...policy,
          isActive: true,
        },
      });
    }

    const message = `La generación 4 de referidos de ${root.firstName} ${root.lastName} se destina a obra social y utilidades generales. No se entrega como beneficio ni genera saldo visible para el referido.`;
    const existingNotification = await tx.notification.findFirst({
      where: { type: NotificationType.OBRA_SOCIAL, message },
    });

    if (!existingNotification) {
      await tx.notification.create({
        data: {
          type: NotificationType.OBRA_SOCIAL,
          title: 'Generación 4 destinada a obra social',
          message,
        },
      });
    }

    return {
      rootClientId: root.id,
      chain: chain.map((client) => ({ id: client.id, level: client.referralLevel })),
      warehouses: warehouseAssignments,
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
