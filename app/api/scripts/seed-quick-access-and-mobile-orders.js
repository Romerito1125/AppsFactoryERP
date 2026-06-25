require('dotenv').config()

const { randomBytes, scryptSync } = require('crypto')
const { PrismaPg } = require('@prisma/adapter-pg')
const {
  ClientType,
  DeliveryStatus,
  InvoiceSource,
  InvoiceStatus,
  PrismaClient,
} = require('@prisma/client')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function daysAgo(days, hour = 10, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)
  return date
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

const quickAccessProfiles = [
  {
    identification: '990000001',
    firstName: 'Santiago',
    lastName: 'Admin',
    phone: '3009000001',
    address: 'Centro administrativo principal',
    clientType: ClientType.MINORISTA,
    username: 'santiago.admin',
    password: 'Admin123*',
    role: 'ADMIN',
  },
  {
    identification: '990000002',
    firstName: 'Valentina',
    lastName: 'Ventas',
    phone: '3009000002',
    address: 'Modulo comercial zona centro',
    clientType: ClientType.MINORISTA,
    username: 'valentina.ventas',
    password: 'Ventas123*',
    role: 'VENDEDOR',
  },
  {
    identification: '990000003',
    firstName: 'Diego',
    lastName: 'Bodega',
    phone: '3009000003',
    address: 'Bodega principal',
    clientType: ClientType.MINORISTA,
    username: 'diego.bodega',
    password: 'Bodega123*',
    role: 'BODEGA',
  },
  {
    identification: '990000004',
    firstName: 'Camila',
    lastName: 'Conta',
    phone: '3009000004',
    address: 'Area financiera',
    clientType: ClientType.MINORISTA,
    username: 'camila.conta',
    password: 'Conta123*',
    role: 'CONTADOR',
  },
]

const mobileClients = [
  {
    key: 'maria_app',
    identification: '880000101',
    firstName: 'Maria',
    lastName: 'Perez',
    phone: '3015550101',
    address: 'Calle 10 # 20-30 Barrio Centro',
    clientType: ClientType.MINORISTA,
    referralCode: 'MARIAPP1',
    referralLevel: 0,
  },
  {
    key: 'juan_app',
    identification: '880000102',
    firstName: 'Juan',
    lastName: 'Gonzalez',
    phone: '3015550102',
    address: 'Carrera 15 # 8-40 Urbanizacion Sol',
    clientType: ClientType.MINORISTA,
    referralCode: 'JUANAPP2',
    referralLevel: 1,
  },
  {
    key: 'luisa_app',
    identification: '880000103',
    firstName: 'Luisa',
    lastName: 'Martinez',
    phone: '3015550103',
    address: 'Via Playa Km 3 Casa 7',
    clientType: ClientType.MINORISTA,
    referralCode: 'LUISAPP3',
    referralLevel: 0,
  },
]

const mobileOrders = [
  {
    consecutive: 'APP-DEMO-001',
    clientKey: 'maria_app',
    items: [
      { productOffset: 0, quantity: 2 },
      { productOffset: 1, quantity: 1 },
    ],
    createdAt: daysAgo(5, 9, 30),
    delivery: {
      address: 'Calle 10 # 20-30 Barrio Centro',
      recipientName: 'Maria Perez',
      recipientPhone: '3015550101',
      notes: 'Entregar en porteria apartamento 204',
      status: DeliveryStatus.PENDIENTE,
    },
  },
  {
    consecutive: 'APP-DEMO-002',
    clientKey: 'juan_app',
    items: [
      { productOffset: 2, quantity: 3 },
      { productOffset: 3, quantity: 2 },
    ],
    createdAt: daysAgo(4, 14, 15),
    delivery: {
      address: 'Carrera 15 # 8-40 Urbanizacion Sol',
      recipientName: 'Juan Gonzalez',
      recipientPhone: '3015550102',
      notes: 'Casa esquinera color blanco',
      status: DeliveryStatus.EN_PREPARACION,
    },
  },
  {
    consecutive: 'APP-DEMO-003',
    clientKey: 'luisa_app',
    items: [
      { productOffset: 1, quantity: 1 },
      { productOffset: 4, quantity: 2 },
    ],
    createdAt: daysAgo(3, 11, 0),
    delivery: {
      address: 'Via Playa Km 3 Casa 7',
      recipientName: 'Luisa Martinez',
      recipientPhone: '3015550103',
      notes: 'Llamar antes de llegar',
      status: DeliveryStatus.EN_CAMINO,
    },
  },
  {
    consecutive: 'APP-DEMO-004',
    clientKey: 'maria_app',
    items: [
      { productOffset: 5, quantity: 1 },
      { productOffset: 0, quantity: 1 },
      { productOffset: 2, quantity: 1 },
    ],
    createdAt: daysAgo(2, 16, 45),
    delivery: {
      address: 'Calle 10 # 20-30 Barrio Centro',
      recipientName: 'Maria Perez',
      recipientPhone: '3015550101',
      notes: 'Recibe la hermana en local del primer piso',
      status: DeliveryStatus.ENTREGADO,
      deliveredAt: daysAgo(1, 13, 20),
    },
  },
  {
    consecutive: 'APP-DEMO-005',
    clientKey: 'juan_app',
    items: [
      { productOffset: 6, quantity: 2 },
      { productOffset: 3, quantity: 1 },
    ],
    createdAt: daysAgo(1, 8, 10),
    delivery: {
      address: 'Carrera 15 # 8-40 Urbanizacion Sol',
      recipientName: 'Juan Gonzalez',
      recipientPhone: '3015550102',
      notes: 'Cliente pidio reagendar para la tarde',
      status: DeliveryStatus.CANCELADO,
    },
  },
  {
    consecutive: 'APP-DEMO-006',
    clientKey: 'luisa_app',
    items: [
      { productOffset: 7, quantity: 2 },
      { productOffset: 1, quantity: 1 },
      { productOffset: 4, quantity: 1 },
    ],
    createdAt: daysAgo(0, 9, 5),
    delivery: {
      address: 'Via Playa Km 3 Casa 7',
      recipientName: 'Luisa Martinez',
      recipientPhone: '3015550103',
      notes: 'Pedido express desde la app',
      status: DeliveryStatus.PENDIENTE,
    },
  },
]

async function upsertClient(data) {
  const existing = await prisma.client.findUnique({
    where: { identification: data.identification },
  })

  if (existing) {
    return prisma.client.update({
      where: { id: existing.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        address: data.address,
        clientType: data.clientType,
        referralCode: data.referralCode ?? existing.referralCode,
        referralLevel: data.referralLevel ?? existing.referralLevel,
        isActive: true,
        deletedAt: null,
      },
    })
  }

  return prisma.client.create({
    data: {
      identification: data.identification,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      address: data.address,
      clientType: data.clientType,
      referralCode: data.referralCode,
      referralLevel: data.referralLevel ?? 0,
    },
  })
}

async function upsertQuickAccessUser(profile) {
  const client = await upsertClient(profile)
  const existingByUsername = await prisma.user.findUnique({
    where: { username: profile.username },
  })

  const data = {
    clientId: client.id,
    username: profile.username,
    password: hashPassword(profile.password),
    role: profile.role,
    isActive: true,
    deletedAt: null,
  }

  if (existingByUsername) {
    return prisma.user.update({ where: { id: existingByUsername.id }, data })
  }

  const existingByClient = await prisma.user.findFirst({
    where: { clientId: client.id },
  })

  if (existingByClient) {
    return prisma.user.update({ where: { id: existingByClient.id }, data })
  }

  return prisma.user.create({ data })
}

function buildInvoiceItems(order, products) {
  return order.items.map((item) => {
    const product = products[item.productOffset % products.length]
    const productPrice = product.prices[0]

    if (!productPrice) {
      throw new Error(`El producto ${product.name} no tiene precio activo`) 
    }

    const unitPrice = Number(productPrice.price)
    const taxRate = Number(product.taxRate ?? 0)
    const subtotal = round2(unitPrice * item.quantity)
    const taxAmount = round2(subtotal * (taxRate / 100))
    const total = round2(subtotal + taxAmount)

    return {
      productId: product.id,
      productPriceId: productPrice.id,
      quantity: item.quantity,
      unitPrice,
      taxRate,
      subtotal,
      taxAmount,
      total,
    }
  })
}

async function createMobileOrders(clientMap) {
  const products = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    include: {
      prices: {
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      },
    },
    orderBy: { id: 'asc' },
    take: 8,
  })

  if (products.length < 3) {
    throw new Error('Se requieren al menos 3 productos activos con precios para sembrar pedidos de app')
  }

  for (const order of mobileOrders) {
    const existing = await prisma.invoice.findUnique({
      where: { consecutive: order.consecutive },
    })

    if (existing) {
      continue
    }

    const items = buildInvoiceItems(order, products)
    const subtotal = round2(items.reduce((sum, item) => sum + item.subtotal, 0))
    const taxes = round2(items.reduce((sum, item) => sum + item.taxAmount, 0))
    const total = round2(items.reduce((sum, item) => sum + item.total, 0))
    const client = clientMap.get(order.clientKey)

    if (!client) {
      throw new Error(`Cliente no encontrado para ${order.clientKey}`)
    }

    await prisma.invoice.create({
      data: {
        consecutive: order.consecutive,
        clientId: client.id,
        source: InvoiceSource.APP_MOVIL,
        status: InvoiceStatus.ACTIVA,
        subtotal,
        taxes,
        total,
        createdAt: order.createdAt,
        updatedAt: order.delivery.deliveredAt ?? order.createdAt,
        items: {
          create: items,
        },
        delivery: {
          create: {
            address: order.delivery.address,
            recipientName: order.delivery.recipientName,
            recipientPhone: order.delivery.recipientPhone,
            notes: order.delivery.notes,
            status: order.delivery.status,
            deliveredAt: order.delivery.deliveredAt,
            createdAt: order.createdAt,
            updatedAt: order.delivery.deliveredAt ?? order.createdAt,
          },
        },
      },
    })
  }
}

async function main() {
  const clientMap = new Map()

  for (const profile of quickAccessProfiles) {
    const client = await upsertClient(profile)
    clientMap.set(profile.username, client)
    await upsertQuickAccessUser(profile)
  }

  for (const clientData of mobileClients) {
    const client = await upsertClient(clientData)
    clientMap.set(clientData.key, client)
  }

  await createMobileOrders(clientMap)

  const users = await prisma.user.findMany({
    where: { username: { in: quickAccessProfiles.map((item) => item.username) } },
    select: { username: true, role: true, isActive: true },
    orderBy: { username: 'asc' },
  })

  const appOrders = await prisma.invoice.count({
    where: { source: InvoiceSource.APP_MOVIL },
  })

  const deliveries = await prisma.delivery.count()

  console.log(
    JSON.stringify(
      {
        quickAccessUsers: users,
        appOrders,
        deliveries,
      },
      null,
      2,
    ),
  )
}

main()
  .catch(async (error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
