// Ticket compacto tipo retail (80 mm, estilo D1/ARA) para facturas. Imprime y reimprime
// el mismo documento: totales, IVA por tasa, medios de pago, número, cajero y vendedor.
const esc = (value) =>
  String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

const money = (value) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );

const stamp = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "";

const clientLabel = (client) =>
  client ? [client.firstName, client.lastName].filter(Boolean).join(" ") || client.identification : "Consumidor final";

function taxBreakdown(items) {
  const byRate = new Map();
  for (const item of items) {
    const rate = Number(item.taxRate ?? item.product?.taxRate ?? 0);
    const current = byRate.get(rate) ?? { base: 0, tax: 0 };
    current.base += Number(item.subtotal ?? 0);
    current.tax += Number(item.taxAmount ?? 0);
    byRate.set(rate, current);
  }
  return [...byRate.entries()].sort((a, b) => a[0] - b[0]);
}

export function buildTicketHtml(invoice, { copy = "" } = {}) {
  const items = invoice.items ?? [];
  const lines = items
    .map((item) => {
      const gross = Number(item.total ?? 0);
      const qty = Number(item.quantity ?? 0);
      return `<tr><td colspan="3">${esc(item.product?.name ?? `Producto ${item.productId}`)}</td></tr>
        <tr class="sub"><td>${qty} x ${money(qty ? gross / qty : 0)}</td><td></td><td class="n">${money(gross)}</td></tr>`;
    })
    .join("");
  const taxes = taxBreakdown(items)
    .map(
      ([rate, row]) =>
        `<tr><td>IVA ${rate}%</td><td class="n">Base ${money(row.base)}</td><td class="n">${money(row.tax)}</td></tr>`,
    )
    .join("");
  const payments = (invoice.bankMovement ?? [])
    .map(
      (movement) =>
        `<tr><td colspan="2">${esc(movement.bankAccount?.name ?? "Pago")}</td><td class="n">${money(movement.amount)}</td></tr>`,
    )
    .join("");
  const credit = invoice.credit
    ? `<tr><td colspan="2">A crédito</td><td class="n">${money(invoice.credit.totalAmount)}</td></tr>`
    : "";
  return `<section class="ticket">
    <h1>MUNDO TIENDA</h1>
    <p class="c">Factura de venta ${esc(invoice.consecutive)}${copy ? ` · ${esc(copy)}` : ""}</p>
    <p class="c">${esc(stamp(invoice.createdAt))}</p>
    <hr />
    <p>Cliente: ${esc(clientLabel(invoice.client))}</p>
    <p>Vendedor: ${esc(invoice.sellerUsername ?? invoice.createdByUsername ?? "—")}</p>
    <p>Cajero: ${esc(invoice.createdByUsername ?? "—")}</p>
    <hr />
    <table>${lines}</table>
    <hr />
    <table>
      <tr><td colspan="2">Subtotal</td><td class="n">${money(invoice.subtotal)}</td></tr>
      ${taxes}
      <tr class="total"><td colspan="2">TOTAL</td><td class="n">${money(invoice.total)}</td></tr>
    </table>
    <hr />
    <p><b>Medios de pago</b></p>
    <table>${payments || '<tr><td colspan="3">Contado</td></tr>'}${credit}</table>
    <hr />
    <p class="c">Gracias por su compra</p>
    <p class="c small">Documento generado por Mundo Tienda ERP</p>
  </section>`;
}

/** Imprime el ticket con las copias pedidas (1 por defecto). */
export function printInvoiceTicket(invoice, copies = 1) {
  const pages = Math.max(1, Math.min(5, Number(copies) || 1));
  const body = Array.from({ length: pages }, (_, index) =>
    buildTicketHtml(invoice, { copy: pages > 1 ? `Copia ${index + 1}/${pages}` : "" }),
  ).join("");
  const popup = window.open("", "_blank", "width=380,height=720");
  if (!popup) throw new Error("El navegador bloqueó la ventana de impresión; permite las ventanas emergentes.");
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${esc(invoice.consecutive)}</title>
    <style>
      @page{size:80mm auto;margin:3mm}
      *{box-sizing:border-box}
      body{margin:0;font:12px/1.35 "Courier New",monospace;color:#000}
      .ticket{width:72mm;margin:0 auto;padding:2mm 0;page-break-after:always}
      h1{margin:0;text-align:center;font-size:16px;letter-spacing:.12em}
      p{margin:1px 0} .c{text-align:center} .small{font-size:10px}
      hr{border:0;border-top:1px dashed #000;margin:5px 0}
      table{width:100%;border-collapse:collapse} td{padding:0;vertical-align:top} .n{text-align:right;white-space:nowrap}
      .sub td{padding-bottom:3px} .total td{font-weight:700;font-size:14px;border-top:1px solid #000;padding-top:3px}
    </style></head><body>${body}<script>window.onload=function(){window.print();}</` + `script></body></html>`);
  popup.document.close();
}
