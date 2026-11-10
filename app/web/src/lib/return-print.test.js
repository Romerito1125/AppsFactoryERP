import { describe, expect, test } from "bun:test";

import { buildReturnNoteHtml } from "./return-print.js";

const note = {
  consecutive: "DV-0001",
  createdAt: "2026-11-09T15:00:00.000Z",
  reason: "Producto dañado",
  notes: "",
  invoice: { consecutive: "FAC-90736" },
  client: { firstName: "Abastos", lastName: "HYG", identification: "9179324-8" },
  items: [
    { quantity: 1, total: 44000, productId: 3, invoiceItem: { product: { name: "ARROZ SABROSON PACA" } } },
  ],
  total: 44000,
  creditApplied: 44000,
  refundedAmount: 0,
  advanceAmount: 0,
  createdByUsername: "isela",
};

describe("buildReturnNoteHtml", () => {
  test("muestra la nota crédito con cliente, factura de origen y líneas", () => {
    const html = buildReturnNoteHtml(note);
    expect(html).toContain("NOTA CRÉDITO · DEVOLUCIÓN");
    expect(html).toContain("DV-0001");
    expect(html).toContain("FAC-90736");
    expect(html).toContain("ARROZ SABROSON PACA");
    expect(html).toContain("Reduce la deuda de la factura");
    expect(html).toContain("$ 44.000");
  });

  test("separa dinero devuelto y saldo a favor cuando la factura era de contado", () => {
    const html = buildReturnNoteHtml({ ...note, creditApplied: 0, refundedAmount: 30000, advanceAmount: 14000 });
    expect(html).toContain("Dinero devuelto</span><strong>$ 30.000");
    expect(html).toContain("Saldo a favor del cliente</span><strong>$ 14.000");
  });

  test("escapa el motivo y el nombre del cliente", () => {
    const html = buildReturnNoteHtml({ ...note, reason: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
