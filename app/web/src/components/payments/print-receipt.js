import { formatCopExact } from "@/lib/cop";
const esc = (value) =>
  String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

const date = (value) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(new Date(value)) : "—";

/**
 * Imprime el comprobante de un recibo de cobro/pago, con las copias pedidas.
 * `receipt` es la respuesta del API (recibos). `party` es el nombre del cliente o proveedor.
 */
export function printReceipt(receipt, { party = "", copies = 1 } = {}) {
  const pages = Math.max(1, Math.min(10, Number(copies) || 1));
  const isCollection = receipt.kind === "COBRO";
  const retentionTotal = Number(receipt.retentionTotal ?? 0);
  const rows = (receipt.allocations ?? [])
    .map(
      (line) =>
        `<tr><td>${esc(line.number)}</td><td class="n">${formatCopExact(line.amount)}</td><td class="n">${formatCopExact(line.retention ?? 0)}</td></tr>`,
    )
    .join("");
  const instruments = (receipt.instruments ?? [])
    .map(
      (item) =>
        `<tr><td>${esc(item.name)}${item.reference ? ` · ${esc(item.reference)}` : ""}</td><td class="n">${formatCopExact(item.amount)}</td></tr>`,
    )
    .join("");
  const page = (index) => `
    <section class="page">
      <header class="receipt-head">
        <div><div class="brand">MUNDO <span>TIENDA</span></div><small>Centro de control comercial</small></div>
        <div class="receipt-id"><span>${isCollection ? "RECIBO DE CAJA" : "COMPROBANTE DE EGRESO"}</span><strong>${esc(receipt.receiptNumber)}</strong><small>Copia ${index + 1} de ${pages}</small></div>
      </header>
      <div class="receipt-status">${isCollection ? "Cobro / abono a cartera" : "Pago / abono a proveedor"} · ${date(receipt.paidAt)}</div>
      <section class="meta-grid">
        <div><span>Documento (ticket)</span><strong>${esc(receipt.documentNumber)}</strong></div>
        <div><span>${isCollection ? "Cliente" : "Proveedor"}</span><strong>${esc(party)}</strong></div>
        <div><span>Fecha documento</span><strong>${date(receipt.paidAt)}</strong></div>
        <div><span>Detalle</span><strong>${esc(receipt.detail)}</strong></div>
        ${receipt.operationType ? `<div><span>Tipo de operación</span><strong>${esc(receipt.operationType)}</strong></div>` : ""}
        ${receipt.sellerName ? `<div><span>Vendedor</span><strong>${esc(receipt.sellerName)}</strong></div>` : ""}
      </section>
      <section class="receipt-section"><h3>Aplicación de la operación</h3>
        <table class="lines"><thead><tr><th>Documento aplicado</th><th>Valor</th><th>Retención</th></tr></thead><tbody>${rows}</tbody></table>
      </section>
      <section class="receipt-section"><h3>Medios de pago</h3>
        <table class="lines"><thead><tr><th>Medio / cuenta</th><th>Valor</th></tr></thead><tbody>${instruments}</tbody></table>
      </section>
      <div class="receipt-total"><span>Total ${isCollection && retentionTotal > 0 ? "recibido" : isCollection ? "acreditado" : "pagado"}</span><strong>${formatCopExact(receipt.totalAmount)}</strong></div>
      ${retentionTotal > 0 ? `<div class="receipt-subtotal"><span>Retenciones calculadas</span><strong>${formatCopExact(retentionTotal)}</strong></div>` : ""}
      ${receipt.comments ? `<p class="notes"><b>Comentarios:</b> ${esc(receipt.comments)}</p>` : ""}
      <footer class="receipt-footer"><span>Documento generado por Mundo Tienda</span><span>Firma: __________________________</span></footer>
    </section>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(receipt.receiptNumber)}</title>
    <style>
      :root{color:#172b42;background:#fff} *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;font-size:12px;margin:0;background:#f4f6f8}
      .page{width:760px;min-height:980px;margin:24px auto;padding:34px 38px;background:#fff;box-shadow:0 4px 18px rgba(17,35,52,.14);page-break-after:always}
      .receipt-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:18px;border-bottom:3px solid #1f5f9f}
      .brand{color:#173b63;font-size:28px;font-weight:800;letter-spacing:.16em}.brand span{color:#39a26a}
      .receipt-head small{color:#6b7785}.receipt-id{text-align:right}.receipt-id span{display:block;color:#1f5f9f;font-size:11px;font-weight:700;letter-spacing:.08em}.receipt-id strong{display:block;margin:4px 0;font-size:19px}.receipt-id small{display:block}
      .receipt-status{margin:14px 0;padding:9px 12px;color:#315270;background:#eef5fb;border:1px solid #c7d9e8;border-radius:4px;font-weight:700}
      .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 20px}.meta-grid div{display:grid;gap:4px;min-height:46px;padding:9px 11px;background:#f8fafc;border:1px solid #d8e1e9;border-radius:4px}.meta-grid span{color:#62758a;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.meta-grid strong{color:#162b40;font-size:13px;word-break:break-word}
      .receipt-section{margin-top:18px}.receipt-section h3{margin:0;padding:8px 10px;color:#fff;background:#1f5f9f;font-size:13px;letter-spacing:.03em}
      table{width:100%;border-collapse:collapse}.lines th,.lines td{border:1px solid #cbd5df;padding:8px 9px;text-align:left}.lines thead th{color:#fff;background:#3a7eb8;font-size:11px}.lines tbody tr:nth-child(even){background:#f8fafc}.n{text-align:right!important;font-variant-numeric:tabular-nums}
      .receipt-total{display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding:14px 16px;color:#fff;background:#173b63;border-radius:5px;font-size:15px}.receipt-total strong{font-size:22px}.receipt-subtotal,.receipt-applied{display:flex;justify-content:flex-end;gap:22px;margin-top:7px;color:#4b6278}.receipt-applied{padding:8px 12px;color:#173b63;background:#eaf8f0;border:1px solid #b8e0c8;border-radius:4px;font-weight:700}.notes{margin-top:16px;padding:11px 13px;background:#fff9e6;border:1px solid #ecd590;color:#5b4d22}.receipt-footer{display:flex;justify-content:space-between;gap:20px;margin-top:58px;padding-top:14px;border-top:1px solid #d5dde5;color:#738294;font-size:10px}
      @media print{body{background:#fff}.page{width:auto;min-height:0;margin:0;padding:24px 28px;box-shadow:none}}
    </style></head><body>${Array.from({ length: pages }, (_, index) => page(index)).join("")}
    <script>window.onload=function(){window.print();}</script></body></html>`;
  const popup = window.open("", "_blank", "width=640,height=800");
  if (!popup) throw new Error("El navegador bloqueó la ventana de impresión; permite las ventanas emergentes.");
  popup.document.write(html);
  popup.document.close();
}
