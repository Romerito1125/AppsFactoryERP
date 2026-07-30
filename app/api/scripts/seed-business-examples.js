require('dotenv').config()

const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function upsertClient(index, firstName, lastName) {
  return prisma.client.upsert({
    where: { identification: `DEMO-RED-${index}` },
    update: {
      firstName,
      lastName,
      isActive: true,
      referralCode: `RED-DEMO-${index}`,
      referralLevel: index,
    },
    create: {
      identification: `DEMO-RED-${index}`,
      firstName,
      lastName,
      phone: `300555010${index}`,
      address: `Direccion demo nivel ${index}`,
      clientType: 'MINORISTA',
      referralCode: `RED-DEMO-${index}`,
      referralLevel: index,
    },
  })
}

async function ensureReferral(referrer, referred) {
  return prisma.referral.upsert({
    where: { referredClientId: referred.id },
    update: { referrerClientId: referrer.id, codeUsed: referrer.referralCode },
    create: {
      referrerClientId: referrer.id,
      referredClientId: referred.id,
      codeUsed: referrer.referralCode,
    },
  })
}

async function ensureProduct({ name, provider, productType, price, cost, barcode, imageUrl }) {
  let product = await prisma.product.findFirst({
    where: { name, providerId: provider.id },
    include: { prices: true },
  })

  if (!product) {
    product = await prisma.product.create({
      data: {
        name,
        description: 'Producto de ejemplo para compras, utilidades y red',
        brand: 'Demo ERP',
        imageUrl,
        providerId: provider.id,
        productTypeId: productType.id,
        taxRate: 19,
        unit: 'UND',
        minimumStock: 5,
        maximumStock: 200,
        prices: {
          create: {
            name: 'Precio demo',
            price,
            unit: 'UND',
            quantity: 1,
            isDefault: true,
          },
        },
        costs: {
          create: {
            cost,
            unit: 'UND',
            quantity: 1,
            isActive: true,
          },
        },
      },
      include: { prices: true },
    })
  } else if (imageUrl && (!product.imageUrl || String(product.imageUrl).includes('placehold'))) {
    product = await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl },
      include: { prices: true },
    })
  }

  await prisma.productBarcode.upsert({
    where: { code: barcode },
    update: { productId: product.id, type: 'EAN13', isActive: true },
    create: {
      productId: product.id,
      code: barcode,
      type: 'EAN13',
      isPrimary: true,
    },
  })

  return prisma.product.findUnique({
    where: { id: product.id },
    include: { prices: { orderBy: { id: 'asc' } } },
  })
}

async function ensureInvoice({ consecutive, client, product, quantity, unitCost, benefitChain }) {
  let invoice = await prisma.invoice.findUnique({ where: { consecutive } })
  const price = Number(product.prices.find((item) => item.isDefault)?.price ?? product.prices[0].price)
  const grossSubtotal = price * quantity
  const profit = (price - unitCost) * quantity
  const taxes = grossSubtotal * 0.19

  if (!invoice) {
    invoice = await prisma.invoice.create({
      data: {
        consecutive,
        clientId: client.id,
        source: 'ADMIN',
        subtotal: grossSubtotal,
        taxes,
        total: grossSubtotal + taxes,
        items: {
          create: {
            productId: product.id,
            productPriceId: product.prices.find((item) => item.isDefault)?.id ?? product.prices[0].id,
            quantity,
            unitPrice: price,
            taxRate: 19,
            grossSubtotal,
            discountAmount: 0,
            subtotal: grossSubtotal,
            taxAmount: taxes,
            total: grossSubtotal + taxes,
            unitCost,
            profitAmount: profit,
          },
        },
      },
    })
  }

  for (const entry of benefitChain) {
    const amount = Math.round(profit * (entry.percentage / 100) * 100) / 100
    await prisma.referralBenefit.upsert({
      where: {
        beneficiaryClientId_originInvoiceId_generation: {
          beneficiaryClientId: entry.client.id,
          originInvoiceId: invoice.id,
          generation: entry.generation,
        },
      },
      update: {
        baseProfit: profit,
        percentage: entry.percentage,
        amount,
      },
      create: {
        beneficiaryClientId: entry.client.id,
        buyerClientId: client.id,
        originInvoiceId: invoice.id,
        generation: entry.generation,
        baseProfit: profit,
        percentage: entry.percentage,
        amount,
        remainingAmount: amount,
      },
    })
  }

  return invoice
}

async function ensurePurchase({ consecutive, provider, warehouse, product, orderedAt, expectedAt, receivedAt, quantity, unitCost, status = 'RECIBIDA' }) {
  const existing = await prisma.purchaseOrder.findUnique({ where: { consecutive } })
  if (existing) return existing

  const subtotal = quantity * unitCost
  const taxes = subtotal * 0.19
  const purchase = await prisma.purchaseOrder.create({
    data: {
      consecutive,
      providerId: provider.id,
      warehouseId: warehouse.id,
      externalReference: `FACT-${consecutive}`,
      notes: 'Datos de ejemplo para analitica de proveedores',
      orderedAt,
      expectedAt,
      receivedAt,
      status,
      subtotal,
      taxes,
      total: subtotal + taxes,
      items: {
        create: {
          productId: product.id,
          quantity,
          receivedQuantity: status === 'RECIBIDA' ? quantity : 0,
          unit: 'UND',
          unitCost,
          taxRate: 19,
          subtotal,
          taxAmount: taxes,
          total: subtotal + taxes,
        },
      },
    },
    include: { items: true },
  })

  if (status === 'RECIBIDA') {
    const item = purchase.items[0]
    await prisma.productWarehouse.upsert({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      update: { quantity: { increment: quantity } },
      create: { productId: product.id, warehouseId: warehouse.id, quantity },
    })
    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        toWarehouseId: warehouse.id,
        quantity,
        movementType: 'ENTRADA',
        reason: `Ejemplo ${consecutive}`,
        purchaseOrderItemId: item.id,
        createdAt: receivedAt,
      },
    })
    await prisma.productCost.create({
      data: {
        productId: product.id,
        cost: unitCost,
        unit: 'UND',
        quantity: 1,
        startsAt: receivedAt,
        endsAt: receivedAt,
        isActive: false,
        purchaseOrderItemId: item.id,
      },
    })
  }

  return purchase
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria')

  await Promise.all([
    prisma.referralProfitPolicy.upsert({ where: { generation: 1 }, update: { percentage: 10, isActive: true }, create: { generation: 1, percentage: 10 } }),
    prisma.referralProfitPolicy.upsert({ where: { generation: 2 }, update: { percentage: 5, isActive: true }, create: { generation: 2, percentage: 5 } }),
    prisma.referralProfitPolicy.upsert({ where: { generation: 3 }, update: { percentage: 2, isActive: true }, create: { generation: 3, percentage: 2 } }),
  ])

  const clients = await Promise.all([
    upsertClient(0, 'Ana', 'Raiz Demo'),
    upsertClient(1, 'Bruno', 'Nivel Uno'),
    upsertClient(2, 'Carla', 'Nivel Dos'),
    upsertClient(3, 'Diego', 'Nivel Tres'),
    upsertClient(4, 'Elena', 'Aliada Uno'),
    upsertClient(5, 'Fabian', 'Aliado Dos'),
    upsertClient(6, 'Gabriela', 'Aliada Tres'),
  ])
  await ensureReferral(clients[0], clients[1])
  await ensureReferral(clients[1], clients[2])
  await ensureReferral(clients[2], clients[3])
  await ensureReferral(clients[0], clients[4])
  await ensureReferral(clients[4], clients[5])
  await ensureReferral(clients[5], clients[6])

  await prisma.user.deleteMany({ where: { username: 'demo.red' } })

  const [providerA, providerB] = await Promise.all([
    prisma.provider.upsert({ where: { name: 'Distribuciones Andina Demo' }, update: { isActive: true }, create: { name: 'Distribuciones Andina Demo', description: 'Proveedor demo de abarrotes' } }),
    prisma.provider.upsert({ where: { name: 'Comercializadora Pacifico Demo' }, update: { isActive: true }, create: { name: 'Comercializadora Pacifico Demo', description: 'Proveedor demo de bebidas' } }),
  ])
  const productType = await prisma.productType.upsert({
    where: { name: 'Productos demo red' },
    update: {
      isActive: true,
      imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
    },
    create: {
      name: 'Productos demo red',
      description: 'Datos de demostracion',
      imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
    },
  })
  let warehouse = await prisma.warehouse.findFirst({ where: { location: 'Bodega Demo Principal' } })
  if (!warehouse) warehouse = await prisma.warehouse.create({ data: { location: 'Bodega Demo Principal' } })

  const [productA, productB] = await Promise.all([
    ensureProduct({ name: 'Cafe utilidad demo', provider: providerA, productType, price: 18000, cost: 10000, barcode: '7700000000001', imageUrl: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80' }),
    ensureProduct({ name: 'Bebida favorita demo', provider: providerB, productType, price: 12000, cost: 7000, barcode: '7700000000002', imageUrl: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1200&q=80' }),
  ])
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } })
  if (adminUser) {
    await Promise.all([
      prisma.productFavorite.upsert({ where: { userId_productId: { userId: adminUser.id, productId: productA.id } }, update: {}, create: { userId: adminUser.id, productId: productA.id } }),
      prisma.productFavorite.upsert({ where: { userId_productId: { userId: adminUser.id, productId: productB.id } }, update: {}, create: { userId: adminUser.id, productId: productB.id } }),
    ])
  }

  await ensureInvoice({ consecutive: 'FAC-DEMO-RED-N1', client: clients[1], product: productA, quantity: 2, unitCost: 10000, benefitChain: [{ client: clients[0], generation: 1, percentage: 10 }] })
  await ensureInvoice({ consecutive: 'FAC-DEMO-RED-N2', client: clients[2], product: productA, quantity: 3, unitCost: 10000, benefitChain: [{ client: clients[1], generation: 1, percentage: 10 }, { client: clients[0], generation: 2, percentage: 5 }] })
  await ensureInvoice({ consecutive: 'FAC-DEMO-RED-N3', client: clients[3], product: productB, quantity: 5, unitCost: 7000, benefitChain: [{ client: clients[2], generation: 1, percentage: 10 }, { client: clients[1], generation: 2, percentage: 5 }, { client: clients[0], generation: 3, percentage: 2 }] })
  await ensureInvoice({ consecutive: 'FAC-DEMO-RED-B1', client: clients[4], product: productB, quantity: 4, unitCost: 7000, benefitChain: [{ client: clients[0], generation: 1, percentage: 10 }] })
  await ensureInvoice({ consecutive: 'FAC-DEMO-RED-B2', client: clients[5], product: productA, quantity: 2, unitCost: 10000, benefitChain: [{ client: clients[4], generation: 1, percentage: 10 }, { client: clients[0], generation: 2, percentage: 5 }] })
  await ensureInvoice({ consecutive: 'FAC-DEMO-RED-B3', client: clients[6], product: productB, quantity: 6, unitCost: 7000, benefitChain: [{ client: clients[5], generation: 1, percentage: 10 }, { client: clients[4], generation: 2, percentage: 5 }, { client: clients[0], generation: 3, percentage: 2 }] })

  await ensurePurchase({ consecutive: 'OC-DEMO-2026-001', provider: providerA, warehouse, product: productA, orderedAt: new Date('2026-01-05T12:00:00Z'), expectedAt: new Date('2026-01-10T12:00:00Z'), receivedAt: new Date('2026-01-09T12:00:00Z'), quantity: 30, unitCost: 9500 })
  await ensurePurchase({ consecutive: 'OC-DEMO-2026-002', provider: providerB, warehouse, product: productB, orderedAt: new Date('2026-02-02T12:00:00Z'), expectedAt: new Date('2026-02-08T12:00:00Z'), receivedAt: new Date('2026-02-11T12:00:00Z'), quantity: 45, unitCost: 6800 })
  await ensurePurchase({ consecutive: 'OC-DEMO-2026-003', provider: providerA, warehouse, product: productA, orderedAt: new Date('2026-03-03T12:00:00Z'), expectedAt: new Date('2026-03-09T12:00:00Z'), receivedAt: new Date('2026-03-08T12:00:00Z'), quantity: 25, unitCost: 9800 })
  await ensurePurchase({ consecutive: 'OC-DEMO-2026-004', provider: providerB, warehouse, product: productB, orderedAt: new Date('2026-07-12T12:00:00Z'), expectedAt: new Date('2026-07-20T12:00:00Z'), receivedAt: null, quantity: 20, unitCost: 7100, status: 'ORDENADA' })

  console.log('Datos de ejemplo creados o actualizados:')
  console.table({
    red: 'Ana > Bruno > Carla > Diego | Ana > Elena > Fabian > Gabriela',
    porcentajes: '10% / 5% / 2%',
    compras: 6,
    productos: 2,
    favoritos: adminUser ? 2 : 0,
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
