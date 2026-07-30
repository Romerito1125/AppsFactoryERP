require('dotenv').config();

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function slugText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
}

function buildPlaceholderUrl({ text, width, height, bg, fg }) {
  const safeText = encodeURIComponent(slugText(text) || 'Mundo Tienda');
  return `https://placehold.co/${width}x${height}/${bg}/${fg}.png?text=${safeText}&font=montserrat`;
}

function getCategoryPalette(name) {
  const normalized = slugText(name).toLowerCase();

  if (normalized.includes('bebida') || normalized.includes('lacteo')) {
    return { bg: '0f766e', fg: 'ecfeff' };
  }
  if (normalized.includes('condiment') || normalized.includes('especia')) {
    return { bg: 'b45309', fg: 'fff7ed' };
  }
  if (normalized.includes('aseo') || normalized.includes('limpieza')) {
    return { bg: '1d4ed8', fg: 'eff6ff' };
  }
  if (normalized.includes('snack') || normalized.includes('galleta')) {
    return { bg: '7c3aed', fg: 'f5f3ff' };
  }
  if (normalized.includes('despensa') || normalized.includes('grano')) {
    return { bg: '365314', fg: 'f7fee7' };
  }

  return { bg: '334155', fg: 'f8fafc' };
}

function getProductPalette(product) {
  const categoryName = product.productType?.name ?? '';
  return getCategoryPalette(categoryName || product.name);
}

function hasVisibleImage(url) {
  return typeof url === 'string' && url.trim().length > 0;
}

async function main() {
  const productTypes = await prisma.productType.findMany({
    select: { id: true, name: true, imageUrl: true },
    orderBy: { id: 'asc' },
  });

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      imageUrl: true,
      productType: { select: { id: true, name: true } },
    },
    orderBy: { id: 'asc' },
  });

  const categoryUpdates = [];
  for (const productType of productTypes) {
    if (hasVisibleImage(productType.imageUrl)) continue;

    const palette = getCategoryPalette(productType.name);
    categoryUpdates.push(
      prisma.productType.update({
        where: { id: productType.id },
        data: {
          imageUrl: buildPlaceholderUrl({
            text: productType.name,
            width: 1200,
            height: 800,
            bg: palette.bg,
            fg: palette.fg,
          }),
        },
      }),
    );
  }

  const productUpdates = [];
  for (const product of products) {
    if (hasVisibleImage(product.imageUrl)) continue;

    const palette = getProductPalette(product);
    productUpdates.push(
      prisma.product.update({
        where: { id: product.id },
        data: {
          imageUrl: buildPlaceholderUrl({
            text: product.name,
            width: 900,
            height: 900,
            bg: palette.bg,
            fg: palette.fg,
          }),
        },
      }),
    );
  }

  if (categoryUpdates.length) {
    await prisma.$transaction(categoryUpdates);
  }

  if (productUpdates.length) {
    await prisma.$transaction(productUpdates);
  }

  const cafeDemo = await prisma.product.findFirst({
    where: { name: { contains: 'Cafe Utilidad Demo', mode: 'insensitive' } },
    select: { id: true, name: true, imageUrl: true, productType: { select: { name: true } } },
  });

  console.log(
    JSON.stringify(
      {
        updatedCategories: categoryUpdates.length,
        updatedProducts: productUpdates.length,
        sampleProduct: cafeDemo,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
