require('dotenv').config()

const { randomBytes, scryptSync } = require('crypto')
const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const ADMIN_EMAIL = 'admin@mundotienda.com'
const ADMIN_PASSWORD = 'Admin123*'

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

const catalog = [
  ['Cafe de Origen 340 g', 'Abarrotes', 'Distribuciones Mundo', 28900, 19000, 40],
  ['Arroz Premium 5 kg', 'Abarrotes', 'Distribuciones Mundo', 21400, 15000, 65],
  ['Aceite Vegetal 900 ml', 'Abarrotes', 'Distribuciones Mundo', 16700, 11000, 55],
  ['Pasta Penne 500 g', 'Abarrotes', 'Distribuciones Mundo', 6900, 4200, 80],
  ['Galletas de Avena 12 unidades', 'Snacks', 'Alimentos Caribe', 8300, 5200, 35],
  ['Jabon Liquido 500 ml', 'Limpieza', 'Casa Limpia', 12500, 7800, 30],
]

async function main() {
  const warehouse = await prisma.warehouse.upsert({
    where: { id: 1 },
    update: { location: 'Bodega Principal', isActive: true, deletedAt: null },
    create: { location: 'Bodega Principal' },
  })

  const admin = await prisma.user.upsert({
    where: { username: ADMIN_EMAIL },
    update: { password: hashPassword(ADMIN_PASSWORD), role: 'ADMIN', isActive: true, deletedAt: null },
    create: { username: ADMIN_EMAIL, password: hashPassword(ADMIN_PASSWORD), role: 'ADMIN' },
  })

  await prisma.employee.upsert({
    where: { userId: admin.id },
    update: { firstName: 'Administrador', lastName: 'Mundo Tienda', isActive: true, deletedAt: null },
    create: { userId: admin.id, identification: 'ADMIN-MUNDO-001', firstName: 'Administrador', lastName: 'Mundo Tienda' },
  })

  for (const [name, typeName, providerName, price, cost, stock] of catalog) {
    const productType = await prisma.productType.upsert({ where: { name: typeName }, update: { isActive: true, deletedAt: null }, create: { name: typeName } })
    const provider = await prisma.provider.upsert({ where: { name: providerName }, update: { isActive: true, deletedAt: null }, create: { name: providerName } })
    let product = await prisma.product.findFirst({ where: { name } })
    if (!product) {
      product = await prisma.product.create({ data: { name, brand: providerName, description: `Producto inicial ${name}`, productTypeId: productType.id, providerId: provider.id, taxRate: 19, minimumStock: 5, maximumStock: 200 } })
    }
    const existingPrice = await prisma.productPrice.findFirst({ where: { productId: product.id, isDefault: true } })
    if (existingPrice) await prisma.productPrice.update({ where: { id: existingPrice.id }, data: { price, isActive: true, name: 'Precio mostrador' } })
    else await prisma.productPrice.create({ data: { productId: product.id, name: 'Precio mostrador', price, isDefault: true, isActive: true } })
    await prisma.productCost.create({ data: { productId: product.id, cost, unit: 'UND', quantity: 1, isActive: true } })
    await prisma.productWarehouse.upsert({ where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } }, update: { quantity: stock }, create: { productId: product.id, warehouseId: warehouse.id, quantity: stock } })
  }

  console.log(JSON.stringify({ admin: ADMIN_EMAIL, products: await prisma.product.count(), warehouse: warehouse.location }, null, 2))
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
