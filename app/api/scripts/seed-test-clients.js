// Crea (o actualiza) dos clientes de prueba: uno con crédito y otro sin crédito.
// Es idempotente: se puede ejecutar varias veces sin duplicar.
require('dotenv').config()

const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const clients = [
  {
    identification: 'PRUEBA-CON-CREDITO',
    firstName: 'CLIENTE PRUEBA',
    lastName: 'CON CREDITO',
    phone: '3000000001',
    address: 'Calle 1 # 1-01 (cliente de prueba)',
    hasCredit: true,
    maxCredit: 1000000,
  },
  {
    identification: 'PRUEBA-SIN-CREDITO',
    firstName: 'CLIENTE PRUEBA',
    lastName: 'SIN CREDITO',
    phone: '3000000002',
    address: 'Calle 2 # 2-02 (cliente de prueba)',
    hasCredit: false,
    maxCredit: 0,
  },
]

async function main() {
  for (const client of clients) {
    const saved = await prisma.client.upsert({
      where: { identification: client.identification },
      update: { ...client, isActive: true },
      create: { ...client, clientType: 'MINORISTA', priceLevel: 0 },
    })
    console.log(
      `${saved.id} · ${saved.identification} · ${saved.firstName} ${saved.lastName} · crédito: ${saved.hasCredit ? `sí (${saved.maxCredit})` : 'no'}`,
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
