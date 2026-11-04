import { useEffect, useMemo, useState } from "react";
import { BarChart3, CircleX, Download, FileSpreadsheet, LoaderCircle, Mail, Printer, RefreshCw, X } from "lucide-react";

import { useDraggableWindow } from "@/components/desktop/use-draggable-window";
import { TransientMessage } from "@/components/desktop/transient-message";
import { apiClient } from "@/lib/api-client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CrossSalesReport, DayCloseReport, RetentionsReport } from "./reports-extra";
import "./reports-window.css";
import { formatCop } from "@/lib/cop";

const tabs = [
  ["resumen", "Resumen"], ["facturas", "Facturación"], ["inventario", "Inventario"],
  ["iva", "IVA"], ["exogena", "Exógena"], ["compras", "Compras"], ["clientes", "Clientes"],
  ["productos", "Top productos"], ["traslados", "Traslados"],
  ["retenciones", "Retenciones"], ["cruzadas", "Ventas cruzadas"], ["cierre", "Cierre del día"],
];

export function ReportsWindow({ onClose, onRequestLogin, session }) {
  const [tab, setTab] = useState("resumen");
  const [period, setPeriod] = useState("SEMANA_DOMINGO");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [state, setState] = useState({ loading: true, error: "", invoices: [], purchases: [], clients: [], products: [], inventory: [], movements: [], transfers: [], accounts: [], warehouses: [] });
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
      setState({ loading: false, error: failed ? "Algunos bloques no están disponibles con este perfil." : "", invoices, purchases, clients, products, inventory, movements, transfers, accounts, warehouses: [...new Map(inventory.filter((row) => row.warehouse).map((row) => [row.warehouse.id, row.warehouse])).values()] });
    } catch (requestError) {
      setState((current) => ({ ...current, loading: false, error: requestError.message ?? "No se pudieron cargar los reportes." }));
      if (/sesión|inicia sesión|401/i.test(requestError.message ?? "")) onRequestLogin?.();
    }
  }

  useEffect(() => { void loadData(); }, []);

  const filteredInvoices = useMemo(() => state.invoices.filter((invoice) => inPeriod(invoice.createdAt, period, customFrom, customTo)), [customFrom, customTo, period, state.invoices]);
  const filteredPurchases = useMemo(() => state.purchases.filter((purchase) => inPeriod(purchase.createdAt, period, customFrom, customTo)), [customFrom, customTo, period, state.purchases]);
  const totals = useMemo(() => ({
    invoices: filteredInvoices.length,
    sales: sum(filteredInvoices, "total"),
    iva: filteredInvoices.reduce((total, invoice) => total + invoiceTaxAmount(invoice), 0),
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
    const rows = tab === "facturas" ? filteredInvoices.map((row) => ({ fecha: row.createdAt, factura: row.consecutive, origen: row.source, cliente: row.client ? `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}`.trim() : "—", ivaVenta: invoiceTaxLabel(row), ivaPagado: invoiceTaxAmount(row), total: row.total })) : tab === "compras" ? filteredPurchases.map((row) => ({ fecha: row.createdAt, compra: row.consecutive, proveedor: row.provider?.name ?? "—", estado: row.status, subtotal: row.subtotal, impuestos: row.taxes, total: row.total })) : tab === "productos" ? topProducts : state.inventory.map((row) => ({ producto: row.product?.name, bodega: row.warehouse?.location ?? "—", existencia: row.quantity, inventario: row.inventoryValue ?? Number(row.product?.cost ?? 0) * Number(row.quantity ?? 0), minimo: row.product?.minimumStock, maximo: row.product?.maximumStock, estado: manualSignals[row.productId] ?? semaphore(row) }));
    if (!rows.length) return setNotice("No hay datos para exportar.");
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    downloadBlob(csv, `reporte-${tab}.csv`, "text/csv;charset=utf-8");
    setNotice("CSV descargado.");
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const appendSheet = (name, rows, widths) => { const sheet = XLSX.utils.json_to_sheet(rows); sheet["!cols"] = widths.map((wch) => ({ wch })); if (rows.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(sheet["!ref"])) }; XLSX.utils.book_append_sheet(workbook, sheet, name); };
    appendSheet("Resumen", [{ Indicador: "Periodo", Valor: periodLabel(period) }, { Indicador: "Ventas", Valor: totals.sales }, { Indicador: "Facturas", Valor: totals.invoices }, { Indicador: "IVA", Valor: totals.iva }, { Indicador: "Compras", Valor: totals.purchases }, { Indicador: "Stock crítico", Valor: totals.critical }], [28, 24]);
    appendSheet("Facturas", filteredInvoices.map((row) => ({ Fecha: date(row.createdAt), Factura: row.consecutive, Origen: row.source, Cliente: row.client ? `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}`.trim() : "—", Subtotal: Number(row.subtotal ?? 0), IVA: invoiceTaxAmount(row), Total: Number(row.total ?? 0) })), [14, 22, 14, 30, 16, 16, 16]);
    appendSheet("Compras", filteredPurchases.map((row) => ({ Fecha: date(row.createdAt), Orden: row.consecutive, Proveedor: row.provider?.name ?? "—", Estado: row.status, Subtotal: Number(row.subtotal ?? 0), Impuestos: Number(row.taxes ?? 0), Total: Number(row.total ?? 0) })), [14, 20, 30, 16, 16, 16, 16]);
    appendSheet("Inventario", state.inventory.map((row) => ({ Producto: row.product?.name ?? `Producto #${row.productId}`, Bodega: row.warehouse?.location ?? "—", Existencia: Number(row.quantity ?? 0), Mínimo: Number(row.product?.minimumStock ?? 0), Máximo: Number(row.product?.maximumStock ?? 0), Inventario: Number(row.inventoryValue ?? 0), Estado: manualSignals[row.productId] ?? semaphore(row) })), [34, 22, 14, 14, 14, 18, 14]);
    appendSheet("Top productos", topProducts.slice(0, 100).map((row) => ({ Producto: row.name, Unidades: row.quantity, Total: row.total })), [34, 16, 18]);
    XLSX.writeFile(workbook, `biblioteca-reportes-${tab}-${period.toLowerCase()}.xlsx`);
    setNotice("Excel descargado.");
  }

  async function exportPdf() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 34;
    const colors = { navy: [31, 51, 77], blue: [43, 108, 176], green: [49, 165, 109], amber: [210, 138, 37], ink: [39, 55, 76], muted: [103, 119, 139], line: [224, 231, 239], pale: [246, 249, 252] };
    const reportRows = tab === "facturas"
      ? filteredInvoices.map((row) => [date(row.createdAt), row.consecutive, row.source ?? "—", row.client ? `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}`.trim() : "—", `${formatCop(row.total)}`])
      : tab === "compras"
        ? filteredPurchases.map((row) => [date(row.createdAt), row.consecutive, row.status ?? "—", row.provider?.name ?? "—", `${formatCop(row.total)}`])
        : tab === "productos"
          ? topProducts.map((row) => [row.name, String(row.quantity), `${formatCop(row.total)}`])
          : state.inventory.map((row) => [row.product?.name ?? `Producto #${row.productId}`, row.warehouse?.location ?? "—", String(row.quantity ?? 0), `${formatCop(row.inventoryValue)}`, manualSignals[row.productId] ?? semaphore(row)]);
    const headers = tab === "facturas" ? ["Fecha", "Factura", "Origen", "Cliente", "Total"] : tab === "compras" ? ["Fecha", "Orden", "Estado", "Proveedor", "Total"] : tab === "productos" ? ["Producto", "Unidades", "Ventas"] : ["Producto", "Bodega", "Existencia", "Inventario", "Estado"];
    let y = 0;
    const drawHeader = (first = true) => {
      doc.setFillColor(...colors.navy); doc.rect(0, 0, pageWidth, first ? 76 : 34, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(first ? 19 : 10); doc.text(first ? "MUNDO TIENDA" : "MUNDO TIENDA · BIBLIOTECA DE REPORTES", margin, first ? 32 : 21); if (first) { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("ADMINISTRACIÓN · CONTROL Y CUMPLIMIENTO", margin, 51); doc.text(`Periodo: ${periodLabel(period)}`, pageWidth - margin, 32, { align: "right" }); doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, pageWidth - margin, 50, { align: "right" }); y = 104; } else y = 55;
    };
    drawHeader();
    const cards = [["Ventas", `${formatCop(totals.sales)}`, colors.blue], ["Facturas", String(totals.invoices), colors.green], ["IVA", `${formatCop(totals.iva)}`, colors.amber], ["Compras", `${formatCop(totals.purchases)}`, colors.navy], ["Stock crítico", String(totals.critical), colors.red ?? [196, 84, 84]]];
    const gap = 9; const cardWidth = (pageWidth - margin * 2 - gap * (cards.length - 1)) / cards.length;
    cards.forEach(([label, value, color], index) => { const x = margin + index * (cardWidth + gap); doc.setFillColor(255, 255, 255); doc.setDrawColor(...colors.line); doc.roundedRect(x, y, cardWidth, 56, 5, 5, "FD"); doc.setFillColor(...color); doc.roundedRect(x, y, cardWidth, 4, 2, 2, "F"); doc.setTextColor(...colors.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(label, x + 10, y + 20); doc.setTextColor(...colors.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(value, x + 10, y + 41); });
    y += 84;
    doc.setTextColor(...colors.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(`Detalle · ${tabs.find(([value]) => value === tab)?.[1] ?? "Reporte"}`, margin, y); y += 18;
    const widths = headers.length === 5 ? [72, 135, 100, 215, 70] : headers.length === 3 ? [360, 90, 100] : [240, 150, 90, 110, 80];
    const drawTableHeader = () => { doc.setFillColor(...colors.blue); doc.rect(margin, y - 12, pageWidth - margin * 2, 21, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8); let x = margin + 7; headers.forEach((header, index) => { doc.text(header, x, y + 2); x += widths[index]; }); y += 21; };
    drawTableHeader();
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); reportRows.slice(0, 100).forEach((row, index) => { if (y > pageHeight - 42) { doc.addPage(); drawHeader(false); drawTableHeader(); } if (index % 2 === 0) { doc.setFillColor(...colors.pale); doc.rect(margin, y - 11, pageWidth - margin * 2, 19, "F"); } let x = margin + 7; doc.setTextColor(...colors.ink); row.forEach((value, valueIndex) => { doc.text(doc.splitTextToSize(String(value ?? "—"), widths[valueIndex] - 12)[0], x, y); x += widths[valueIndex]; }); y += 19; });
    if (!reportRows.length) { doc.setTextColor(...colors.muted); doc.text("No hay datos para este periodo.", margin + 7, y + 6); }
    doc.setTextColor(...colors.muted); doc.setFontSize(8); doc.text("Mundo Tienda · Reporte generado desde Administración", margin, pageHeight - 18); doc.save(`biblioteca-reportes-${tab}-${period.toLowerCase()}.pdf`); setNotice("PDF descargado.");
  }

  async function sendEmail() {
    const recipient = window.prompt("Correo que recibirá el reporte semanal:", session?.username?.includes("@") ? session.username : "");
    if (!recipient) return;
    try {
      const emailStart = reportStart(period, customFrom);
      const emailEnd = period === "CUSTOM" && customTo ? new Date(`${customTo}T23:59:59`) : new Date();
      await apiClient.post("/reportes/email", {
        to: [recipient.trim()], subject: `Reporte ${periodLabel(period)} · Mundo Tienda`, startDate: emailStart.toISOString(), endDate: emailEnd.toISOString(), generatedAt: new Date().toISOString(), generatedBy: session?.username ?? session?.user?.username,
        sections: ["RESUMEN", "FACTURAS", "IVA", "EXOGENAS", "STOCK", "TRASLADOS", "PRODUCTOS"],
        summaryCards: [{ label: "Ventas", value: `${formatCop(totals.sales)}` }, { label: "Facturas", value: totals.invoices }, { label: "Stock crítico", value: totals.critical }],
        highlights: [{ label: "Periodo", value: periodLabel(period) }],
        invoiceRows: filteredInvoices.map((row) => ({ fecha: date(row.createdAt), factura: row.consecutive, origen: row.source, ivaVenta: invoiceTaxLabel(row), ivaPagado: formatCop(invoiceTaxAmount(row)), total: formatCop(row.total) })),
        ivaRows: filteredInvoices.map((row) => ({ factura: row.consecutive, ivaVenta: invoiceTaxLabel(row), iva: formatCop(invoiceTaxAmount(row)) })),
        exogenousRows: filteredInvoices.map((row) => ({ factura: row.consecutive, cliente: row.client?.identification ?? "—", total: formatCop(row.total) })),
        lowStockRows: state.inventory.filter((row) => semaphore(row) === "Rojo").map((row) => ({ producto: row.product?.name, existencia: row.quantity })),
        transferRows: state.transfers.map((row) => ({ ticket: row.ticketNumber ?? row.id, fecha: date(row.createdAt) })),
        topProductRows: topProducts.slice(0, 10).map((row) => ({ producto: row.name, unidades: row.quantity, total: formatCop(row.total) })),
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
    <div className="p1-heading"><div><span className="p1-heading-kicker">ADMINISTRACIÓN · CONTROL Y CUMPLIMIENTO</span><h2>Biblioteca de reportes</h2><p>Consulta, compara y exporta la operación del negocio desde una sola vista.</p></div><div className="p1-heading-actions"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Periodo"><option value="DIARIO">Hoy</option><option value="TRES_DIAS">Últimos 3 días</option><option value="SEMANA_DOMINGO">Semana con cierre dominical</option><option value="MES">Últimos 30 días</option><option value="TRIMESTRE">Últimos 90 días</option><option value="CUSTOM">Rango personalizado</option></select>{period === "CUSTOM" && <><label className="p1-date-control">Desde<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label className="p1-date-control">Hasta<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label></>}<button type="button" className="p1-secondary-button p1-button-blue" onClick={() => void loadData()} disabled={state.loading}><RefreshCw size={14} className={state.loading ? "is-spinning" : ""} /> Actualizar</button><button type="button" className="p1-secondary-button p1-button-green" onClick={exportPdf}><Printer size={14} /> PDF</button><button type="button" className="p1-secondary-button p1-button-green" onClick={() => window.print()}><Printer size={14} /> Imprimir</button><button type="button" className="p1-secondary-button p1-button-amber" onClick={exportCsv}><Download size={14} /> CSV</button><button type="button" className="p1-secondary-button p1-button-green" onClick={() => void exportExcel()}><FileSpreadsheet size={14} /> Excel</button><button type="button" className="p1-secondary-button p1-button-dark" onClick={() => void sendEmail()}><Mail size={14} /> Enviar correo</button></div></div>
    {(state.error || notice) && <TransientMessage className={state.error ? "window-error" : "p1-success"} role={state.error ? "alert" : "status"} onDismiss={() => { setNotice(""); setState((current) => ({ ...current, error: "" })); }}>{state.error || notice}</TransientMessage>}
    <nav className="p1-tabs" aria-label="Bloques de reportes">{tabs.map(([value, label]) => <button key={value} type="button" className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {state.loading ? <div className="p1-state p1-page-state"><LoaderCircle size={24} className="is-spinning" /> Preparando reportes…</div> : <ReportBody tab={tab} state={state} totals={totals} topProducts={topProducts} period={period} customFrom={customFrom} customTo={customTo} manualSignals={manualSignals} onManualSignal={toggleManualSignal} />}
    <footer className="provider-window-footer"><span>Periodo: {periodLabel(period)} · Usuario: {session?.username ?? session?.user?.username ?? "—"}</span><button type="button" className="exit-action" onClick={onClose}><CircleX size={14} /> Salir</button></footer>
  </section>;
}

function ReportBody({ tab, state, totals, topProducts, period, customFrom, customTo, manualSignals, onManualSignal }) {
  const inSelectedPeriod = (value) => inPeriod(value, period, customFrom, customTo);
  const filteredInvoices = state.invoices.filter((invoice) => inSelectedPeriod(invoice.createdAt));
  const filteredPurchases = state.purchases.filter((purchase) => inSelectedPeriod(purchase.createdAt));
  if (tab === "retenciones") return <RetentionsReport purchases={state.purchases} inPeriod={inSelectedPeriod} />;
  if (tab === "cruzadas") return <CrossSalesReport invoices={state.invoices} inPeriod={inSelectedPeriod} warehouses={state.warehouses} />;
  if (tab === "cierre") return <DayCloseReport />;
  if (tab === "resumen") return <div className="p1-report-grid p1-report-dashboard"><ReportKpi label="Ventas" value={`${formatCop(totals.sales)}`} tone="blue" /><ReportKpi label="Facturas" value={totals.invoices} tone="green" /><ReportKpi label="IVA" value={`${formatCop(totals.iva)}`} tone="amber" /><ReportKpi label="Compras" value={`${formatCop(totals.purchases)}`} tone="navy" /><ReportKpi label="Stock crítico" value={totals.critical} tone="red" /><AdminSummaryCharts invoices={filteredInvoices} purchases={filteredPurchases} topProducts={topProducts} totals={totals} /><section className="p1-card p1-report-wide"><div className="p1-card-title"><div><strong>Lectura ejecutiva</strong><span>Facturación, inventario, IVA, compras, clientes, productos y traslados en el mismo periodo.</span></div></div><div className="p1-report-highlights"><span>• Usa las fechas para comparar cortes</span><span>• Revisa IVA antes del cierre</span><span>• Prioriza inventario en rojo</span><span>• Exporta el detalle para auditoría</span></div></section></div>;
  if (tab === "facturas") return <DataTable headers={["Fecha", "Factura", "Origen", "Cliente", "IVA venta", "IVA pagado", "Total"]} rows={state.invoices.filter((row) => inSelectedPeriod(row.createdAt)).map((row) => [date(row.createdAt), row.consecutive, row.source, row.client ? `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}` : "—", invoiceTaxLabel(row), `${formatCop(invoiceTaxAmount(row))}`, `${formatCop(row.total)}`])} />;
  if (tab === "compras") return <DataTable headers={["Fecha", "Orden", "Estado", "Bodega", "Total"]} rows={state.purchases.filter((row) => inSelectedPeriod(row.createdAt)).map((row) => [date(row.createdAt), row.consecutive, row.status, row.warehouse?.location ?? "—", `${formatCop(row.total)}`])} />;
  if (tab === "clientes") return <DataTable headers={["Identificación", "Cliente", "Tipo", "Estado"]} rows={state.clients.map((row) => [row.identification, `${row.firstName ?? ""} ${row.lastName ?? ""}`, row.clientType ?? row.type ?? "—", row.isActive ? "Activo" : "Inactivo"]) } />;
  if (tab === "productos") return <DataTable headers={["Producto", "Unidades vendidas", "Total"]} rows={topProducts.map((row) => [row.name, row.quantity, `${formatCop(row.total)}`])} />;
  if (tab === "traslados") return <DataTable headers={["Fecha", "Ticket", "Estado", "Origen", "Destino"]} rows={state.transfers.map((row) => [date(row.createdAt), row.ticketNumber ?? row.id, row.status ?? "Registrado", row.fromWarehouse?.location ?? row.sourceWarehouse?.location ?? "—", row.toWarehouse?.location ?? row.destinationWarehouse?.location ?? "—"]) } />;
  if (tab === "iva") return <DataTable headers={["Fecha", "Factura", "IVA venta", "Base", "IVA pagado", "Total"]} rows={state.invoices.filter((row) => inSelectedPeriod(row.createdAt)).map((row) => [date(row.createdAt), row.consecutive, invoiceTaxLabel(row), `${formatCop(row.subtotal)}`, `${formatCop(invoiceTaxAmount(row))}`, `${formatCop(row.total)}`])} />;
  if (tab === "exogena") return <DataTable headers={["Factura", "Identificación", "Origen", "Total"]} rows={state.invoices.filter((row) => inSelectedPeriod(row.createdAt)).map((row) => [row.consecutive, row.client?.identification ?? "—", row.source, `${formatCop(row.total)}`])} />;
  return <section className="p1-card p1-report-table-card"><div className="p1-card-title"><div><strong>Existencias y valorización</strong></div></div><div className="p1-simple-table"><div className="p1-simple-head"><span>Producto</span><span>Existencia</span><span>Sin IVA</span><span>IVA</span><span>Con IVA</span><span>Estado</span></div>{state.inventory.length ? state.inventory.map((row) => { const signal = manualSignals[row.productId] ?? semaphore(row); return <div className="p1-simple-row" key={`${row.productId}-${row.warehouseId}`}><span>{row.product?.name ?? `Producto #${row.productId}`}</span><span>{row.quantity}</span><span>${formatCop(row.inventoryValueNet)}</span><span>${formatCop(row.inventoryTax)}</span><span>${formatCop(row.inventoryValue)}</span><span><button type="button" className={`p1-signal-button ${signal.toLowerCase()}`} onClick={() => onManualSignal(row.productId)}>{signal}</button></span></div>; }) : <div className="p1-state">No hay existencias para este periodo.</div>}</div></section>;
}

function ReportKpi({ label, value, tone = "blue" }) { return <article className={`p1-kpi ${tone}`}><span>{label}</span><strong>{value}</strong></article>; }

function AdminSummaryCharts({ invoices, purchases, topProducts, totals }) {
  const byDay = new Map();
  invoices.forEach((invoice) => { const key = dateKey(invoice.createdAt); const row = byDay.get(key) ?? { date: dayLabel(invoice.createdAt), ventas: 0, iva: 0 }; row.ventas += Number(invoice.total ?? 0); row.iva += invoiceTaxAmount(invoice); byDay.set(key, row); });
  const trend = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const purchaseTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.total ?? 0), 0);
  const mix = [{ name: "Ventas", value: totals.sales, color: "#2b6cb0" }, { name: "Compras", value: purchaseTotal, color: "#d28a25" }, { name: "IVA", value: totals.iva, color: "#31a56d" }].filter((row) => row.value > 0);
  return <div className="p1-chart-grid p1-report-wide"><section className="p1-card p1-chart-card"><div className="p1-card-title"><div><strong>Flujo del periodo</strong><span>Ventas e impuestos por día.</span></div></div><ResponsiveContainer width="100%" height={250}><BarChart data={trend} margin={{ top: 10, right: 8, left: -16, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e7edf3" /><XAxis dataKey="date" tick={{ fill: "#718096", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#8a98aa", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => shortMoney(value)} /><Tooltip content={<AdminTooltip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: "#66778d" }} /><Bar dataKey="ventas" name="Ventas" fill="#2b6cb0" radius={[4, 4, 0, 0]} /><Bar dataKey="iva" name="IVA" fill="#31a56d" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></section><section className="p1-card p1-chart-card"><div className="p1-card-title"><div><strong>Distribución de valor</strong><span>Ventas, compras e IVA del filtro.</span></div></div><div className="p1-pie-wrap"><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={mix} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="78%" paddingAngle={3} stroke="none">{mix.map((row) => <Cell key={row.name} fill={row.color} />)}</Pie><Tooltip content={<AdminTooltip currency />} /></PieChart></ResponsiveContainer><div className="p1-pie-legend">{mix.map((row) => <div key={row.name}><i style={{ background: row.color }} /><span>{row.name}</span><strong>${formatCop(row.value)}</strong></div>)}</div></div></section><section className="p1-card p1-chart-card"><div className="p1-card-title"><div><strong>Top productos</strong><span>Unidades y venta acumulada.</span></div></div><ResponsiveContainer width="100%" height={250}><BarChart data={topProducts.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 12, left: 5, bottom: 5 }}><CartesianGrid horizontal={false} stroke="#e7edf3" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={110} tick={{ fill: "#596b82", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={<AdminTooltip currency />} /><Bar dataKey="total" name="Venta" fill="#2b6cb0" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></section></div>;
}

function AdminTooltip({ active, payload, label, currency = false }) { if (!active || !payload?.length) return null; return <div className="p1-chart-tooltip"><strong>{label}</strong>{payload.map((row) => <div key={row.dataKey}><span>{row.name ?? row.dataKey}</span><b>{currency ? `${formatCop(row.value)}` : shortMoney(row.value)}</b></div>)}</div>; }
function DataTable({ headers, rows }) { return <section className="p1-card p1-report-table-card"><div className="p1-simple-table"><div className="p1-simple-head">{headers.map((header) => <span key={header}>{header}</span>)}</div>{rows.length ? rows.slice(0, 250).map((row, index) => <div className="p1-simple-row" key={index}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>) : <div className="p1-state">No hay datos para este periodo.</div>}</div></section>; }
function inPeriod(value, period, customFrom = "", customTo = "") { const dateValue = value ? new Date(value) : new Date(); const now = new Date(); const start = reportStart(period, customFrom); const end = period === "CUSTOM" && customTo ? new Date(`${customTo}T23:59:59`) : now; return dateValue >= start && dateValue <= end; }
function reportStart(period, customFrom = "") { const start = new Date(); start.setHours(0, 0, 0, 0); if (period === "CUSTOM") return customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(0); if (period === "TRES_DIAS") start.setDate(start.getDate() - 2); if (period === "SEMANA_DOMINGO") start.setDate(start.getDate() - start.getDay()); if (period === "MES") start.setDate(start.getDate() - 29); if (period === "TRIMESTRE") start.setDate(start.getDate() - 89); return start; }
function periodLabel(period) { return { DIARIO: "hoy", TRES_DIAS: "últimos 3 días", SEMANA_DOMINGO: "semana domingo-hoy", MES: "últimos 30 días", TRIMESTRE: "últimos 90 días", CUSTOM: "rango personalizado" }[period] ?? period; }
function dateKey(value) { const dateValue = new Date(value); return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}-${String(dateValue.getDate()).padStart(2, "0")}`; }
function dayLabel(value) { return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(new Date(value)).replace(".", ""); }
function shortMoney(value) { const amount = Number(value ?? 0); return amount >= 1000000 ? `$${(amount / 1000000).toFixed(1)}M` : amount >= 1000 ? `$${Math.round(amount / 1000)}k` : `$${Math.round(amount)}`; }
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0); }
function date(value) { return value ? new Date(value).toLocaleDateString("es-CO") : "-"; }
function invoiceTaxAmount(invoice) {
  return Number(invoice?.taxes ?? invoice?.taxAmount ?? invoice?.tax ?? 0);
}
function invoiceTaxLabel(invoice) {
  const rates = [...new Set((invoice.items ?? []).map((item) => Number(item.taxRate ?? item.product?.taxRate ?? 0)))];
  if (rates.length) return rates.map((rate) => `${formatCop(rate)}%`).join(" / ");
  const subtotal = Number(invoice?.subtotal ?? 0);
  const tax = invoiceTaxAmount(invoice);
  return subtotal > 0 ? `${formatCop((tax / subtotal) * 100)}%` : "0%";
}
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
    lines.push(`Ventas: ${formatCop(totals.sales)}`, `Facturas: ${totals.invoices}`, `IVA: ${formatCop(totals.iva)}`, `Compras: ${formatCop(totals.purchases)}`, `Stock critico: ${totals.critical}`);
  } else if (tab === "facturas") {
    lines.push("Fecha | Factura | Origen | IVA venta | IVA pagado | Total");
    filteredInvoices.slice(0, 45).forEach((row) => lines.push(`${date(row.createdAt)} | ${row.consecutive} | ${row.source} | ${invoiceTaxLabel(row)} | ${formatCop(invoiceTaxAmount(row))} | ${formatCop(row.total)}`));
  } else if (tab === "compras") {
    lines.push("Fecha | Orden | Estado | Bodega | Total");
    filteredPurchases.slice(0, 45).forEach((row) => lines.push(`${date(row.createdAt)} | ${row.consecutive} | ${row.status} | ${row.warehouse?.location ?? "-"} | ${formatCop(row.total)}`));
  } else if (tab === "productos") {
    lines.push("Producto | Unidades | Total");
    topProducts.slice(0, 45).forEach((row) => lines.push(`${row.name} | ${row.quantity} | ${formatCop(row.total)}`));
  } else if (tab === "iva") {
    lines.push("Fecha | Factura | IVA venta | Base | IVA pagado | Total");
    filteredInvoices.slice(0, 45).forEach((row) => lines.push(`${date(row.createdAt)} | ${row.consecutive} | ${invoiceTaxLabel(row)} | ${formatCop(row.subtotal)} | ${formatCop(invoiceTaxAmount(row))} | ${formatCop(row.total)}`));
  } else {
    lines.push("Producto | Existencia | Inventario total | Estado");
    state.inventory.slice(0, 45).forEach((row) => lines.push(`${row.product?.name ?? `Producto #${row.productId}`} | ${row.quantity} | ${formatCop(row.inventoryValue)} | ${manualSignals[row.productId] ?? semaphore(row)}`));
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
      inventoryValueNet: warehouseRow.inventoryValueNet ?? product.inventoryValueNet ?? 0,
      inventoryTax: warehouseRow.inventoryTax ?? product.inventoryTax ?? 0,
      inventoryValue: warehouseRow.inventoryValue ?? product.inventoryValue ?? 0,
      product: {
        ...product,
        minimumStock: product.minimumStock ?? 0,
        maximumStock: product.maximumStock ?? 0,
      },
      warehouse: warehouseRow.warehouse ?? null,
    }));
  });
}
