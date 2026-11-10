require('dotenv').config()

const { randomBytes, scryptSync } = require('crypto')
const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

const team = [
  {
    username: 'qa.cajero@mundotienda.com',
    password: 'QaCajero123*',
    role: 'CAJERO',
    identification: 'QA-SALES-CASHIER-001',
    firstName: 'Cajera QA',
    lastName: 'Principal',
  },
  {
    username: 'qa.cajero2@mundotienda.com',
    password: 'QaCajero2123*',
    role: 'CAJERO',
    identification: 'QA-SALES-CASHIER-002',
    firstName: 'Cajera QA',
    lastName: 'Auxiliar',
  },
  {
    username: 'qa.vendedor@mundotienda.com',
    password: 'QaVendedor123*',
    role: 'VENDEDOR',
    identification: 'QA-SALES-SELLER-001',
    firstName: 'Vendedor QA',
    lastName: 'Principal',
  },
  {
    username: 'qa.vendedor2@mundotienda.com',
    password: 'QaVendedor2123*',
    role: 'VENDEDOR',
    identification: 'QA-SALES-SELLER-002',
    firstName: 'Vendedor QA',
    lastName: 'Auxiliar',
  },
]

async function main() {
  const created = []
  for (const person of team) {
    const user = await prisma.user.upsert({
      where: { username: person.username },
      update: {
        password: hashPassword(person.password),
        role: person.role,
        isActive: true,
        deletedAt: null,
      },
      create: {
        username: person.username,
        password: hashPassword(person.password),
        role: person.role,
        isActive: true,
      },
    })

    const employee = await prisma.employee.upsert({
      where: { userId: user.id },
      update: {
        identification: person.identification,
        firstName: person.firstName,
        lastName: person.lastName,
        isActive: true,
        deletedAt: null,
      },
      create: {
        userId: user.id,
        identification: person.identification,
        firstName: person.firstName,
        lastName: person.lastName,
      },
    })

    created.push({
      id: user.id,
      username: user.username,
      role: user.role,
      name: `${employee.firstName} ${employee.lastName}`,
      password: person.password,
    })
  }

  console.log(JSON.stringify({ team: created }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
