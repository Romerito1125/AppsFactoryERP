import { netFromGross } from "../../lib/commercial-pricing.js";

// COP: todo importe del desglose es un peso entero.
const round = (value) => Math.round(Number(value) || 0);
const isFilled = (value) => value !== null && value !== undefined && value !== "";

// Mismo criterio que el servidor: si no hay total a pagar guardado, se usa el total de la operación.
export function orderPayable(order) {
  const payable = Number(order?.payableTotal ?? 0);
  const total = Number(order?.total ?? 0);
  return round(payable > 0 || total === 0 ? payable : total);
}

// Desglose en el orden en que se lee la compra:
// renglones con IVA → descuento → flete → total operación → base imponible (antes de IVA)
// → retención → total a pagar. La base guardada manda; en compras anteriores se recalcula
// desde los renglones con el mismo factor de descuento.
export function orderBreakdown(order, items = []) {
  const lines = items.map((item) => {
    const gross = round(Number(item.quantity ?? 0) * Number(item.unitCost ?? 0));
    return { gross, net: round(netFromGross(gross, item.product?.taxRate)) };
  });
  const grossLines = lines.reduce((sum, line) => sum + line.gross, 0);
  const netLines = lines.reduce((sum, line) => sum + line.net, 0);
  const subtotal = round(order?.subtotal);
  const freight = round(order?.freight);
  const total = round(order?.total);
  const discounts = [order?.discount1Percent, order?.discount2Percent]
    .map((value) => Number(value ?? 0))
    .filter((value) => value > 0)
    .map((value) => `${value} %`);
  const hasItems = lines.length > 0;
  const discount = hasItems ? Math.max(0, grossLines - subtotal) : 0;
  const factor = grossLines > 0 ? subtotal / grossLines : 1;
  let base = null;
  if (isFilled(order?.retentionBase)) base = round(order.retentionBase);
  else if (hasItems) base = round(netLines * factor);
  const paid = round(order?.paidTotal ?? order?.paidAmount ?? 0);
  const payable = orderPayable(order);
  return {
    grossLines,
    netLines,
    ivaIncluded: grossLines - netLines,
    discount,
    discountLabel: discounts.join(" y "),
    freight,
    subtotal,
    total,
    base,
    retentionRate: Number(order?.retentionRate ?? 0) || 0,
    retentionAmount: round(order?.retentionAmount),
    payable,
    paid,
    balance: Math.max(0, payable - paid),
  };
}
