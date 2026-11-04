// COP: los importes se redondean al peso entero (sin centavos).
export function roundMoney(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.round(Number(value) + Number.EPSILON);
}

export function grossFromNet(netAmount, taxRate) {
  const net = Number(netAmount);
  const rate = Number(taxRate) || 0;
  if (!Number.isFinite(net)) return 0;
  return roundMoney(net * (1 + rate / 100));
}

export function netFromGross(grossAmount, taxRate) {
  const gross = Number(grossAmount);
  const rate = Number(taxRate) || 0;
  if (!Number.isFinite(gross)) return 0;
  return roundMoney(gross / (1 + rate / 100));
}

// Utilidad (%) sobre el costo neto: precio y costo se comparan sin IVA.
export function marginPercent(costNet, priceNet) {
  const cost = Number(costNet);
  const price = Number(priceNet);
  if (!Number.isFinite(cost) || !Number.isFinite(price) || cost <= 0) return null;
  return Math.round(((price - cost) / cost) * 10000) / 100;
}

export function grossPriceFromMargin(costNet, percent, taxRate) {
  const cost = Number(costNet);
  const margin = Number(percent);
  if (!Number.isFinite(cost) || !Number.isFinite(margin) || cost <= 0) return 0;
  return grossFromNet(cost * (1 + margin / 100), taxRate);
}

export function priceForExactLevel(product, level) {
  return (
    (product?.prices ?? []).find(
      (price) =>
        price?.isActive !== false &&
        price?.deletedAt == null &&
        getPriceLevel(price) === Number(level),
    ) ?? null
  );
}

export function calculateLineTotals({
  unitPriceNet,
  quantity,
  taxRate,
  netSubtotal,
}) {
  const subtotal = netSubtotal ?? Number(unitPriceNet ?? 0) * Number(quantity ?? 0);
  const taxAmount = subtotal * ((Number(taxRate) || 0) / 100);
  return {
    subtotal,
    taxAmount,
    total: subtotal + taxAmount,
  };
}

export function getPriceLevel(price) {
  if (price?.priceLevel !== null && price?.priceLevel !== undefined) {
    return Number(price.priceLevel);
  }
  const match = String(price?.name ?? "").match(/^precio\s*([0-3])$/i);
  return match ? Number(match[1]) : null;
}

export function isActiveSalePrice(price, now = Date.now()) {
  return (
    price?.isActive !== false &&
    price?.deletedAt == null &&
    (!price.startsAt || new Date(price.startsAt).getTime() <= now) &&
    (!price.endsAt || new Date(price.endsAt).getTime() >= now)
  );
}

export function activeSalePrices(product, now = Date.now()) {
  return (product?.prices ?? []).filter((price) =>
    isActiveSalePrice(price, now),
  );
}

export function defaultSalePrice(product) {
  const prices = activeSalePrices(product);
  return (
    prices.find((price) => price.isDefault) ??
    prices.find((price) => getPriceLevel(price) === 0) ??
    prices[0] ??
    null
  );
}

export function salePriceForLevel(product, priceLevel = "0") {
  const prices = activeSalePrices(product);
  return (
    prices.find((price) => getPriceLevel(price) === Number(priceLevel)) ??
    defaultSalePrice(product)
  );
}

export function salePriceById(product, id) {
  return activeSalePrices(product).find(
    (price) => Number(price.id) === Number(id),
  );
}

