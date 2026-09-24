import { useEffect, useMemo, useState } from "react";
import { BarChart3, CircleX, Download, LoaderCircle, Mail, Printer, RefreshCw, X } from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";
import "./reports-window.css";

const tabs = [
  ["resumen", "Resumen"], ["facturas", "Facturación"], ["inventario", "Inventario"],
  ["iva", "IVA"], ["exogena", "Exógena"], ["compras", "Compras"], ["clientes", "Clientes"],
  ["productos", "Top productos"], ["traslados", "Traslados"],
];

export function ReportsWindow({ onClose, onRequestLogin, session }) {
  const [tab, setTab] = useState("resumen");
  const [period, setPeriod] = useState("SEMANA_DOMINGO");
  const [state, setState] = useState({ loading: true, error: "", invoices: [], purchases: [], clients: [], products: [], inventory: [], movements: [], transfers: [], accounts: [] });
  const [notice, setNotice] = useState("");
  const [manualSignals, setManualSignals] = useState(() => readManualSignals());
  const { handlePointerDown, isDragging, style: windowStyle } = useDraggableWindow();

  async function loadData() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const results = await Promise.allSettled([
        apiClient.getAllPages("/facturas"), apiClient.getAllPages("/compras"), apiClient.getAllPages("/clientes", { estado: "activos" }),
        apiClient.getAllPages("/productos", { estado: "activos" }), apiClient.getAllPages("/inventario"), apiClient.getAllPages("/inventario/movimientos"),
        apiClient.getAllPages("/inventario/traslados/tickets"), apiClient.getAllPages("/cuentas-bancarias", { estado: "activos" }),
      ]);
      const [invoices, purchases, clients, products, rawInventory, movements, transfers, accounts] = results.map((result) => result.status === "fulfilled" ? result.value : []);
      const inventory = normalizeInventoryRows(rawInventory);
      const failed = results.find((result) => result.status === "rejected");
      if (failed && !invoices.length && !purchases.length) throw failed.reason;
      setState({ loading: false, error: failed ? "Algunos bloques no están disponibles con este perfil." : "", invoices, purchases, clients, products, inventory, movements, transfers, accounts });
    } catch (requestError) {
      setState((current) => ({ ...current, loading: false, error: requestError.message ?? "No se pudieron cargar los reportes." }));
      if (/sesión|inicia sesión|401/i.test(requestError.message ?? "")) onRequestLogin?.();
    }
  }

  useEffect(() => { void loadData(); }, []);

  const filteredInvoices = useMemo(() => state.invoices.filter((invoice) => inPeriod(invoice.createdAt, period)), [period, state.invoices]);
  const filteredPurchases = useMemo(() => state.purchases.filter((purchase) => inPeriod(purchase.createdAt, period)), [period, state.purchases]);
  const totals = useMemo(() => ({
    invoices: filteredInvoices.length,
    sales: sum(filteredInvoices, "total"),
    iva: filteredInvoices.reduce((total, invoice) => total + Number(invoice.taxAmount ?? invoice.tax ?? 0), 0),
    purchases: sum(filteredPurchases, "total"),
    critical: state.inventory.filter((row) => Number(row.quantity ?? 0) <= Number(row.product?.minimumStock ?? 0)).length,
  }), [filteredInvoices, filteredPurchases, state.inventory]);
  const topProducts = useMemo(() => {
    const rows = new Map();
    filteredInvoices.flatMap((invoice) => invoice.items ?? []).forEach((item) => {
      const current = rows.get(item.productId) ?? { name: item.product?.name ?? `Producto #${item.productId}`, quantity: 0, total: 0 };
      current.quantity += Number(item.quantity ?? 0); current.total += Number(item.total ?? 0); rows.set(item.productId, current);
    });
    return [...rows.values()].sort((a, b) => b.quantity - a.quantity);
  }, [filteredInvoices]);

  function exportCsv() {
    const rows = tab === "facturas" ? filteredInvoices.map((row) => ({ fecha: row.createdAt, factura: row.consecutive, origen: row.source, total: row.total })) : tab === "compras" ? filteredPurchases.map((row) => ({ fecha: row.createdAt, compra: row.consecutive, estado: row.status, total: row.total })) : tab === "productos" ? topProducts : state.inventory.map((row) => ({ producto: row.product?.name, existencia: row.quantity, minimo: row.product?.minimumStock, estado: manualSignals[row.productId] ?? semaphore(row) }));
    if (!rows.length) return setNotice("No hay datos para exportar.");
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    downloadBlob(csv, `reporte-${tab}.csv`, "text/csv;charset=utf-8");
    setNotice("CSV descargado.");
  }

  function exportPdf() {
    const lines = buildReportPdfLines({ tab, period, state, filteredInvoices, filteredPurchases, topProducts, manualSignals, totals });
    const pdf = createSimplePdf(lines);
    downloadBlob(pdf, `reporte-${tab}.pdf`, "application/pdf");
    setNotice("PDF descargado.");
  }

  async function sendEmail() {
    const recipient = window.prompt("Correo que recibirá el reporte semanal:", session?.username?.includes("@") ? session.username : "");
    if (!recipient) return;
    try {
      await apiClient.post("/reportes/email", {
        to: [recipient.trim()], subject: `Reporte ${periodLabel(period)} · Mundo Tienda`, startDate: reportStart(period).toISOString(), endDate: new Date().toISOString(), generatedAt: new Date().toISOString(), generatedBy: session?.username ?? session?.user?.username,
        sections: ["RESUMEN", "FACTURAS", "IVA", "EXOGENAS", "STOCK", "TRASLADOS", "PRODUCTOS"],
        summaryCards: [{ label: "Ventas", value: `$${money(totals.sales)}` }, { label: "Facturas", value: totals.invoices }, { label: "Stock crítico", value: totals.critical }],
        highlights: [{ label: "Periodo", value: periodLabel(period) }],
        invoiceRows: filteredInvoices.map((row) => ({ fecha: date(row.createdAt), factura: row.consecutive, origen: row.source, total: money(row.total) })),
        ivaRows: filteredInvoices.map((row) => ({ factura: row.consecutive, iva: money(row.taxAmount ?? row.tax) })),
        exogenousRows: filteredInvoices.map((row) => ({ factura: row.consecutive, cliente: row.client?.identification ?? "—", total: money(row.total) })),
        lowStockRows: state.inventory.filter((row) => semaphore(row) === "Rojo").map((row) => ({ producto: row.product?.name, existencia: row.quantity })),
        transferRows: state.transfers.map((row) => ({ ticket: row.ticketNumber ?? row.id, fecha: date(row.createdAt) })),
        topProductRows: topProducts.slice(0, 10).map((row) => ({ producto: row.name, unidades: row.quantity, total: money(row.total) })),
      });
      setNotice("Reporte enviado por correo.");
    } catch (requestError) { setNotice(requestError.message ?? "No se pudo enviar el reporte por correo."); }
  }

  function toggleManualSignal(productId) {
    const cycle = ["Rojo", "Verde", "Amarillo"];
    const next = cycle[(cycle.indexOf(manualSignals[productId]) + 1) % cycle.length];
    const updated = { ...manualSignals, [productId]: next };
    setManualSignals(updated);
    try { localStorage.setItem("mmm-manual-report-signals", JSON.stringify(updated)); } catch { /* continúa en memoria */ }
  }

  return <section className={`provider-window p1-window reports-window ${isDragging ? "is-dragging" : ""}`} style={windowStyle} aria-label="Biblioteca de reportes">
    <header className="provider-titlebar drag-handle p1-titlebar" onPointerDown={handlePointerDown}><div className="provider-title-mark"><BarChart3 size={14} /></div><strong>BIBLIOTECA DE REPORTES</strong><button type="button" className="provider-close" onClick={onClose} aria-label="Cerrar reportes"><X size={17} /></button></header>
    <div className="p1-heading"><div><span>REPORTES · CONTROL OPERATIVO</span><h2>Reportes por bloque y periodo</h2><p>Consulta, filtra, exporta y comparte la información que necesita el negocio.</p></div><div className="p1-heading-actions"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Periodo"><option value="DIARIO">Hoy</option><option value="TRES_DIAS">Últimos 3 días</option><option value="SEMANA_DOMINGO">Semana con cierre dominical</option></select><button type="button" className="p1-secondary-button" onClick={() => void loadData()} disabled={state.loading}><RefreshCw size={14} className={state.loading ? "is-spinning" : ""} /> Actualizar</button><button type="button" className="p1-secondary-button" onClick={exportPdf}><Printer size={14} /> Exportar PDF</button><button type="button" className="p1-secondary-button" onClick={() => window.print()}><Printer size={14} /> Imprimir</button><button type="button" className="p1-secondary-button" onClick={exportCsv}><Download size={14} /> CSV</button><button type="button" className="p1-secondary-button" onClick={() => void sendEmail()}><Mail size={14} /> Enviar correo</button></div></div>
    {(state.error || notice) && <TransientMessage className={state.error ? "window-error" : "p1-success"} role={state.error ? "alert" : "status"} onDismiss={() => { setNotice(""); setState((current) => ({ ...current, error: "" })); }}>{state.error || notice}</TransientMessage>}
    <nav className="p1-tabs" aria-label="Bloques de reportes">{tabs.map(([value, label]) => <button key={value} type="button" className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {state.loading ? <div className="p1-state p1-page-state"><LoaderCircle size={24} className="is-spinning" /> Preparando reportes…</div> : <ReportBody tab={tab} state={state} totals={totals} topProducts={topProducts} period={period} manualSignals={manualSignals} onManualSignal={toggleManualSignal} />}
    <footer className="provider-window-footer"><span>Periodo: {periodLabel(period)} · Usuario: {session?.username ?? session?.user?.username ?? "—"}</span><button type="button" className="exit-action" onClick={onClose}><CircleX size={14} /> Salir</button></footer>
  </section>;
}

function ReportBody({ tab, state, totals, topProducts, period, manualSignals, onManualSignal }) {
  if (tab === "resumen") return <div className="p1-report-grid"><ReportKpi label="Ventas" value={`$${money(totals.sales)}`} /><ReportKpi label="Facturas" value={totals.invoices} /><ReportKpi label="IVA" value={`$${money(totals.iva)}`} /><ReportKpi label="Compras" value={`$${money(totals.purchases)}`} /><ReportKpi label="Stock crítico" value={totals.critical} /><section className="p1-card p1-report-wide"><div className="p1-card-title"><div><strong>Biblioteca incluida</strong><span>Facturación, inventario, IVA, compras, clientes, top de productos y traslados.</span></div></div><div className="p1-report-highlights"><span>• Facturas filtrables por origen</span><span>• Stock crítico y semáforo</span><span>• Movimientos diarios / cada 3 días</span><span>• Exportación PDF y CSV</span></div></section></div>;
  if (tab === "facturas") return <DataTable headers={["Fecha", "Factura", "Origen", "Cliente", "Total"]} rows={state.invoices.filter((row) => inPeriod(row.createdAt, period)).map((row) => [date(row.createdAt), row.consecutive, row.source, row.client ? `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}` : "—", `$${money(row.total)}`])} />;
  if (tab === "compras") return <DataTable headers={["Fecha", "Orden", "Estado", "Bodega", "Total"]} rows={state.purchases.filter((row) => inPeriod(row.createdAt, period)).map((row) => [date(row.createdAt), row.consecutive, row.status, row.warehouse?.location ?? "—", `$${money(row.total)}`])} />;
  if (tab === "clientes") return <DataTable headers={["Identificación", "Cliente", "Tipo", "Estado"]} rows={state.clients.map((row) => [row.identification, `${row.firstName ?? ""} ${row.lastName ?? ""}`, row.clientType ?? row.type ?? "—", row.isActive ? "Activo" : "Inactivo"]) } />;
  if (tab === "productos") return <DataTable headers={["Producto", "Unidades vendidas", "Total"]} rows={topProducts.map((row) => [row.name, row.quantity, `$${money(row.total)}`])} />;
  if (tab === "traslados") return <DataTable headers={["Fecha", "Ticket", "Estado", "Origen", "Destino"]} rows={state.transfers.map((row) => [date(row.createdAt), row.ticketNumber ?? row.id, row.status ?? "Registrado", row.fromWarehouse?.location ?? row.sourceWarehouse?.location ?? "—", row.toWarehouse?.location ?? row.destinationWarehouse?.location ?? "—"]) } />;
  if (tab === "iva") return <DataTable headers={["Fecha", "Factura", "Base", "IVA", "Total"]} rows={state.invoices.filter((row) => inPeriod(row.createdAt, period)).map((row) => [date(row.createdAt), row.consecutive, `$${money(row.subtotal)}`, `$${money(row.taxAmount ?? row.tax)}`, `$${money(row.total)}`])} />;
  if (tab === "exogena") return <DataTable headers={["Factura", "Identificación", "Origen", "Total"]} rows={state.invoices.filter((row) => inPeriod(row.createdAt, period)).map((row) => [row.consecutive, row.client?.identification ?? "—", row.source, `$${money(row.total)}`])} />;
  return <section className="p1-card p1-report-table-card"><div className="p1-card-title"><div><strong>Existencias y semáforo manual</strong><span>Haz clic en el estado para marcarlo y conservarlo en los reportes de esta estación.</span></div></div><div className="p1-simple-table"><div className="p1-simple-head"><span>Producto</span><span>Existencia</span><span>Mínimo</span><span>Estado</span></div>{state.inventory.length ? state.inventory.map((row) => { const signal = manualSignals[row.productId] ?? semaphore(row); return <div className="p1-simple-row" key={`${row.productId}-${row.warehouseId}`}><span>{row.product?.name ?? `Producto #${row.productId}`}</span><span>{row.quantity}</span><span>{row.product?.minimumStock ?? 0}</span><span><button type="button" className={`p1-signal-button ${signal.toLowerCase()}`} onClick={() => onManualSignal(row.productId)}>{signal}</button></span></div>; }) : <div className="p1-state">No hay existencias para este periodo.</div>}</div></section>;
}

function ReportKpi({ label, value }) { return <article className="p1-kpi blue"><span>{label}</span><strong>{value}</strong></article>; }
function DataTable({ headers, rows }) { return <section className="p1-card p1-report-table-card"><div className="p1-simple-table"><div className="p1-simple-head">{headers.map((header) => <span key={header}>{header}</span>)}</div>{rows.length ? rows.slice(0, 250).map((row, index) => <div className="p1-simple-row" key={index}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>) : <div className="p1-state">No hay datos para este periodo.</div>}</div></section>; }
function inPeriod(value, period) { const dateValue = value ? new Date(value) : new Date(); const now = new Date(); const start = reportStart(period); return dateValue >= start && dateValue <= now; }
function reportStart(period) { const start = new Date(); start.setHours(0, 0, 0, 0); if (period === "TRES_DIAS") start.setDate(start.getDate() - 2); if (period === "SEMANA_DOMINGO") start.setDate(start.getDate() - start.getDay()); return start; }
function periodLabel(period) { return { DIARIO: "hoy", TRES_DIAS: "ultimos 3 dias", SEMANA_DOMINGO: "semana domingo-hoy" }[period] ?? period; }
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0); }
function money(value) { return Number(value ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function date(value) { return value ? new Date(value).toLocaleDateString("es-CO") : "-"; }
function semaphore(row) { const quantity = Number(row.quantity ?? 0); const minimum = Number(row.product?.minimumStock ?? 0); const maximum = Number(row.product?.maximumStock ?? 0); if (quantity <= minimum) return "Rojo"; if (maximum && quantity >= maximum) return "Amarillo"; return "Verde"; }
function readManualSignals() { try { return JSON.parse(localStorage.getItem("mmm-manual-report-signals") ?? "{}"); } catch { return {}; } }
function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildReportPdfLines({ tab, period, state, filteredInvoices, filteredPurchases, topProducts, manualSignals, totals }) {
  const lines = [
    "MUNDO TIENDA ERP",
    `Reporte ${tab} - ${periodLabel(period)}`,
    `Generado: ${new Date().toLocaleString("es-CO")}`,
    "",
  ];
  if (tab === "resumen") {
    lines.push(`Ventas: $${money(totals.sales)}`, `Facturas: ${totals.invoices}`, `IVA: $${money(totals.iva)}`, `Compras: $${money(totals.purchases)}`, `Stock critico: ${totals.critical}`);
  } else if (tab === "facturas") {
    lines.push("Fecha | Factura | Origen | Total");
    filteredInvoices.slice(0, 45).forEach((row) => lines.push(`${date(row.createdAt)} | ${row.consecutive} | ${row.source} | $${money(row.total)}`));
  } else if (tab === "compras") {
    lines.push("Fecha | Orden | Estado | Bodega | Total");
    filteredPurchases.slice(0, 45).forEach((row) => lines.push(`${date(row.createdAt)} | ${row.consecutive} | ${row.status} | ${row.warehouse?.location ?? "-"} | $${money(row.total)}`));
  } else if (tab === "productos") {
    lines.push("Producto | Unidades | Total");
    topProducts.slice(0, 45).forEach((row) => lines.push(`${row.name} | ${row.quantity} | $${money(row.total)}`));
  } else {
    lines.push("Producto | Existencia | Minimo | Estado");
    state.inventory.slice(0, 45).forEach((row) => lines.push(`${row.product?.name ?? `Producto #${row.productId}`} | ${row.quantity} | ${row.product?.minimumStock ?? 0} | ${manualSignals[row.productId] ?? semaphore(row)}`));
  }
  if (lines.length > 49) lines.push("... mostrando las primeras 45 filas");
  return lines;
}

function createSimplePdf(lines) {
  const content = ["BT", "/F1 10 Tf", "50 790 Td", ...lines.flatMap((line, index) => [index ? "0 -15 Td" : "", `(${escapePdfText(line)}) Tj`]), "ET"].filter(Boolean).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = pdf.length; pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function escapePdfText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?").replace(/[\\()]/g, "\\$&");
}

function normalizeInventoryRows(products) {
  return (Array.isArray(products) ? products : []).flatMap((product) => {
    const warehouseRows = Array.isArray(product.warehouses) && product.warehouses.length
      ? product.warehouses
      : [{ warehouseId: null, quantity: product.stockTotal ?? product.stock ?? 0, warehouse: null }];
    return warehouseRows.map((warehouseRow) => ({
      productId: product.id,
      warehouseId: warehouseRow.warehouseId ?? warehouseRow.warehouse?.id ?? null,
      quantity: warehouseRow.quantity ?? warehouseRow.stock ?? 0,
      product: {
        ...product,
        minimumStock: product.minimumStock ?? 0,
        maximumStock: product.maximumStock ?? 0,
      },
      warehouse: warehouseRow.warehouse ?? null,
    }));
  });
}
