require('dotenv').config()

const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const productTypeImages = [
  {
    match: ['abarrote', 'grano', 'despensa', 'arroz', 'azucar'],
    imageUrl: 'https://images.unsplash.com/photo-1515543904379-3d757afe72e1?auto=format&fit=crop&w=1200&q=80',
  },
  {
    match: ['bebida', 'lacteo', 'leche', 'huevo'],
    imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=1200&q=80',
  },
  {
    match: ['snack', 'desayuno', 'galleta'],
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80',
  },
  {
    match: ['limpieza', 'aseo', 'hogar'],
    imageUrl: 'https://images.unsplash.com/photo-1583947582886-f40ec95dd752?auto=format&fit=crop&w=1200&q=80',
  },
  {
    match: ['cuidado', 'personal', 'belleza', 'higiene'],
    imageUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    match: ['demo red'],
    imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
  },
]

const fallbackImageUrl = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80'

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function shouldReplaceImage(url) {
  if (!url) return true

  return url.includes('placehold.co') || url.includes('images.unsplash.com')
}

function resolveImageUrl(name) {
  const normalizedName = normalizeText(name)
  const matched = productTypeImages.find((item) =>
    item.match.some((keyword) => normalizedName.includes(keyword)),
  )

  return matched?.imageUrl ?? fallbackImageUrl
}

async function main() {
  const productTypes = await prisma.productType.findMany({
    select: { id: true, name: true, imageUrl: true },
    orderBy: { id: 'asc' },
  })

  let updated = 0

  for (const productType of productTypes) {
    if (!shouldReplaceImage(productType.imageUrl)) {
      continue
    }

    await prisma.productType.update({
      where: { id: productType.id },
      data: { imageUrl: resolveImageUrl(productType.name) },
    })

    updated += 1
  }

  console.log(
    JSON.stringify(
      {
        productTypes: productTypes.length,
        updated,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
