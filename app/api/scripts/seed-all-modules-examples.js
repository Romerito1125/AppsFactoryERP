require('dotenv').config()

const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const DEMO_PREFIX = 'DEMO-FULL-'
const now = new Date()

function daysFromNow(days) {
  const value = new Date(now)
  value.setDate(value.getDate() + days)
  return value
}

function daysAgo(days) {
  const value = new Date(now)
  value.setDate(value.getDate() - days)
  return value
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

async function ensureBankAccount(data) {
  const existing = await prisma.bankAccount.findFirst({
    where: { name: data.name },
  })
  if (existing) {
    const { currentBalance, ...editableFields } = data
    return prisma.bankAccount.update({
      where: { id: existing.id },
      data: { ...editableFields, isActive: true, deletedAt: null },
    })
  }
  return prisma.bankAccount.create({ data })
}

async function ensureBankMovement({
  accountId,
  movementType,
  amount,
  description,
  createdAt,
  invoiceId,
}) {
  const existing = await prisma.bankAccountMovement.findFirst({
    where: { description },
  })
  if (existing) return existing

  const incoming = ['INGRESO', 'TRANSFERENCIA_ENTRANTE'].includes(movementType)
  return prisma.$transaction(async (tx) => {
    const value = round2(amount)
    await tx.bankAccount.update({
      where: { id: accountId },
      data: { currentBalance: { increment: incoming ? value : -value } },
    })
    return tx.bankAccountMovement.create({
      data: {
        bankAccountId: accountId,
        movementType,
        amount: value,
        baseAmount: value,
        totalAmount: value,
        description,
        createdAt,
        invoiceId,
      },
    })
  })
}

async function ensureTransfer({ fromId, toId, amount, description, createdAt }) {
  const outgoing = `${description} · salida`
  const incoming = `${description} · entrada`
  const existing = await prisma.bankAccountMovement.findFirst({
    where: { description: outgoing },
  })
  if (existing) return existing

  await ensureBankMovement({
    accountId: fromId,
    movementType: 'TRANSFERENCIA_SALIENTE',
    amount,
    description: outgoing,
    createdAt,
  })
  return ensureBankMovement({
    accountId: toId,
    movementType: 'TRANSFERENCIA_ENTRANTE',
    amount,
    description: incoming,
    createdAt,
  })
}

async function ensureAdjustment({ accountId, amount, description, createdAt }) {
  const existing = await prisma.bankAccountMovement.findFirst({
    where: { description },
  })
  if (existing) return existing

  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } })
  const difference = round2(amount)
  return prisma.$transaction(async (tx) => {
    await tx.bankAccount.update({
      where: { id: accountId },
      data: { currentBalance: { increment: difference } },
    })
    return tx.bankAccountMovement.create({
      data: {
        bankAccountId: account.id,
        movementType: 'AJUSTE',
        amount: Math.abs(difference),
        baseAmount: Math.abs(difference),
        totalAmount: Math.abs(difference),
        description,
        createdAt,
      },
    })
  })
}

async function ensureCredit({ invoice, dueDays, paymentAmount, accountId, label }) {
  let credit = await prisma.invoiceCredit.findUnique({
    where: { invoiceId: invoice.id },
  })
  if (!credit) {
    credit = await prisma.invoiceCredit.create({
      data: {
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        dueDate: daysFromNow(dueDays),
        totalAmount: invoice.total,
        paidAmount: 0,
        balance: invoice.total,
        status: 'PENDIENTE',
      },
    })
  }

  if (!paymentAmount) return credit
  const paymentNote = `${DEMO_PREFIX}${label} · abono`
  const existingPayment = await prisma.creditPayment.findFirst({
    where: { invoiceCreditId: credit.id, notes: paymentNote },
  })
  if (existingPayment) return credit

  const amount = Math.min(round2(paymentAmount), Number(credit.balance))
  const movement = await ensureBankMovement({
    accountId,
    movementType: 'INGRESO',
    amount,
    description: `${DEMO_PREFIX}${label} · recaudo crédito`,
    createdAt: daysAgo(2),
    invoiceId: invoice.id,
  })
  const paidAmount = round2(Number(credit.paidAmount) + amount)
  const balance = round2(Number(credit.totalAmount) - paidAmount)
  await prisma.creditPayment.create({
    data: {
      invoiceCreditId: credit.id,
      bankMovementId: movement.id,
      amount,
      notes: paymentNote,
      paidAt: daysAgo(2),
    },
  })
  return prisma.invoiceCredit.update({
    where: { id: credit.id },
    data: {
      paidAmount,
      balance,
      status: balance === 0 ? 'PAGADA' : 'PARCIAL',
    },
  })
}

async function ensureDemoInvoice({ consecutive, client, product, warehouse, quantity }) {
  const existing = await prisma.invoice.findUnique({ where: { consecutive } })
  if (existing) return existing

  const price = product.prices.find((item) => item.isDefault) ?? product.prices[0]
  const unitPrice = Number(price.price)
  const taxRate = Number(product.taxRate ?? 0)
  const subtotal = round2(unitPrice * quantity)
  const taxes = round2(subtotal * (taxRate / 100))
  const total = round2(subtotal + taxes)

  return prisma.invoice.create({
    data: {
      consecutive,
      clientId: client.id,
      warehouseId: warehouse.id,
      source: 'ADMIN',
      saleMode: 'CREDITO',
      subtotal,
      taxes,
      total,
      items: {
        create: {
          productId: product.id,
          productPriceId: price.id,
          warehouseId: warehouse.id,
          quantity,
          unitPrice,
          taxRate,
          subtotal,
          taxAmount: taxes,
          total,
          grossSubtotal: subtotal,
          discountAmount: 0,
        },
      },
    },
  })
}

async function ensureAdvance({ client, amount, dueDays }) {
  const totalAmount = -Math.abs(Number(amount))
  const existing = await prisma.invoiceCredit.findFirst({
    where: {
      clientId: client.id,
      totalAmount,
      balance: totalAmount,
      status: 'PENDIENTE',
      invoiceId: null,
    },
  })
  if (existing) return existing

  return prisma.invoiceCredit.create({
    data: {
      clientId: client.id,
      dueDate: daysFromNow(dueDays),
      totalAmount,
      paidAmount: 0,
      balance: totalAmount,
      status: 'PENDIENTE',
      createdAt: daysAgo(1),
    },
  })
}

async function ensureQuote({ consecutive, clientId, product, status, expiresAt, quantity }) {
  const existing = await prisma.quote.findUnique({ where: { consecutive } })
  if (existing) return existing
  const price = product.prices.find((item) => item.isDefault) ?? product.prices[0]
  const unitPrice = Number(price.price)
  const taxRate = Number(product.taxRate ?? 0)
  const subtotal = round2(unitPrice * quantity)
  const taxes = round2(subtotal * (taxRate / 100))
  return prisma.quote.create({
    data: {
      consecutive,
      clientId,
      subtotal,
      taxes,
      total: round2(subtotal + taxes),
      status,
      expiresAt,
      items: {
        create: {
          productId: product.id,
          productPriceId: price.id,
          quantity,
          unitPrice,
          taxRate,
          subtotal,
          taxAmount: taxes,
          total: round2(subtotal + taxes),
        },
      },
    },
  })
}

async function ensureCatalogExamples(products, productTypes) {
  const tagNames = ['Alta rotación demo', 'Oferta de temporada demo', 'Mayorista demo']
  const tags = []
  for (const name of tagNames) {
    tags.push(
      await prisma.tag.upsert({
        where: { name },
        update: { isActive: true, deletedAt: null },
        create: { name, description: `Etiqueta demostrativa ${name}` },
      }),
    )
  }

  const offerName = `${DEMO_PREFIX}Oferta combo supermercado`
  let offer = await prisma.offer.findFirst({ where: { name: offerName } })
  if (!offer) {
    offer = await prisma.offer.create({
      data: {
        name: offerName,
        description: 'Descuento demostrativo para revisar ofertas y combinaciones.',
        discountType: 'PORCENTAJE',
        discountValue: 10,
        startsAt: daysAgo(15),
        endsAt: daysFromNow(30),
        minimumProductQuantity: 2,
        isActive: true,
        products: {
          create: products.slice(0, 2).map((product) => ({ productId: product.id })),
        },
        productTypes: {
          create: productTypes.slice(0, 1).map((productType) => ({ productTypeId: productType.id })),
        },
        tags: {
          create: tags.slice(0, 2).map((tag) => ({ tagId: tag.id })),
        },
      },
    })
  }

  const retention = await prisma.retention.upsert({
    where: { code: `${DEMO_PREFIX}RTE` },
    update: { isActive: true, deletedAt: null },
    create: {
      code: `${DEMO_PREFIX}RTE`,
      description: 'Retención demostrativa para compras gravadas',
      subtracting: 0,
      minimumBase: 100000,
      operationCode: 'RTE-DEMO',
      operationDescription: 'Ejemplo de retención en la fuente',
      applyPurchases: true,
      ranges: {
        create: [
          { minimum: 100000, maximum: 999999, percentage: 2.5, sortOrder: 1 },
          { minimum: 1000000, maximum: 999999999, percentage: 3.5, sortOrder: 2 },
        ],
      },
    },
  })

  return { offer, tags, retention }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria')

  const [clients, products, productTypes] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, take: 6 }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      include: { prices: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] } },
      orderBy: { id: 'asc' },
      take: 8,
    }),
    prisma.productType.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, take: 4 }),
  ])
  const invoices = await prisma.invoice.findMany({
    where: { status: 'ACTIVA' },
    orderBy: { id: 'asc' },
    take: 6,
  })
  if (clients.length < 3 || products.length < 2 || productTypes.length < 1 || invoices.length < 3) {
    throw new Error('Se requieren clientes, productos, tipos e invoices activos para cargar los ejemplos completos')
  }

  const featuredClient = await prisma.client.findFirst({
    where: { identification: '1107045623', isActive: true },
  })
  const featuredWarehouse = await prisma.warehouse.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { id: 'asc' },
  })
  if (!featuredClient || !featuredWarehouse) {
    throw new Error('Se requiere el cliente 1107045623 y una bodega activa para cargar el ejemplo de cuentas por cobrar')
  }

  const accounts = {}
  for (const data of [
    { name: 'Cuenta Demo Principal', bankName: 'Bancolombia', accountNumber: '000-DEMO-001', accountType: 'Ahorros', currentBalance: 5000000 },
    { name: 'Cuenta Demo Operativa', bankName: 'Davivienda', accountNumber: '000-DEMO-002', accountType: 'Corriente', currentBalance: 3200000 },
    { name: 'Cuenta Demo Digital', bankName: 'Nequi', accountNumber: '000-DEMO-003', accountType: 'Digital', currentBalance: 950000 },
  ]) {
    accounts[data.name] = await ensureBankAccount(data)
  }

  await ensureBankMovement({
    accountId: accounts['Cuenta Demo Principal'].id,
    movementType: 'INGRESO',
    amount: 650000,
    description: `${DEMO_PREFIX}recaudo mostrador`,
    createdAt: daysAgo(12),
  })
  await ensureBankMovement({
    accountId: accounts['Cuenta Demo Principal'].id,
    movementType: 'EGRESO',
    amount: 250000,
    description: `${DEMO_PREFIX}servicios y arriendo`,
    createdAt: daysAgo(9),
  })
  await ensureTransfer({
    fromId: accounts['Cuenta Demo Principal'].id,
    toId: accounts['Cuenta Demo Operativa'].id,
    amount: 450000,
    description: `${DEMO_PREFIX}traslado operativo`,
    createdAt: daysAgo(7),
  })
  await ensureAdjustment({
    accountId: accounts['Cuenta Demo Digital'].id,
    amount: 15000,
    description: `${DEMO_PREFIX}ajuste conciliación digital`,
    createdAt: daysAgo(3),
  })

  await ensureCredit({
    invoice: invoices[0],
    dueDays: -10,
    paymentAmount: Number(invoices[0].total) * 0.35,
    accountId: accounts['Cuenta Demo Principal'].id,
    label: 'credito parcial',
  })
  await ensureCredit({
    invoice: invoices[1],
    dueDays: 20,
    paymentAmount: Number(invoices[1].total),
    accountId: accounts['Cuenta Demo Operativa'].id,
    label: 'credito pagado',
  })
  await ensureCredit({
    invoice: invoices[2],
    dueDays: 35,
    label: 'credito pendiente',
  })

  const featuredInvoice = await ensureDemoInvoice({
    consecutive: `${DEMO_PREFIX}FAC-ALF-001`,
    client: featuredClient,
    product: products[0],
    warehouse: featuredWarehouse,
    quantity: 2,
  })
  await ensureCredit({
    invoice: featuredInvoice,
    dueDays: 12,
    paymentAmount: Number(featuredInvoice.total) * 0.4,
    accountId: accounts['Cuenta Demo Principal'].id,
    label: 'credito Alfonso parcial',
  })
  await ensureAdvance({ client: featuredClient, amount: 75000, dueDays: 365 })

  const quoteStatuses = ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'EXPIRADA', 'CONVERTIDA']
  for (let index = 0; index < quoteStatuses.length; index += 1) {
    await ensureQuote({
      consecutive: `${DEMO_PREFIX}COT-${String(index + 1).padStart(3, '0')}`,
      clientId: clients[index % clients.length].id,
      product: products[index % products.length],
      status: quoteStatuses[index],
      expiresAt: index === 3 ? daysAgo(4) : daysFromNow(30),
      quantity: index + 1,
    })
  }

  const catalog = await ensureCatalogExamples(products, productTypes)
  const summary = {
    cuentasBancarias: await prisma.bankAccount.count({ where: { isActive: true } }),
    movimientosBancarios: await prisma.bankAccountMovement.count(),
    cuentasPorCobrar: await prisma.invoiceCredit.count(),
    pagosRecibidos: await prisma.creditPayment.count(),
    cotizaciones: await prisma.quote.count(),
    compras: await prisma.purchaseOrder.count(),
    pedidosYEntregas: await prisma.delivery.count(),
    productos: await prisma.product.count({ where: { isActive: true } }),
    clientes: await prisma.client.count({ where: { isActive: true } }),
    proveedores: await prisma.provider.count({ where: { isActive: true } }),
    ofertas: await prisma.offer.count({ where: { isActive: true } }),
    etiquetas: await prisma.tag.count({ where: { isActive: true } }),
    retenciones: await prisma.retention.count({ where: { isActive: true } }),
    ofertaDemo: catalog.offer.name,
  }
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
