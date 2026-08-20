require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SALES = [
  { key: 'ROOT', quantity: 2, productIndex: 0 },
  { key: 'G1', quantity: 3, productIndex: 1 },
  { key: 'G2', quantity: 4, productIndex: 0 },
  { key: 'G3', quantity: 5, productIndex: 1 },
  { key: 'G4', quantity: 6, productIndex: 0 },
];

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

async function ensurePolicy(tx, generation, percentage, isSocialWork) {
  return tx.referralProfitPolicy.upsert({
    where: { generation },
    update: { percentage, isActive: true, isSocialWork },
    create: { generation, percentage, isActive: true, isSocialWork },
  });
}

async function migrateLegacyGenerationFour(tx) {
  const legacyBenefits = await tx.referralBenefit.findMany({
    where: { generation: 4 },
  });

  for (const benefit of legacyBenefits) {
    await tx.referralSocialContribution.upsert({
      where: {
        buyerClientId_originInvoiceId_generation: {
          buyerClientId: benefit.buyerClientId,
          originInvoiceId: benefit.originInvoiceId,
          generation: 4,
        },
      },
      update: {
        baseProfit: benefit.baseProfit,
        percentage: benefit.percentage,
        amount: benefit.amount,
      },
      create: {
        buyerClientId: benefit.buyerClientId,
        originInvoiceId: benefit.originInvoiceId,
        generation: 4,
        baseProfit: benefit.baseProfit,
        percentage: benefit.percentage,
        amount: benefit.amount,
      },
    });

    await tx.referralBenefit.update({
      where: { id: benefit.id },
      data: { status: 'ANULADO', remainingAmount: 0 },
    });
  }

  return legacyBenefits.length;
}

async function ensureInvoice(tx, { consecutive, clientId, product, warehouseId, quantity, createdByUser, source }) {
  const existing = await tx.invoice.findUnique({
    where: { consecutive },
    include: { items: true },
  });

  if (existing) {
    return existing;
  }

  const price = Number(product.prices[0].price);
  const unitCost = Number(product.costs[0]?.cost ?? price * 0.6);
  const taxRate = Number(product.taxRate ?? 0);
  const grossSubtotal = roundMoney(price * quantity);
  const taxAmount = roundMoney(grossSubtotal * (taxRate / 100));
  const total = roundMoney(grossSubtotal + taxAmount);
  const profitAmount = roundMoney(Math.max(0, (price - unitCost) * quantity));

  const invoice = await tx.invoice.create({
    data: {
      consecutive,
      clientId,
      warehouseId,
      createdByUserId: createdByUser.id,
      createdByRole: createdByUser.role,
      createdByUsername: createdByUser.username,
      source,
      saleMode: 'CONTADO',
      subtotal: grossSubtotal,
      taxes: taxAmount,
      total,
      discountTotal: 0,
      referralDiscount: 0,
      status: 'ACTIVA',
      validationStatus: 'VALIDADA',
    },
  });

  const item = await tx.invoiceItem.create({
    data: {
      invoiceId: invoice.id,
      productId: product.id,
      warehouseId,
      productPriceId: product.prices[0].id,
      quantity,
      unitPrice: price,
      taxRate,
      grossSubtotal,
      discountAmount: 0,
      subtotal: grossSubtotal,
      taxAmount,
      total,
      unitCost,
      profitAmount,
    },
  });

  return { ...invoice, items: [item] };
}

async function ensureReferralArtifacts(tx, buyerClientId, invoice) {
  const baseProfit = roundMoney(
    invoice.items.reduce((sum, item) => sum + Number(item.profitAmount ?? 0), 0),
  );
  let descendantClientId = buyerClientId;
  const visited = new Set([buyerClientId]);
  const policies = await tx.referralProfitPolicy.findMany({
    where: { isActive: true },
    orderBy: { generation: 'asc' },
  });
  const policyByGeneration = new Map(policies.map((policy) => [policy.generation, policy]));

  for (let generation = 1; generation <= 4; generation += 1) {
    const referral = await tx.referral.findUnique({
      where: { referredClientId: descendantClientId },
      select: { referrerClientId: true },
    });

    if (!referral || visited.has(referral.referrerClientId)) break;

    const beneficiaryClientId = referral.referrerClientId;
    visited.add(beneficiaryClientId);
    const policy = policyByGeneration.get(generation);
    const amount = roundMoney(baseProfit * (Number(policy?.percentage ?? 0) / 100));

    if (policy?.isSocialWork || generation === 4) {
      await tx.referralSocialContribution.upsert({
        where: {
          buyerClientId_originInvoiceId_generation: {
            buyerClientId,
            originInvoiceId: invoice.id,
            generation,
          },
        },
        update: { baseProfit, percentage: policy.percentage, amount },
        create: {
          buyerClientId,
          originInvoiceId: invoice.id,
          generation,
          baseProfit,
          percentage: policy?.percentage ?? 0,
          amount,
        },
      });
    } else {
      await tx.referralBenefit.upsert({
        where: {
          beneficiaryClientId_originInvoiceId_generation: {
            beneficiaryClientId,
            originInvoiceId: invoice.id,
            generation,
          },
        },
        update: {
          buyerClientId,
          baseProfit,
          percentage: policy?.percentage ?? 0,
          amount,
          remainingAmount: amount,
          status: 'DISPONIBLE',
        },
        create: {
          beneficiaryClientId,
          buyerClientId,
          originInvoiceId: invoice.id,
          generation,
          baseProfit,
          percentage: policy?.percentage ?? 0,
          amount,
          remainingAmount: amount,
          status: 'DISPONIBLE',
        },
      });
    }

    descendantClientId = beneficiaryClientId;
  }
}

async function main() {
  const rootUser = await prisma.user.findUnique({
    where: { username: 'vasquesoto@gmail.com' },
    include: { client: true },
  });
  if (!rootUser?.client) throw new Error('No se encontró el cliente de vasquesoto@gmail.com');

  const referrals = await prisma.client.findMany({
    where: { identification: { startsWith: 'VASQUE-REF-G' }, isActive: true },
    orderBy: { referralLevel: 'asc' },
  });
  if (referrals.length !== 4) throw new Error('La red de vasquesoto@gmail.com debe tener las generaciones G1 a G4');

  const [createdByUser, warehouse, products] = await Promise.all([
    prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { id: 'asc' } }),
    prisma.warehouse.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      include: {
        prices: { where: { isActive: true, isDefault: true }, orderBy: { id: 'asc' }, take: 1 },
        costs: { where: { isActive: true }, orderBy: [{ startsAt: 'desc' }, { id: 'desc' }], take: 1 },
      },
      orderBy: { id: 'asc' },
      take: 10,
    }),
  ]);

  if (!createdByUser || !warehouse || products.filter((product) => product.prices.length).length < 2) {
    throw new Error('Se necesitan un administrador, una bodega y dos productos con precio activo');
  }

  const usableProducts = products.filter((product) => product.prices.length >= 1);
  const clients = [rootUser.client, ...referrals];

  const result = await prisma.$transaction(async (tx) => {
    await ensurePolicy(tx, 1, 10, false);
    await ensurePolicy(tx, 2, 5, false);
    await ensurePolicy(tx, 3, 2, false);
    await ensurePolicy(tx, 4, 5, true);

    const migratedGenerationFourBenefits = await migrateLegacyGenerationFour(tx);
    const createdInvoices = [];

    for (let index = 0; index < SALES.length; index += 1) {
      const sale = SALES[index];
      const client = clients[index];
      const product = usableProducts[sale.productIndex % usableProducts.length];
      const invoice = await ensureInvoice(tx, {
        consecutive: `FAC-VASQUE-RED-${sale.key}`,
        clientId: client.id,
        product,
        warehouseId: warehouse.id,
        quantity: sale.quantity,
        createdByUser,
        source: 'APP_MOVIL',
      });

      await ensureReferralArtifacts(tx, client.id, invoice);
      createdInvoices.push({
        consecutive: invoice.consecutive,
        clientId: client.id,
        total: Number(invoice.total),
      });
    }

    return { migratedGenerationFourBenefits, createdInvoices, warehouseId: warehouse.id };
  }, { maxWait: 30000, timeout: 30000 });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
