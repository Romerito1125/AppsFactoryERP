import { describe, expect, test } from "bun:test";

import { buildPurchaseOrderHtml } from "./purchase-order-print.js";

const breakdown = {
  grossLines: 200000,
  netLines: 168067,
  ivaIncluded: 31933,
  discount: 20000,
  discountLabel: "10 %",
  freight: 5000,
  total: 185000,
  base: 151260,
  retentionRate: 2.5,
  retentionAmount: 3782,
  payable: 181218,
  paid: 181218,
  balance: 0,
};

const doc = {
  title: "Orden de compra OC-1",
  number: "OC-1",
  status: "Recibida",
  provider: "QA Proveedor con retencion",
  nit: "NIT-1",
  warehouse: "QA Bodega Norte",
  date: "09/11/2026",
  invoiceRef: "FP-QA-0001",
  rateText: "2,5",
  breakdown,
  items: [{ code: "11", name: "QA Gaseosa IVA 19", quantity: 100, unitCost: 2000, total: 200000 }],
};

describe("buildPurchaseOrderHtml", () => {
  test("muestra el desglose completo con la base antes de IVA", () => {
    const html = buildPurchaseOrderHtml(doc);
    expect(html).toContain("Base imponible (antes de IVA)");
    expect(html).toContain("$ 151.260");
    expect(html).toContain("Descuento 10 %");
    expect(html).toContain("$ 185.000");
    expect(html).toContain("-$ 3.782");
    expect(html).toContain("$ 181.218");
    expect(html).toContain("IVA incluido en los renglones: $ 31.933");
  });

  test("usa el diseño de hoja de Ventas: encabezado de marca y tabla azul", () => {
    const html = buildPurchaseOrderHtml(doc);
    expect(html).toContain('class="sheet"');
    expect(html).toContain('class="brand">Mundo Tienda');
    expect(html).toContain("#2f6aa6");
    expect(html).toContain("@page { size: A4;");
  });

  test("omite descuento, flete y retención cuando no aplican", () => {
    const html = buildPurchaseOrderHtml({
      ...doc,
      breakdown: { ...breakdown, discount: 0, freight: 0, retentionAmount: 0, base: null },
    });
    expect(html).not.toContain("Descuento");
    expect(html).not.toContain("Flete");
    expect(html).not.toContain("Retención");
    expect(html).toContain("Base imponible (antes de IVA)</span><strong>—</strong>");
  });

  test("una orden anulada no muestra total a pagar ni retención", () => {
    const html = buildPurchaseOrderHtml({ ...doc, annulled: true, status: "Anulada" });
    expect(html).not.toContain("Total a pagar");
    expect(html).not.toContain("Retención");
    expect(html).toContain("Orden anulada");
  });

  test("escapa los textos del proveedor y de los productos", () => {
    const html = buildPurchaseOrderHtml({
      ...doc,
      provider: "<script>alert(1)</script>",
      items: [{ code: "1", name: 'Caja "A" & B', quantity: 1, unitCost: 1000, total: 1000 }],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Caja &quot;A&quot; &amp; B");
  });
});
