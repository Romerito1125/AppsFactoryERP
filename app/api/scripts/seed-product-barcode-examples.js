require('dotenv').config()

const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const barcodeExampleTemplates = [
  {
    type: 'EAN13',
    label: 'EAN-13',
    getCode: (product) => `7701234${String(product.id).padStart(6, '0')}`,
  },
  {
    type: 'EAN8',
    label: 'EAN-8',
    getCode: (product) => `96${String(product.id).padStart(6, '0')}`,
  },
  {
    type: 'UPC_A',
    label: 'UPC-A',
    getCode: (product) => `0421${String(product.id).padStart(8, '0')}`,
  },
  {
    type: 'UPC_E',
    label: 'UPC-E',
    getCode: (product) => `42${String(product.id).padStart(4, '0')}`,
  },
  {
    type: 'CODE128',
    label: 'Code 128',
    getCode: (product) => `PROD-${product.id}-PROMO`,
  },
  {
    type: 'QR',
    label: 'QR',
    getCode: (product) => `https://erp.local/p/${product.id}`,
  },
  {
    type: 'OTHER',
    label: 'Interno',
    getCode: (product) => `INTERNO-${String(product.id).padStart(3, '0')}`,
  },
]

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    include: {
      barcodes: {
        where: { isActive: true },
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      },
    },
    take: barcodeExampleTemplates.length,
  })

  if (!products.length) {
    console.log('No hay productos activos para conectar ejemplos de codigos de barras.')
    return
  }

  const assignments = []

  for (const [index, template] of barcodeExampleTemplates.entries()) {
    const product = products[index]
    if (!product) {
      break
    }

    const code = template.getCode(product)
    const existingByCode = await prisma.productBarcode.findUnique({ where: { code } })
    const shouldBePrimary = product.barcodes.length === 0

    let barcode

    if (existingByCode) {
      barcode = await prisma.productBarcode.update({
        where: { id: existingByCode.id },
        data: {
          productId: product.id,
          type: template.type,
          isActive: true,
          isPrimary: shouldBePrimary ? true : existingByCode.isPrimary,
        },
      })
    } else {
      if (shouldBePrimary) {
        await prisma.productBarcode.updateMany({
          where: { productId: product.id },
          data: { isPrimary: false },
        })
      }

      barcode = await prisma.productBarcode.create({
        data: {
          productId: product.id,
          code,
          type: template.type,
          isPrimary: shouldBePrimary,
          isActive: true,
        },
      })
    }

    assignments.push({
      productId: product.id,
      productName: product.name,
      brand: product.brand,
      label: template.label,
      type: template.type,
      code: barcode.code,
      isPrimary: barcode.isPrimary,
    })
  }

  console.log('Ejemplos de codigos conectados a productos activos:')
  console.table(assignments)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
