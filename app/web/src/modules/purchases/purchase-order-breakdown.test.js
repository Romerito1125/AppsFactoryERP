import { describe, expect, test } from "bun:test";

import { orderBreakdown, orderPayable } from "./purchase-order-breakdown.js";

// Caso de la guía: 100 × $ 2.000 con IVA 19 %, descuento 10 %, flete $ 5.000, retención 2,5 %.
const items = [{ quantity: 100, unitCost: 2000, product: { taxRate: 19 } }];
const order = {
  subtotal: 180000,
  total: 185000,
  freight: 5000,
  discount1Percent: 10,
  discount2Percent: 0,
  retentionBase: 151260,
  retentionRate: "2.50",
  retentionAmount: "3782.00",
  payableTotal: "181218.00",
};

describe("orderBreakdown", () => {
  test("desglosa renglones, descuento, flete y total de la compra de la guía", () => {
    const b = orderBreakdown(order, items);
    expect(b.grossLines).toBe(200000);
    expect(b.netLines).toBe(168067);
    expect(b.ivaIncluded).toBe(31933);
    expect(b.discount).toBe(20000);
    expect(b.discountLabel).toBe("10 %");
    expect(b.freight).toBe(5000);
    expect(b.total).toBe(185000);
  });

  test("la base imponible es antes de IVA y es la base guardada", () => {
    const b = orderBreakdown(order, items);
    expect(b.base).toBe(151260);
    expect(b.retentionRate).toBe(2.5);
    expect(b.retentionAmount).toBe(3782);
    expect(b.payable).toBe(181218);
    expect(b.balance).toBe(181218);
  });

  test("con pago parcial el saldo baja y el total a pagar no cambia", () => {
    const b = orderBreakdown({ ...order, paidTotal: 50000 }, items);
    expect(b.paid).toBe(50000);
    expect(b.balance).toBe(131218);
    expect(b.payable).toBe(181218);
  });

  test("compra anterior sin base guardada recalcula la base antes de IVA", () => {
    const b = orderBreakdown({ ...order, retentionBase: null }, items);
    expect(b.base).toBe(151260);
  });

  test("compra sin retención muestra la base y retención en cero", () => {
    const b = orderBreakdown({ ...order, retentionRate: 0, retentionAmount: 0, payableTotal: 185000 }, items);
    expect(b.retentionAmount).toBe(0);
    expect(b.payable).toBe(185000);
    expect(b.base).toBe(151260);
  });

  test("sin renglones no inventa descuento ni base", () => {
    const b = orderBreakdown({ subtotal: 0, total: 0, freight: 0, retentionBase: null }, []);
    expect(b.discount).toBe(0);
    expect(b.base).toBeNull();
  });
});

describe("orderPayable", () => {
  test("usa el total a pagar guardado y cae al total si no existe", () => {
    expect(orderPayable({ total: 185000, payableTotal: "181218.00" })).toBe(181218);
    expect(orderPayable({ total: 185000, payableTotal: 0 })).toBe(185000);
    expect(orderPayable({ total: 0, payableTotal: 0 })).toBe(0);
  });
});
