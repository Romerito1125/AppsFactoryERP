/* Auditoría de solo lectura: cuenta valores de dinero con centavos (no escribe nada).
 *   node scripts/audit-cop-decimales.js
 * Sirve para decidir el redondeo al peso antes de endurecer las validaciones COP. */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const CHECKS = [
  ['ProductPrice.price', () => prisma.productPrice.findMany({ select: { id: true, price: true } }), (r) => r.price],
  ['ProductCost.cost', () => prisma.productCost.findMany({ select: { id: true, cost: true } }), (r) => r.cost],
  ['PurchaseOrderItem.unitCost', () => prisma.purchaseOrderItem.findMany({ select: { id: true, unitCost: true } }), (r) => r.unitCost],
  ['PurchaseOrder.total', () => prisma.purchaseOrder.findMany({ select: { id: true, total: true } }), (r) => r.total],
  ['PurchaseOrder.payableTotal', () => prisma.purchaseOrder.findMany({ select: { id: true, payableTotal: true } }), (r) => r.payableTotal],
  ['Invoice.total', () => prisma.invoice.findMany({ select: { id: true, total: true } }), (r) => r.total],
  ['InvoiceItem.unitPrice', () => prisma.invoiceItem.findMany({ select: { id: true, unitPrice: true } }), (r) => r.unitPrice],
  ['QuoteItem.unitPrice', () => prisma.quoteItem.findMany({ select: { id: true, unitPrice: true } }), (r) => r.unitPrice],
  ['Client.maxCredit', () => prisma.client.findMany({ select: { id: true, maxCredit: true } }), (r) => r.maxCredit],
  ['BankAccount.currentBalance', () => prisma.bankAccount.findMany({ select: { id: true, currentBalance: true } }), (r) => r.currentBalance],
  ['BankAccountMovement.totalAmount', () => prisma.bankAccountMovement.findMany({ select: { id: true, totalAmount: true } }), (r) => r.totalAmount],
  ['ClientAdvance.balance', () => prisma.clientAdvance.findMany({ select: { id: true, balance: true } }), (r) => r.balance],
  ['Provider.withholdingMinimumBase', () => prisma.provider.findMany({ select: { id: true, withholdingMinimumBase: true } }), (r) => r.withholdingMinimumBase],
];

(async () => {
  console.log('Auditoría COP (solo lectura)\n');
  for (const [label, load, read] of CHECKS) {
    const rows = await load();
    const values = rows.map((row) => ({ id: row.id, value: Number(read(row) ?? 0) })).filter((row) => Number.isFinite(row.value));
    const withCents = values.filter((row) => Math.abs(row.value - Math.round(row.value)) > 0.0001);
    const samples = withCents.slice(0, 3).map((row) => `#${row.id}=${row.value}`).join(', ');
    console.log(`${label.padEnd(36)} total ${String(values.length).padStart(6)}  con centavos ${String(withCents.length).padStart(6)}${samples ? `  ej. ${samples}` : ''}`);
  }
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error('ERROR', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
