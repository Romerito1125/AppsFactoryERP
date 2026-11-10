import { describe, expect, test } from "bun:test";

import {
  buildSalesLines,
  crossSalesLines,
  distinctValues,
  explorerRange,
  filterSalesLines,
  groupSalesLines,
} from "./sales-explorer-data.js";

const product = (id, name, brand, providerId, type = "Bebidas") => ({ id, name, brand, providerId, productType: { name: type } });
const centro = { id: 1, firstName: "Ana", lastName: "Ruiz", neighborhood: "Centro", clientType: "MINORISTA" };
const norte = { id: 2, firstName: "Luis", lastName: "Paz", neighborhood: "Norte", clientType: "MAYORISTA" };
const gaseosa = product(10, "Gaseosa", "Postobón", 7);
const arroz = product(11, "Arroz", "Diana", 8, "Granos");

const invoices = [
  {
    id: 1, consecutive: "F1", createdAt: "2026-11-02T15:00:00Z", status: "ACTIVA", source: "POS", saleMode: "CONTADO",
    client: centro, clientId: 1, createdByUser: { username: "caja1" },
    items: [
      { productId: 10, product: gaseosa, quantity: 4, total: 16000, unitCost: 2000, warehouse: { location: "Norte" } },
      { productId: 11, product: arroz, quantity: 1, total: 5000, unitCost: 4000, warehouse: { location: "Norte" } },
    ],
  },
  {
    id: 2, consecutive: "F2", createdAt: "2026-11-05T15:00:00Z", status: "ACTIVA", source: "ADMIN", saleMode: "CREDITO",
    client: norte, clientId: 2, createdByUser: { username: "caja2" },
    items: [{ productId: 10, product: gaseosa, quantity: 10, total: 40000, unitCost: 2000, warehouse: { location: "Sur" } }],
  },
  {
    id: 3, consecutive: "F3", createdAt: "2026-11-06T15:00:00Z", status: "ANULADA", source: "POS", saleMode: "CONTADO",
    client: centro, clientId: 1, createdByUser: { username: "caja1" },
    items: [{ productId: 11, product: arroz, quantity: 2, total: 10000, unitCost: 4000, warehouse: { location: "Norte" } }],
  },
];
const providersById = new Map([[7, "Postobón S.A."], [8, "Arroz Diana S.A.S."]]);
const lines = buildSalesLines(invoices, { providersById });
const range = { start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-11-30T23:59:59Z") };
const active = filterSalesLines(lines, { status: "ACTIVA" }, range);

describe("buildSalesLines", () => {
  test("una línea por producto con barrio, marca, empresa y tipo de cliente", () => {
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ neighborhood: "Centro", brand: "Postobón", provider: "Postobón S.A.", clientType: "Minorista", source: "POS", saleMode: "Contado", seller: "caja1", warehouse: "Norte" });
    expect(lines[0].profit).toBe(8000);
  });
});

describe("filterSalesLines", () => {
  test("filtra por cualquier combinación: barrio + marca", () => {
    const rows = filterSalesLines(lines, { status: "ACTIVA", neighborhood: "Centro", brand: "Postobón" }, range);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(16000);
  });

  test("excluye anuladas por defecto y respeta el rango", () => {
    expect(active).toHaveLength(3);
    expect(filterSalesLines(lines, { status: "ALL" }, { start: new Date("2026-11-04T00:00:00Z"), end: range.end })).toHaveLength(2);
  });

  test("busca por texto en producto, empresa o barrio", () => {
    expect(filterSalesLines(lines, { status: "ACTIVA", query: "diana" }, range)).toHaveLength(1);
  });
});

describe("groupSalesLines", () => {
  test("marcas más vendidas con frecuencia de facturas", () => {
    const brands = groupSalesLines(active, "brand", range);
    expect(brands[0]).toMatchObject({ key: "Postobón", sales: 56000, units: 14, invoices: 2, clients: 2 });
    expect(brands[1]).toMatchObject({ key: "Diana", sales: 5000, invoices: 1 });
    expect(Math.round(brands[0].share)).toBe(92);
    expect(brands[0].everyDays).toBeGreaterThan(0);
  });
});

describe("crossSalesLines", () => {
  test("cruza barrio con marca para correlacionar", () => {
    const cross = crossSalesLines(active, "neighborhood", "brand", "sales");
    expect(cross.columns).toEqual(["Postobón", "Diana"]);
    const centroRow = cross.rows.find((row) => row.key === "Centro");
    expect(centroRow.values).toEqual({ "Postobón": 16000, Diana: 5000 });
    expect(cross.rows[0].key).toBe("Norte");
  });

  test("agrupa columnas sobrantes en «Otros» y cuenta facturas distintas", () => {
    const cross = crossSalesLines(active, "neighborhood", "brand", "invoices", 1);
    expect(cross.columns).toEqual(["Postobón", "Otros"]);
    expect(cross.rows.find((row) => row.key === "Centro")).toMatchObject({ values: { "Postobón": 1, Otros: 1 }, total: 1 });
  });
});

describe("helpers", () => {
  test("valores distintos ordenados y rango personalizado", () => {
    expect(distinctValues(lines, "neighborhood")).toEqual(["Centro", "Norte"]);
    const custom = explorerRange({ period: "CUSTOM", from: "2026-11-01", to: "2026-11-05" });
    expect(custom.label).toBe("2026-11-01 · 2026-11-05");
  });
});
