import { esc, money, openSheetWindow, sheetDocument } from "./print-sheet.js";

// Nota crédito de una devolución con el mismo diseño de hoja que Ventas y Compras.
// note: respuesta de la API (consecutive, createdAt, reason, notes, invoice, client, items, total,
// creditApplied, refundedAmount, advanceAmount, createdByUsername).

const stamp = (value) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

const clientName = (client) =>
  client ? [client.firstName, client.lastName].filter(Boolean).join(" ") || client.identification : "Consumidor final";

export function buildReturnNoteHtml(note) {
  const items = note.items ?? [];
  const rows = items
    .map(
      (item) => `<tr>
        <td>${esc(item.invoiceItem?.product?.name ?? `Producto ${item.productId ?? ""}`)}</td>
        <td>${esc(item.quantity)}</td>
        <td>${money(item.total)}</td>
      </tr>`,
    )
    .join("");
  const applied = Number(note.creditApplied ?? 0);
  const refunded = Number(note.refundedAmount ?? 0);
  const advance = Number(note.advanceAmount ?? 0);
  const body = `
  <main class="sheet">
    <header class="head">
      <div class="brand">Mundo Tienda</div>
      <div class="type">NOTA CRÉDITO · DEVOLUCIÓN<br><span>${esc(note.consecutive)}</span></div>
    </header>
    <section class="meta">
      <div><span>Cliente</span><strong>${esc(clientName(note.client))}</strong></div>
      <div><span>Factura de origen</span><strong>${esc(note.invoice?.consecutive ?? "—")}</strong></div>
      <div><span>Fecha</span><strong>${esc(stamp(note.createdAt))}</strong></div>
      <div><span>Motivo</span><strong>${esc(note.reason ?? "—")}</strong></div>
      <div><span>Registrada por</span><strong>${esc(note.createdByUsername ?? "—")}</strong></div>
      <div><span>Comentarios</span><strong>${esc(note.notes || "—")}</strong></div>
    </section>
    <table>
      <thead><tr><th>Producto</th><th>Cantidad</th><th>Total (IVA incl.)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3">Esta devolución no tiene líneas.</td></tr>'}</tbody>
    </table>
    <section class="totals"><div>
      <p class="total"><span>Total devolución</span><strong>${money(note.total)}</strong></p>
      <p><span>Reduce la deuda de la factura</span><strong>${money(applied)}</strong></p>
      <p><span>Dinero devuelto</span><strong>${money(refunded)}</strong></p>
      <p><span>Saldo a favor del cliente</span><strong>${money(advance)}</strong></p>
    </div></section>
    <p class="foot">Documento generado desde el módulo de devoluciones · Mundo Tienda ERP</p>
  </main>`;
  return body;
}

export function buildReturnNoteDocument(note) {
  return sheetDocument(`Nota crédito ${note.consecutive}`, buildReturnNoteHtml(note));
}

export function printReturnNote(note) {
  return openSheetWindow(`Nota crédito ${note.consecutive}`, buildReturnNoteHtml(note));
}
