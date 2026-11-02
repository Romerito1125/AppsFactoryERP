// Datos DEMO para ver Cuentas por cobrar y por pagar "llenas":
// clientes con facturas a crédito, abonos (recibos), notas y anticipos; proveedores con compras
// recibidas, pagos, notas y anticipos. Todo lleva el prefijo DEMO / (DEMO) para reconocerlo.
// Es idempotente: si ya existe el cliente DEMO-C1 no vuelve a cargar nada.
// Mueve saldos bancarios REALES de las cuentas activas (aporte inicial a la cuenta 2 incluido).
require('dotenv').config()

const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const day = (offset) => {
  const date = new Date()
  date.setHours(10, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date
}

async function main() {
  if (await prisma.client.findUnique({ where: { identification: 'DEMO-C1' } })) {
    console.log('Los datos demo ya existen: no se cargó nada.')
    return
  }
  const accounts = await prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } })
  if (accounts.length < 2) throw new Error('Se necesitan 2 cuentas bancarias activas.')
  const [acctA, acctB] = accounts
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } })
  const product = await prisma.product.findFirstOrThrow({ orderBy: { id: 'asc' } })
  const adminUser = await prisma.user.findFirst({ orderBy: { id: 'asc' } })

  await prisma.$transaction(
    async (tx) => {
      // --- banco ---------------------------------------------------------------
      async function move(accountId, type, amount, description, createdAt, invoiceId) {
        await tx.bankAccount.update({
          where: { id: accountId },
          data: { currentBalance: { increment: type === 'INGRESO' ? amount : -amount } },
        })
        return tx.bankAccountMovement.create({
          data: {
            bankAccountId: accountId,
            movementType: type,
            amount,
            baseAmount: amount,
            totalAmount: amount,
            description,
            createdAt,
            invoiceId,
          },
        })
      }
      await move(acctB.id, 'INGRESO', 30_000_000, 'Aporte inicial (demo)', day(-70))

      // --- clientes --------------------------------------------------------------
      const mkClient = (n, first, last, max, phone, address) =>
        tx.client.create({
          data: {
            identification: `DEMO-C${n}`,
            firstName: first,
            lastName: last,
            phone,
            address,
            clientType: 'MINORISTA',
            hasCredit: true,
            maxCredit: max,
          },
        })
      const c1 = await mkClient(1, 'ABASTOS HYG', '(DEMO)', 8_000_000, '3165091690', 'Calle 19 Carrera 42 7P1 Apto 2 Barrio CE')
      const c2 = await mkClient(2, 'TIENDA LA ESQUINA', '(DEMO)', 3_000_000, '3004567812', 'Carrera 7 # 12-30')
      const c3 = await mkClient(3, 'SUPERMERCADO EL AHORRO', '(DEMO)', 5_000_000, '3112345600', 'Avenida 30 # 45-10')

      // --- facturas a crédito ----------------------------------------------------
      async function credit(client, code, total, issuedOffset, dueOffset) {
        const invoice = await tx.invoice.create({
          data: {
            consecutive: `DEMO-FAC-${code}`,
            clientId: client.id,
            warehouseId: warehouse.id,
            createdByUserId: adminUser?.id,
            createdByUsername: adminUser?.username,
            source: 'ADMIN',
            saleMode: 'CREDITO',
            subtotal: total,
            taxes: 0,
            total,
            createdAt: day(issuedOffset),
          },
        })
        return tx.invoiceCredit.create({
          data: {
            invoiceId: invoice.id,
            clientId: client.id,
            dueDate: day(dueOffset),
            totalAmount: total,
            balance: total,
            createdAt: day(issuedOffset),
          },
        })
      }
      const f1 = await credit(c1, '1001', 850_000, -60, -45)
      const f2 = await credit(c1, '1002', 3_400_000, -45, -30)
      const f3 = await credit(c1, '1003', 4_250_000, -20, -5)
      await credit(c1, '1004', 1_800_000, -3, 12)
      const f5 = await credit(c2, '2001', 1_200_000, -15, 15)
      const f6 = await credit(c2, '2002', 650_000, -40, -10)
      await credit(c3, '3001', 2_600_000, -8, 7)

      // --- recibos de cobro (abonos) ---------------------------------------------
      async function receipt(client, number, detail, offset, lines, sources, extra = {}) {
        const total = lines.reduce((sum, line) => sum + line.amount, 0)
        const instruments = []
        for (const source of sources) {
          const movement = await move(
            source.account.id,
            'INGRESO',
            source.amount,
            `Cobro ${number} · ${client.firstName}${source.ref ? ` · ${source.ref}` : ''}`,
            day(offset),
          )
          instruments.push({
            bankAccountId: source.account.id,
            name: source.label ?? source.account.name,
            amount: source.amount,
            reference: source.ref ?? null,
            movementId: movement.id,
          })
        }
        const record = await tx.paymentReceipt.create({
          data: {
            kind: 'COBRO',
            receiptNumber: `RC-DEMO-${number}`,
            documentNumber: number,
            detail,
            clientId: client.id,
            paidAt: day(offset),
            totalAmount: total,
            cashAmount: 0,
            retentionTotal: lines.reduce((sum, line) => sum + (line.retention ?? 0), 0),
            instruments,
            allocations: lines.map((line) => ({
              creditId: line.credit.id,
              number: line.label,
              amount: line.amount,
              retention: line.retention ?? 0,
            })),
            operationType: 'Abono',
            sellerName: 'ISELA BUSTILLO',
            createdByUsername: 'demo',
            createdAt: day(offset),
            ...extra,
          },
        })
        for (const line of lines) {
          const applied = line.amount + (line.retention ?? 0)
          await tx.creditPayment.create({
            data: {
              invoiceCreditId: line.credit.id,
              amount: line.amount,
              retention: line.retention ?? 0,
              notes: detail,
              receiptId: record.id,
              paidAt: day(offset),
            },
          })
          const current = await tx.invoiceCredit.findUniqueOrThrow({ where: { id: line.credit.id } })
          const balance = Math.max(0, Number(current.balance) - applied)
          await tx.invoiceCredit.update({
            where: { id: current.id },
            data: {
              paidAmount: { increment: applied },
              balance,
              status: balance === 0 ? 'PAGADA' : 'PARCIAL',
            },
          })
        }
        return record
      }
      await receipt(c1, 'D-0101', 'Pago factura 1001', -55, [{ credit: f1, label: 'DEMO-FAC-1001', amount: 850_000 }], [
        { account: acctA, amount: 850_000, ref: 'CONS-5521' },
      ])
      await receipt(c1, 'D-0102', 'Abono factura 1002', -40, [{ credit: f2, label: 'DEMO-FAC-1002', amount: 1_275_000 }], [
        { account: acctA, amount: 275_000, ref: null, label: 'EFECTIVO' },
        { account: acctB, amount: 1_000_000, ref: 'TRF-3340' },
      ])
      await receipt(c1, 'D-0103', 'Abono factura 1002', -20, [{ credit: f2, label: 'DEMO-FAC-1002', amount: 1_000_000 }], [
        { account: acctB, amount: 1_000_000, ref: 'TRF-3401' },
      ])
      await receipt(c1, 'D-0104', 'Abono factura 1003', -10, [{ credit: f3, label: 'DEMO-FAC-1003', amount: 2_105_000, retention: 20_000 }], [
        { account: acctA, amount: 2_105_000, ref: 'CONS-6012' },
      ])
      await receipt(c2, 'D-0105', 'Abono de hoy factura 2001', 0, [{ credit: f5, label: 'DEMO-FAC-2001', amount: 400_000 }], [
        { account: acctB, amount: 400_000, ref: 'TRF-7788' },
      ])

      // --- notas y anticipos de clientes ------------------------------------------
      const debitCredit = await tx.invoiceCredit.create({
        data: { clientId: c1.id, dueDate: day(5), totalAmount: 150_000, balance: 150_000, createdAt: day(-12) },
      })
      await tx.accountNote.create({
        data: {
          side: 'COBRAR', kind: 'DEBITO', documentNumber: 'ND-DEMO-1', detail: 'Intereses de mora',
          clientId: c1.id, creditId: debitCredit.id, amount: 150_000, balance: 150_000,
          dueDate: day(5), issuedAt: day(-12), createdByUsername: 'demo', createdAt: day(-12),
        },
      })
      await tx.invoiceCredit.update({
        where: { id: f6.id },
        data: { totalAmount: { decrement: 50_000 }, balance: { decrement: 50_000 } },
      })
      await tx.accountNote.create({
        data: {
          side: 'COBRAR', kind: 'CREDITO', documentNumber: 'NC-DEMO-1', detail: 'Descuento pactado por pronto pago',
          clientId: c2.id, creditId: f6.id, amount: 50_000, issuedAt: day(-6), createdByUsername: 'demo', createdAt: day(-6),
        },
      })
      const advanceMovement = await move(acctA.id, 'INGRESO', 500_000, 'Anticipo ANT-DEMO-1 · SUPERMERCADO EL AHORRO', day(-4))
      await tx.clientAdvance.create({
        data: {
          consecutive: 'ANT-DEMO-1', clientId: c3.id, amount: 500_000, balance: 500_000,
          bankMovementId: advanceMovement.id, notes: 'Anticipo de pedido', createdAt: day(-4),
        },
      })

      // --- proveedores y compras ----------------------------------------------------
      const providers = await tx.provider.findMany({ orderBy: { id: 'asc' }, take: 3 })
      const demoProvider = await tx.provider.create({
        data: { name: 'ALMACEN MERKASEO (DEMO)', taxId: '900123456-7', phonePrimary: '3201112233', address: 'Zona industrial Bodega 12' },
      })
      const [p1, p2, p3] = providers
      async function order(provider, code, total, orderedOffset, dueOffset) {
        return tx.purchaseOrder.create({
          data: {
            consecutive: `DEMO-OC-${code}`,
            providerId: provider.id,
            warehouseId: warehouse.id,
            status: 'RECIBIDA',
            orderedAt: day(orderedOffset),
            receivedAt: day(orderedOffset + 1),
            expectedAt: day(dueOffset),
            subtotal: total,
            total,
            payableTotal: total,
            items: {
              create: [{
                productId: product.id, quantity: 10, receivedQuantity: 10, unit: 'UND',
                unitCost: total / 10, subtotal: total, total,
              }],
            },
          },
        })
      }
      const o1 = await order(p1, '001', 4_200_000, -30, -10)
      await order(p1, '002', 950_000, -6, 9)
      const o3 = await order(p2, '003', 2_380_000, -25, -5)
      const o4 = await order(p2, '004', 780_000, -2, 20)
      const o5 = await order(p3, '005', 1_560_000, -12, 3)
      const o6 = await order(demoProvider, '006', 3_100_000, -50, -20)
      await order(demoProvider, '007', 890_000, -9, 21)

      async function payment(provider, number, detail, offset, lines, sources) {
        const total = lines.reduce((sum, line) => sum + line.amount, 0)
        const instruments = []
        let sourceIndex = 0
        let remaining = sources.map((source) => ({ ...source, left: source.amount }))
        for (const line of lines) {
          let pending = line.amount
          while (pending > 0) {
            const source = remaining[sourceIndex]
            const slice = Math.min(pending, source.left)
            const movement = await move(
              source.account.id,
              'EGRESO',
              slice,
              `Pago compra ${line.order.consecutive} - Doc ${number}${source.ref ? ` · ${source.ref}` : ''}`,
              day(offset),
            )
            instruments.push({ bankAccountId: source.account.id, name: source.account.name, amount: slice, reference: source.ref ?? null, movementIds: [movement.id] })
            source.left -= slice
            pending -= slice
            if (source.left <= 0) sourceIndex += 1
          }
        }
        await tx.paymentReceipt.create({
          data: {
            kind: 'PAGO',
            receiptNumber: `CE-DEMO-${number}`,
            documentNumber: number,
            detail,
            providerId: provider.id,
            paidAt: day(offset),
            totalAmount: total,
            instruments,
            allocations: lines.map((line) => ({ purchaseOrderId: line.order.id, number: line.order.consecutive, amount: line.amount })),
            operationType: 'Pago a proveedor',
            createdByUsername: 'demo',
            createdAt: day(offset),
          },
        })
      }
      await payment(p1, 'P-0101', 'Abono compra DEMO-OC-001', -20, [{ order: o1, amount: 1_500_000 }], [{ account: acctB, amount: 1_500_000, ref: 'TRF-9001' }])
      await payment(p1, 'P-0102', 'Segundo abono compra DEMO-OC-001', -5, [{ order: o1, amount: 1_200_000 }], [{ account: acctB, amount: 1_200_000, ref: 'TRF-9120' }])
      await payment(p2, 'P-0103', 'Pago compra DEMO-OC-004', 0, [{ order: o4, amount: 780_000 }], [{ account: acctB, amount: 780_000, ref: 'TRF-9302' }])
      await payment(demoProvider, 'P-0104', 'Pago total compra DEMO-OC-006', -35, [{ order: o6, amount: 3_100_000 }], [{ account: acctB, amount: 3_100_000, ref: 'TRF-8800' }])

      // --- notas y anticipos de proveedores -------------------------------------------
      await tx.accountNote.create({
        data: {
          side: 'PAGAR', kind: 'DEBITO', documentNumber: 'ND-P-DEMO-1', detail: 'Retención en la fuente',
          providerId: p2.id, purchaseOrderId: o3.id, amount: 38_000, issuedAt: day(-24), createdByUsername: 'demo', createdAt: day(-24),
        },
      })
      await tx.accountNote.create({
        data: {
          side: 'PAGAR', kind: 'CREDITO', documentNumber: 'NC-P-DEMO-1', detail: 'Flete adicional facturado',
          providerId: p2.id, purchaseOrderId: o3.id, amount: 25_000, issuedAt: day(-20), createdByUsername: 'demo', createdAt: day(-20),
        },
      })
      await move(acctB.id, 'EGRESO', 300_000, 'Anticipo proveedor AN-DEMO-1 · Casa Limpia', day(-8))
      const advance = await tx.accountNote.create({
        data: {
          side: 'PAGAR', kind: 'ANTICIPO', documentNumber: 'AN-DEMO-1', detail: 'Anticipo de pedido',
          providerId: p3.id, amount: 300_000, balance: 200_000, bankAccountId: acctB.id,
          issuedAt: day(-8), createdByUsername: 'demo', createdAt: day(-8),
        },
      })
      await tx.accountNote.create({
        data: {
          side: 'PAGAR', kind: 'DEBITO', documentNumber: 'AP-AN-DEMO-1-1', detail: 'Aplicación del anticipo AN-DEMO-1',
          providerId: p3.id, purchaseOrderId: o5.id, amount: 100_000, advanceNoteId: advance.id,
          issuedAt: day(-3), createdByUsername: 'demo', createdAt: day(-3),
        },
      })
    },
    { timeout: 120_000, maxWait: 20_000 },
  )

  const summary = {
    clientes: await prisma.client.count({ where: { identification: { startsWith: 'DEMO-C' } } }),
    cuentasPorCobrar: await prisma.invoiceCredit.count({ where: { client: { identification: { startsWith: 'DEMO-C' } } } }),
    recibosCobro: await prisma.paymentReceipt.count({ where: { kind: 'COBRO', receiptNumber: { startsWith: 'RC-DEMO' } } }),
    compras: await prisma.purchaseOrder.count({ where: { consecutive: { startsWith: 'DEMO-OC' } } }),
    pagos: await prisma.paymentReceipt.count({ where: { kind: 'PAGO', receiptNumber: { startsWith: 'CE-DEMO' } } }),
    notas: await prisma.accountNote.count({ where: { documentNumber: { contains: 'DEMO' } } }),
    cuentas: await prisma.bankAccount.findMany({ where: { isActive: true }, select: { name: true, currentBalance: true } }),
  }
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
