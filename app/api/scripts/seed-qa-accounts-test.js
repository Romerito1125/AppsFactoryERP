require('dotenv').config()

const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const TAG = 'QA-ACCOUNTS'
const money = (value) => Number(value).toFixed(2)

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria')

  const result = await prisma.$transaction(async (tx) => {
    const retention = await tx.retention.upsert({
      where: { code: `${TAG}-RET-10` },
      update: {
        description: 'Retención QA para ventas a crédito (10%)',
        applySales: true,
        isActive: true,
        deletedAt: null,
        ranges: {
          deleteMany: {},
          create: [{ minimum: 0, maximum: 999999999.99, percentage: 10, sortOrder: 0 }],
        },
      },
      create: {
        code: `${TAG}-RET-10`,
        description: 'Retención QA para ventas a crédito (10%)',
        applySales: true,
        isActive: true,
        ranges: {
          create: [{ minimum: 0, maximum: 999999999.99, percentage: 10, sortOrder: 0 }],
        },
      },
    })
    const client = await tx.client.upsert({
      where: { identification: `${TAG}-CLIENTE-001` },
      update: {
        firstName: 'Cliente QA CxC',
        lastName: 'Pruebas',
        phone: '3000000001',
        address: 'Calle QA 1',
        clientType: 'MINORISTA',
        hasCredit: true,
        maxCredit: 1_000_000,
        retentionId: retention.id,
        isActive: true,
        deletedAt: null,
      },
      create: {
        identification: `${TAG}-CLIENTE-001`,
        firstName: 'Cliente QA CxC',
        lastName: 'Pruebas',
        phone: '3000000001',
        address: 'Calle QA 1',
        clientType: 'MINORISTA',
        hasCredit: true,
        maxCredit: 1_000_000,
        retentionId: retention.id,
      },
    })

    const provider = await tx.provider.upsert({
      where: { name: `${TAG} Proveedor CxP` },
      update: {
        taxId: `${TAG}-NIT-001`,
        phonePrimary: '3000000002',
        address: 'Carrera QA 2',
        creditDays: 30,
        isActive: true,
        deletedAt: null,
      },
      create: {
        name: `${TAG} Proveedor CxP`,
        taxId: `${TAG}-NIT-001`,
        phonePrimary: '3000000002',
        address: 'Carrera QA 2',
        creditDays: 30,
      },
    })

    let warehouse = await tx.warehouse.findFirst({ where: { location: `${TAG} Bodega Principal` } })
    warehouse = warehouse
      ? await tx.warehouse.update({
          where: { id: warehouse.id },
          data: { isActive: true, deletedAt: null },
        })
      : await tx.warehouse.create({ data: { location: `${TAG} Bodega Principal` } })

    const productType = await tx.productType.upsert({
      where: { name: `${TAG} Productos` },
      update: { isActive: true, deletedAt: null },
      create: { name: `${TAG} Productos`, description: 'Tipo de producto para pruebas de cartera' },
    })

    let product = await tx.product.findFirst({ where: { name: `${TAG} Producto de prueba` } })
    product = product
      ? await tx.product.update({
          where: { id: product.id },
          data: {
            productTypeId: productType.id,
            providerId: provider.id,
            brand: TAG,
            description: 'Producto QA para facturas y compras de prueba',
            taxRate: 19,
            minimumStock: 5,
            maximumStock: 200,
            isActive: true,
            deletedAt: null,
          },
        })
      : await tx.product.create({
          data: {
            name: `${TAG} Producto de prueba`,
            productTypeId: productType.id,
            providerId: provider.id,
            brand: TAG,
            description: 'Producto QA para facturas y compras de prueba',
            taxRate: 19,
            minimumStock: 5,
            maximumStock: 200,
          },
        })

    const prices = [119, 120, 150, 300]
    for (const [priceLevel, price] of prices.entries()) {
      const existing = await tx.productPrice.findFirst({ where: { productId: product.id, priceLevel } })
      if (existing) {
        await tx.productPrice.update({
          where: { id: existing.id },
          data: { name: `QA Precio ${priceLevel}`, price, priceLevel, isDefault: priceLevel === 0, isActive: true },
        })
      } else {
        await tx.productPrice.create({
          data: { productId: product.id, name: `QA Precio ${priceLevel}`, price, priceLevel, isDefault: priceLevel === 0, isActive: true },
        })
      }
    }

    const existingCost = await tx.productCost.findFirst({ where: { productId: product.id, isActive: true }, orderBy: { id: 'desc' } })
    if (existingCost) {
      await tx.productCost.update({ where: { id: existingCost.id }, data: { cost: 100, quantity: 1, unit: 'UND', isActive: true } })
    } else {
      await tx.productCost.create({ data: { productId: product.id, cost: 100, quantity: 1, unit: 'UND' } })
    }
    await tx.productWarehouse.upsert({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      update: { quantity: 50 },
      create: { productId: product.id, warehouseId: warehouse.id, quantity: 50 },
    })

    let bankAccount = await tx.bankAccount.findFirst({ where: { name: `${TAG} Caja principal` } })
    bankAccount = bankAccount
      ? await tx.bankAccount.update({
          where: { id: bankAccount.id },
          data: {
            bankName: `${TAG} Banco de pruebas`,
            accountNumber: `${TAG}-0001`,
            accountType: 'CAJA',
            currentBalance: 1_000_000,
            isActive: true,
            deletedAt: null,
          },
        })
      : await tx.bankAccount.create({
          data: {
            name: `${TAG} Caja principal`,
            bankName: `${TAG} Banco de pruebas`,
            accountNumber: `${TAG}-0001`,
            accountType: 'CAJA',
            currentBalance: 1_000_000,
            autoGmf: false,
          },
        })

    return {
      cliente: { id: client.id, identificacion: client.identification, nombre: `${client.firstName} ${client.lastName}`, creditoMaximo: money(client.maxCredit), retencion: `${retention.code} · 10%` },
      proveedor: { id: provider.id, nombre: provider.name, nit: provider.taxId },
      bodega: { id: warehouse.id, nombre: warehouse.location },
      producto: { id: product.id, nombre: product.name, stock: 50, costo: '100.00', precios: prices },
      cuentaBancaria: { id: bankAccount.id, nombre: bankAccount.name, saldoInicial: money(bankAccount.currentBalance) },
    }
  }, { timeout: 30_000 })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
