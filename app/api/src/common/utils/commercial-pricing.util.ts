export type CommercialLineTotals = {
  subtotal: number;
  taxAmount: number;
  total: number;
};

export function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function grossFromNet(netAmount: number, taxRate: number) {
  const net = Number(netAmount);
  const rate = Number(taxRate) || 0;
  if (!Number.isFinite(net)) return 0;
  return roundMoney(net * (1 + rate / 100));
}

export function netFromGross(grossAmount: number, taxRate: number) {
  const gross = Number(grossAmount);
  const rate = Number(taxRate) || 0;
  if (!Number.isFinite(gross)) return 0;
  return roundMoney(gross / (1 + rate / 100));
}

export function calculateLineTotals({
  unitPriceNet,
  quantity,
  taxRate,
  netSubtotal,
}: {
  unitPriceNet?: number;
  quantity?: number;
  taxRate?: number;
  netSubtotal?: number;
}): CommercialLineTotals {
  const subtotal = roundMoney(
    netSubtotal ?? Number(unitPriceNet ?? 0) * Number(quantity ?? 0),
  );
  const taxAmount = roundMoney(subtotal * ((Number(taxRate) || 0) / 100));
  return {
    subtotal,
    taxAmount,
    total: roundMoney(subtotal + taxAmount),
  };
}

