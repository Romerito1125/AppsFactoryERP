import { esc, money, openSheetWindow, sheetDocument } from "../../lib/print-sheet.js";

// Documento imprimible de la orden de compra con la hoja común de Ventas y Compras
// (lib/print-sheet.js). Se imprime o se guarda como PDF desde la ventana que se abre.

// doc: { title, number, status, annulled, provider, nit, warehouse, date, invoiceRef, rateText,
//        breakdown (orderBreakdown), items: [{ code, name, quantity, unitCost, total }] }
function purchaseOrderBody(doc) {
  const b = doc.breakdown;
  const rows = doc.items
    .map(
      (item) => `<tr>
        <td>${esc(item.code)}</td>
        <td>${esc(item.name)}</td>
        <td>${esc(item.quantity)}</td>
        <td>${money(item.unitCost)}</td>
        <td>${money(item.total)}</td>
      </tr>`,
    )
    .join("");
  return `
  <main class="sheet">
    <header class="head">
      <div class="brand">Mundo Tienda</div>
      <div class="type">ORDEN DE COMPRA<br><span>${esc(doc.number)}</span></div>
    </header>
    <section class="meta">
      <div><span>Proveedor</span><strong>${esc(doc.provider)}</strong></div>
      <div><span>NIT</span><strong>${esc(doc.nit)}</strong></div>
      <div><span>Depósito</span><strong>${esc(doc.warehouse)}</strong></div>
      <div><span>Fecha</span><strong>${esc(doc.date)}</strong></div>
      <div><span>Estado</span><strong>${esc(doc.status)}</strong></div>
      <div><span>Factura del proveedor</span><strong>${esc(doc.invoiceRef)}</strong></div>
    </section>
    <table>
      <thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Costo unitario (IVA incl.)</th><th>Total</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Esta orden no tiene productos.</td></tr>'}</tbody>
    </table>
    <section class="totals"><div>
      <p><span>Renglones con IVA</span><strong>${money(b.grossLines)}</strong></p>
      ${b.discount > 0 ? `<p><span>Descuento${b.discountLabel ? ` ${esc(b.discountLabel)}` : ""}</span><strong>-${money(b.discount)}</strong></p>` : ""}
      ${b.freight > 0 ? `<p><span>Flete</span><strong>${money(b.freight)}</strong></p>` : ""}
      <p class="sub"><span>Total operación</span><strong>${money(b.total)}</strong></p>
      <p class="base"><span>Base imponible (antes de IVA)</span><strong>${b.base === null ? "—" : money(b.base)}</strong></p>
      ${b.retentionAmount > 0 && !doc.annulled ? `<p class="ret"><span>Retención (${esc(doc.rateText)}%) sobre la base</span><strong>-${money(b.retentionAmount)}</strong></p>` : ""}
      ${doc.annulled
        ? '<p class="total"><span>Orden anulada</span><strong>Sin pago</strong></p>'
        : `<p class="total"><span>Total a pagar</span><strong>${money(b.payable)}</strong></p>
      <p><span>Pagado</span><strong>${money(b.paid)}</strong></p>
      <p><span>Saldo pendiente</span><strong>${money(b.balance)}</strong></p>`}
    </div></section>
    <p class="note">IVA incluido en los renglones: ${money(b.ivaIncluded)} (antes de descuento). La retención se calcula sobre la base imponible.</p>
    <p class="foot">Documento generado desde el módulo de compras · Mundo Tienda ERP</p>
  </main>`;
}

export function buildPurchaseOrderHtml(doc) {
  return sheetDocument(doc.title, purchaseOrderBody(doc));
}

// Devuelve false si el navegador bloquea la ventana emergente.
export function printPurchaseOrder(doc) {
  return openSheetWindow(doc.title, purchaseOrderBody(doc));
}
