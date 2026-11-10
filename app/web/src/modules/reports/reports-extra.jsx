import { useEffect, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { downloadCsv, downloadPdf } from "@/lib/simple-pdf";
import { formatCop } from "@/lib/cop";

const signed = (value) => (Number(value) < 0 ? `-${formatCop(Math.abs(value))}` : `${formatCop(value)}`);
const day = (value) => (value ? new Date(value).toLocaleDateString("es-CO") : "-");
// Día local (no UTC): en Colombia después de las 7 p. m. el día UTC ya cambió.
const dayKey = (value) => (value ? new Date(value).toLocaleDateString("en-CA") : "");
const clientName = (client) =>
  client ? `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || client.identification : "Sin cliente";

function Table({ headers, rows, footer }) {
  const grid = { gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` };
  return (
    <section className="p1-card p1-report-table-card">
      <div className="p1-simple-table">
        <div className="p1-simple-head" style={grid}>{headers.map((h) => <span key={h}>{h}</span>)}</div>
        {rows.length ? (
          rows.slice(0, 400).map((row, index) => (
            <div className="p1-simple-row" style={grid} key={index}>
              {row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}
            </div>
          ))
        ) : (
          <div className="p1-state">No hay datos para estos filtros.</div>
        )}
        {footer && (
          <div className="p1-simple-row" style={{ ...grid, fontWeight: 700 }}>
            {footer.map((cell, index) => <span key={index}>{cell}</span>)}
          </div>
        )}
      </div>
    </section>
  );
}

function Actions({ onCsv, onPdf }) {
  return (
    <div className="p1-heading-actions" style={{ margin: "6px 0" }}>
      <button type="button" className="p1-secondary-button" onClick={onCsv}><Download size={14} /> CSV</button>
      <button type="button" className="p1-secondary-button" onClick={onPdf}><Printer size={14} /> PDF</button>
    </div>
  );
}

/** #77 · Reporte de retenciones de compras: base, tasa, importe y neto por documento. */
export function RetentionsReport({ purchases, inPeriod }) {
  const rows = useMemo(
    () =>
      purchases
        .filter((order) => inPeriod(order.createdAt) && Number(order.retentionAmount ?? 0) > 0)
        .map((order) => ({
          fecha: day(order.invoiceDate ?? order.createdAt),
          documento: order.consecutive,
          proveedor: order.provider?.name ?? "-",
          nit: order.provider?.taxId ?? order.provider?.nit ?? "-",
          base: Number(order.retentionBase ?? order.subtotal ?? 0),
          tasa: Number(order.retentionRate ?? 0),
          retencion: Number(order.retentionAmount ?? 0),
          neto: Number(order.payableTotal ?? 0),
          corregida: order.retentionBaseReason ? `Sí · ${order.retentionBaseReason}` : "No",
        })),
    [purchases, inPeriod],
  );
  const totalRetention = rows.reduce((sum, row) => sum + row.retencion, 0);
  const headers = ["Fecha", "Documento", "Proveedor", "NIT", "Base", "Tasa %", "Retención", "Neto a pagar", "Base corregida"];
  const body = rows.map((r) => [r.fecha, r.documento, r.proveedor, r.nit, `${formatCop(r.base)}`, formatCop(r.tasa), `${formatCop(r.retencion)}`, `${formatCop(r.neto)}`, r.corregida]);
  return (
    <>
      <Actions
        onCsv={() => downloadCsv("retenciones-compras", headers, rows.map((r) => [r.fecha, r.documento, r.proveedor, r.nit, r.base, r.tasa, r.retencion, r.neto, r.corregida]))}
        onPdf={() => downloadPdf("retenciones-compras", ["MUNDO TIENDA - Retenciones de compras", "", ...rows.map((r) => `${r.fecha} | ${r.documento} | ${r.proveedor} | base ${formatCop(r.base)} | ${formatCop(r.tasa)}% | ret ${formatCop(r.retencion)}`), "", `Total retenido: ${formatCop(totalRetention)}`])}
      />
      <Table headers={headers} rows={body} footer={["", "", "TOTAL RETENIDO", "", "", "", `${formatCop(totalRetention)}`, "", ""]} />
    </>
  );
}

const GROUPINGS = [
  ["barrio", "Barrio"],
  ["marca", "Marca"],
  ["proveedor", "Proveedor"],
  ["vendedor", "Vendedor"],
  ["bodega", "Bodega"],
  ["origen", "Origen"],
  ["cliente", "Cliente (frecuencia)"],
];

/** #55 · Ventas cruzadas con filtros y devoluciones restadas. */
export function CrossSalesReport({ invoices, inPeriod, warehouses }) {
  const [returns, setReturns] = useState([]);
  const [groupBy, setGroupBy] = useState("barrio");
  const [filters, setFilters] = useState({ barrio: "", marca: "", vendedor: "", bodega: "", origen: "" });

  useEffect(() => {
    apiClient.getAllPages("/devoluciones").then(setReturns).catch(() => setReturns([]));
  }, []);

  const returnsByInvoice = useMemo(() => {
    const map = new Map();
    returns.forEach((row) => map.set(row.invoiceId, (map.get(row.invoiceId) ?? 0) + Number(row.total ?? 0)));
    return map;
  }, [returns]);

  const lines = useMemo(
    () =>
      invoices
        .filter((invoice) => inPeriod(invoice.createdAt) && invoice.status !== "ANULADA")
        .flatMap((invoice) => {
          const returned = returnsByInvoice.get(invoice.id) ?? 0;
          const invoiceTotal = Number(invoice.total ?? 0) || 1;
          return (invoice.items ?? []).map((item) => ({
            invoiceId: invoice.id,
            barrio: invoice.client?.neighborhood || "Sin barrio",
            marca: item.product?.brand || "Sin marca",
            proveedor: item.product?.primaryProvider?.name ?? (item.product?.providerId ? `Proveedor #${item.product.providerId}` : "Sin proveedor"),
            vendedor: invoice.sellerUsername ?? invoice.createdByUser?.username ?? "-",
            bodega: item.warehouse?.location ?? invoice.warehouse?.location ?? "-",
            origen: invoice.source ?? "-",
            cliente: clientName(invoice.client),
            total: Number(item.total ?? 0),
            // Las devoluciones se reparten proporcionalmente al peso del renglón en la factura.
            devuelto: returned * (Number(item.total ?? 0) / invoiceTotal),
            unidades: Number(item.quantity ?? 0),
          }));
        })
        .filter((line) => Object.entries(filters).every(([key, value]) => !value || line[key].toLowerCase().includes(value.toLowerCase()))),
    [invoices, inPeriod, returnsByInvoice, filters],
  );

  const grouped = useMemo(() => {
    const map = new Map();
    lines.forEach((line) => {
      const key = line[groupBy];
      const row = map.get(key) ?? { key, unidades: 0, venta: 0, devuelto: 0, facturas: new Set() };
      row.unidades += line.unidades;
      row.venta += line.total;
      row.devuelto += line.devuelto;
      row.facturas.add(line.invoiceId);
      map.set(key, row);
    });
    return [...map.values()].sort((a, b) => b.venta - a.venta);
  }, [lines, groupBy]);

  const headers = [GROUPINGS.find(([v]) => v === groupBy)?.[1] ?? "Grupo", "Facturas", "Unidades", "Venta", "Devoluciones", "Neto"];
  const rows = grouped.map((r) => [r.key, r.facturas.size, r.unidades, r.venta, r.devuelto, r.venta - r.devuelto]);
  const totalNet = rows.reduce((sum, r) => sum + r[5], 0);

  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  return (
    <>
      <div className="p1-heading-actions" style={{ margin: "6px 0", flexWrap: "wrap" }}>
        <label>Agrupar por <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>{GROUPINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <input placeholder="Barrio" value={filters.barrio} onChange={set("barrio")} />
        <input placeholder="Marca" value={filters.marca} onChange={set("marca")} />
        <input placeholder="Vendedor" value={filters.vendedor} onChange={set("vendedor")} />
        <select value={filters.bodega} onChange={set("bodega")} aria-label="Bodega">
          <option value="">Todas las bodegas</option>
          {(warehouses ?? []).map((w) => <option key={w.id} value={w.location}>{w.location}</option>)}
        </select>
        <select value={filters.origen} onChange={set("origen")} aria-label="Origen">
          <option value="">Todos los orígenes</option>
          {["POS", "ADMIN", "WEB", "MOVIL", "DOMICILIO"].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <Actions
          onCsv={() => downloadCsv("ventas-cruzadas", headers, rows)}
          onPdf={() => downloadPdf("ventas-cruzadas", ["MUNDO TIENDA - Ventas cruzadas por " + headers[0], "", ...rows.map((r) => `${r[0]} | fact ${r[1]} | und ${r[2]} | venta ${formatCop(r[3])} | dev ${formatCop(r[4])} | neto ${formatCop(r[5])}`), "", `Neto total: ${formatCop(totalNet)}`])}
        />
      </div>
      <Table
        headers={headers}
        rows={rows.map((r) => [r[0], r[1], r[2], `${formatCop(r[3])}`, `${formatCop(r[4])}`, `${formatCop(r[5])}`])}
        footer={["TOTAL", "", "", "", "", `${formatCop(totalNet)}`]}
      />
    </>
  );
}

/** #38 · Cierre del día: lo que suma y lo que no suma en caja. */
export function DayCloseReport() {
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [data, setData] = useState({ loading: true, invoices: [], advances: [], returns: [], movements: [], notes: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      apiClient.getAllPages("/facturas"),
      apiClient.getAllPages("/anticipos"),
      apiClient.getAllPages("/devoluciones"),
      apiClient.getAllPages("/movimientos-bancarios"),
      apiClient.getAllPages("/notas"),
    ]).then((results) => {
      if (cancelled) return;
      const [invoices, advances, returns, movements, notes] = results.map((r) => (r.status === "fulfilled" ? r.value : []));
      setData({ loading: false, invoices, advances, returns, movements, notes });
    });
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => {
    const same = (value) => dayKey(value) === date;
    const invoices = data.invoices.filter((i) => same(i.createdAt) && i.status !== "ANULADA");
    const creditSales = invoices.filter((i) => i.credit != null);
    const advancesApplied = data.advances.filter((a) => same(a.updatedAt) && Number(a.appliedAmount ?? 0) > 0);
    const availableAdvances = data.advances.filter((a) => a.status === "DISPONIBLE" && Number(a.balance ?? 0) > 0);
    const notes = data.notes.filter((note) => same(note.issuedAt) && note.status !== "ANULADO");
    const mv = data.movements.filter((m) => same(m.createdAt ?? m.movementDate));
    const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    const desc = (m) => m.description ?? "";
    const isGmf = (m) => /^GMF/i.test(desc(m));
    const income = mv.filter((m) => m.movementType === "INGRESO");
    const expense = mv.filter((m) => m.movementType === "EGRESO");
    const salesIn = income.filter((m) => /^Recaudo venta/i.test(desc(m)));
    const collections = income.filter((m) => /^Cobro/i.test(desc(m)));
    const advancesIn = income.filter((m) => /^Anticipo/i.test(desc(m)));
    const otherIn = income.filter((m) => !salesIn.includes(m) && !collections.includes(m) && !advancesIn.includes(m));
    const returns = expense.filter((m) => /^Devoluci/i.test(desc(m)));
    const supplier = expense.filter((m) => /^Pago compra/i.test(desc(m)) && !isGmf(m));
    const supplierAdvances = expense.filter((m) => /^Anticipo proveedor/i.test(desc(m)));
    const gmf = expense.filter(isGmf);
    const voids = expense.filter((m) => /^Anulaci/i.test(desc(m)));
    const otherOut = expense.filter((m) => ![...returns, ...supplier, ...supplierAdvances, ...gmf, ...voids].includes(m));
    const neg = (rows) => 0 - sum(rows, "amount");
    const receivableNotes = notes.filter((note) => note.side === "COBRAR");
    const payableNotes = notes.filter((note) => note.side === "PAGAR");
    const noteImpact = (rows, side) => rows.reduce((total, note) => {
      const amount = Number(note.amount ?? 0);
      const sign = side === "PAGAR" ? -1 : 1;
      if (note.kind === "DEBITO") return total + amount * sign;
      if (note.kind === "CREDITO") return total - amount * sign;
      return total;
    }, 0);
    return [
      ["Ventas cobradas (recaudo)", salesIn.length, sum(salesIn, "amount"), "SUMA"],
      ["Cobros de cartera", collections.length, sum(collections, "amount"), "SUMA"],
      ["Anticipos recibidos", advancesIn.length, sum(advancesIn, "amount"), "SUMA"],
      ["Otros ingresos", otherIn.length, sum(otherIn, "amount"), "SUMA"],
      ["Devoluciones", returns.length, neg(returns), "RESTA"],
      ["Pagos a proveedores", supplier.length, neg(supplier), "RESTA"],
      ["Anticipos a proveedores", supplierAdvances.length, neg(supplierAdvances), "RESTA"],
      ["4x1000 (GMF)", gmf.length, neg(gmf), "RESTA"],
      ["Anulaciones de recibos", voids.length, neg(voids), "RESTA"],
      ["Otros egresos", otherOut.length, neg(otherOut), "RESTA"],
      ["Ventas a crédito (no entra dinero)", creditSales.length, sum(creditSales, "total"), "NO SUMA"],
      ["Anticipos aplicados a ventas", advancesApplied.length, sum(advancesApplied, "appliedAmount"), "NO SUMA"],
      ["Ajustes de cartera (notas débito/crédito)", receivableNotes.length, noteImpact(receivableNotes, "COBRAR"), "NO SUMA"],
      ["Ajustes de proveedores (notas débito/crédito)", payableNotes.length, noteImpact(payableNotes, "PAGAR"), "NO SUMA"],
      ["Saldo a favor disponible al cierre", availableAdvances.length, sum(availableAdvances, "balance"), "NO SUMA"],
      ["Transferencias entre cuentas", mv.filter((m) => /TRANSFERENCIA/.test(m.movementType)).length, 0, "NO SUMA"],
    ];
  }, [data, date]);

  const cashEffect = summary.filter((r) => r[3] !== "NO SUMA").reduce((sum, r) => sum + r[2], 0);
  const headers = ["Concepto", "Documentos", "Valor", "Efecto en caja"];
  const rows = summary.map((r) => [r[0], r[1], r[2], r[3]]);
  return (
    <>
      <div className="p1-heading-actions" style={{ margin: "6px 0" }}>
        <label>Día <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <Actions
          onCsv={() => downloadCsv(`cierre-${date}`, headers, rows)}
          onPdf={() => downloadPdf(`cierre-${date}`, [`MUNDO TIENDA - Cierre del dia ${date}`, "", ...rows.map((r) => `${r[0]} | docs ${r[1]} | ${formatCop(r[2])} | ${r[3]}`), "", `Movimiento neto de caja: ${formatCop(cashEffect)}`])}
        />
      </div>
      {data.loading ? (
        <div className="p1-state">Preparando cierre…</div>
      ) : (
        <Table
          headers={headers}
          rows={rows.map((r) => [r[0], r[1], signed(r[2]), r[3]])}
          footer={["MOVIMIENTO NETO DE CAJA", "", signed(cashEffect), ""]}
        />
      )}
    </>
  );
}
