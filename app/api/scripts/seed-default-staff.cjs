require('dotenv/config');

const { randomBytes, scryptSync } = require('crypto');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Role } = require('@prisma/client');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const staffUsers = [
  {
    username: 'laura.cajero',
    password: 'Cajero123*',
    role: Role.CAJERO,
    employee: {
      identification: 'EMP-CAJERO-001',
      firstName: 'Laura',
      lastName: 'Cajero',
      phone: '3000000001',
      address: 'Sucursal principal',
    },
  },
  {
    username: 'valentina.ventas',
    password: 'Ventas123*',
    role: Role.VENDEDOR,
    employee: {
      identification: 'EMP-VENTAS-001',
      firstName: 'Valentina',
      lastName: 'Ventas',
      phone: '3000000002',
      address: 'Sucursal principal',
    },
  },
  {
    username: 'diego.bodega',
    password: 'Bodega123*',
    role: Role.BODEGA,
    employee: {
      identification: 'EMP-BODEGA-001',
      firstName: 'Diego',
      lastName: 'Bodega',
      phone: '3000000003',
      address: 'Centro logístico',
    },
  },
  {
    username: 'camila.conta',
    password: 'Conta123*',
    role: Role.CONTADOR,
    employee: {
      identification: 'EMP-CONTA-001',
      firstName: 'Camila',
      lastName: 'Contabilidad',
      phone: '3000000004',
      address: 'Oficina administrativa',
    },
  },
];

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  for (const staffUser of staffUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { username: staffUser.username },
      include: { employee: true },
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: staffUser.role,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!existingUser.employee) {
        await prisma.employee.create({
          data: {
            userId: existingUser.id,
            ...staffUser.employee,
          },
        });
      }

      continue;
    }

    await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username: staffUser.username,
          password: hashPassword(staffUser.password),
          role: staffUser.role,
          isActive: true,
        },
      });

      await tx.employee.create({
        data: {
          userId: createdUser.id,
          ...staffUser.employee,
        },
      });
    });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
