require('dotenv').config();

const { randomBytes, scryptSync } = require('crypto');
const { ClientType, PrismaClient, Role } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

async function main() {
  const warehouse = await prisma.warehouse.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { id: 'asc' },
  });
  if (!warehouse) throw new Error('No existe una bodega activa para asignar al usuario.');

  const clientData = {
    identification: '990000004',
    firstName: 'Diego',
    lastName: 'Bodega',
    phone: '3009000004',
    address: warehouse.location,
    clientType: ClientType.MINORISTA,
    isActive: true,
    deletedAt: null,
  };
  const client = await prisma.client.upsert({
    where: { identification: clientData.identification },
    update: clientData,
    create: clientData,
  });

  const userData = {
    clientId: client.id,
    username: 'diego.bodega@appsfactory.local',
    password: hashPassword('Bodega123*'),
    role: Role.BODEGA,
    warehouseId: warehouse.id,
    isActive: true,
    deletedAt: null,
  };
  const existing = await prisma.user.findUnique({ where: { username: userData.username } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: userData })
    : await prisma.user.create({ data: userData });

  await prisma.employee.upsert({
    where: { userId: user.id },
    update: {
      identification: 'EMP-BODEGA-001',
      firstName: 'Diego',
      lastName: 'Bodega',
      phone: clientData.phone,
      address: warehouse.location,
      isActive: true,
      deletedAt: null,
    },
    create: {
      userId: user.id,
      identification: 'EMP-BODEGA-001',
      firstName: 'Diego',
      lastName: 'Bodega',
      phone: clientData.phone,
      address: warehouse.location,
    },
  });

  console.log(JSON.stringify({
    username: user.username,
    password: 'Bodega123*',
    role: user.role,
    warehouseId: warehouse.id,
    warehouse: warehouse.location,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
