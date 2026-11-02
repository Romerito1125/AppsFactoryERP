const esc = (value) =>
  String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

const money = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));

const date = (value) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(new Date(value)) : "—";

/**
 * Imprime el comprobante de un recibo de cobro/pago, con las copias pedidas.
 * `receipt` es la respuesta del API (recibos). `party` es el nombre del cliente o proveedor.
 */
export function printReceipt(receipt, { party = "", copies = 1 } = {}) {
  const pages = Math.max(1, Math.min(10, Number(copies) || 1));
  const isCollection = receipt.kind === "COBRO";
  const rows = (receipt.allocations ?? [])
    .map(
      (line) =>
        `<tr><td>${esc(line.number)}</td><td class="n">${money(line.amount)}</td><td class="n">${money(line.retention ?? 0)}</td></tr>`,
    )
    .join("");
  const instruments = (receipt.instruments ?? [])
    .map(
      (item) =>
        `<tr><td>${esc(item.name)}${item.reference ? ` · ${esc(item.reference)}` : ""}</td><td class="n">${money(item.amount)}</td></tr>`,
    )
    .join("");
  const page = (index) => `
    <section class="page">
      <h1>MUNDO TIENDA</h1>
      <h2>${isCollection ? "RECIBO DE CAJA" : "COMPROBANTE DE EGRESO"} · ${esc(receipt.receiptNumber)}</h2>
      <p class="copy">Copia ${index + 1} de ${pages}</p>
      <table class="meta">
        <tr><th>Documento (ticket)</th><td>${esc(receipt.documentNumber)}</td></tr>
        <tr><th>${isCollection ? "Cliente" : "Proveedor"}</th><td>${esc(party)}</td></tr>
        <tr><th>Fecha documento</th><td>${date(receipt.paidAt)}</td></tr>
        <tr><th>Detalle</th><td>${esc(receipt.detail)}</td></tr>
        ${receipt.operationType ? `<tr><th>Tipo de operación</th><td>${esc(receipt.operationType)}</td></tr>` : ""}
        ${receipt.sellerName ? `<tr><th>Vendedor</th><td>${esc(receipt.sellerName)}</td></tr>` : ""}
      </table>
      <table class="lines">
        <thead><tr><th>Documento aplicado</th><th>Valor</th><th>Retención</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <table class="lines">
        <thead><tr><th>Medio de pago</th><th>Valor</th></tr></thead>
        <tbody>${instruments}</tbody>
      </table>
      <p class="total">Total ${isCollection ? "acreditado" : "pagado"}: <b>${money(receipt.totalAmount)}</b></p>
      ${receipt.comments ? `<p class="notes">Comentarios: ${esc(receipt.comments)}</p>` : ""}
      <p class="sign">_____________________ Firma</p>
    </section>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(receipt.receiptNumber)}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:0}
      .page{width:520px;margin:20px auto;page-break-after:always}
      h1{margin:0;text-align:center;letter-spacing:.15em} h2{text-align:center;margin:4px 0 0;font-size:14px}
      .copy{text-align:center;color:#666;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse;margin:8px 0} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}
      .meta th{width:38%;background:#eef2f6} .lines thead th{background:#1f5f9f;color:#fff} .n{text-align:right}
      .total{text-align:right;font-size:14px} .sign{margin-top:36px;text-align:center}
      @media print{.page{margin:0 auto}}
    </style></head><body>${Array.from({ length: pages }, (_, index) => page(index)).join("")}
    <script>window.onload=function(){window.print();}</script></body></html>`;
  const popup = window.open("", "_blank", "width=640,height=800");
  if (!popup) throw new Error("El navegador bloqueó la ventana de impresión; permite las ventanas emergentes.");
  popup.document.write(html);
  popup.document.close();
}
