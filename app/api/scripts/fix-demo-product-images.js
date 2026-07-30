require('dotenv').config()

const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const explicitImages = {
  'Cafe utilidad demo': 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80',
  'Bebida favorita demo': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1200&q=80',
}

function getFallbackImage(productName) {
  const normalized = String(productName ?? '').toLowerCase()

  if (normalized.includes('cafe')) {
    return 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80'
  }

  if (normalized.includes('bebida') || normalized.includes('leche')) {
    return 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1200&q=80'
  }

  return 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80'
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, imageUrl: true },
    where: {
      OR: [
        { imageUrl: { contains: 'placehold.co' } },
        { name: { in: Object.keys(explicitImages) } },
      ],
    },
  })

  let updated = 0

  for (const product of products) {
    const imageUrl = explicitImages[product.name] ?? getFallbackImage(product.name)

    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl },
    })

    updated += 1
  }

  console.log(JSON.stringify({ updated }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
