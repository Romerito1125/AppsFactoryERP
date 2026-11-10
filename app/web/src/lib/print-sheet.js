import { formatCop } from "./cop.js";

// Hoja imprimible común a Ventas y Compras: encabezado de marca, cajas de datos, tabla con
// encabezado azul, bloque de totales y pie. Se imprime o se guarda como PDF desde el navegador.

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

export const money = (value) => formatCop(Number(value ?? 0));

export const SHEET_CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #0d0d0d; background: #ececec; font: 13px Arial, sans-serif; }
  .sheet { border: 2px solid #2d2d2d; padding: 22px; background: #fdfdfd; }
  .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 4px solid #2d2d2d; padding-bottom: 14px; margin-bottom: 18px; }
  .brand { color: #111; font-size: 20px; font-weight: 700; }
  .type { text-align: right; color: #131313; font-size: 17px; font-weight: 700; }
  .type span { font-size: 13px; font-weight: 400; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
  .meta div { padding: 9px 10px; background: #f5f5f5; border-left: 4px solid #373737; }
  .meta span { display: block; color: #161616; font-size: 11px; margin-bottom: 3px; }
  .meta strong { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { padding: 9px 10px; text-align: left; color: #fff; background: #2f6aa6; }
  td { padding: 9px 10px; border-bottom: 1px solid #d5d5d5; }
  th:nth-child(n+3), td:nth-child(n+3) { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-top: 16px; }
  .totals div { min-width: 340px; padding: 12px; background: #f4f4f4; border: 1px solid #bbbbbb; }
  .totals p { display: flex; justify-content: space-between; gap: 16px; margin: 5px 0; }
  .totals .sub { padding-top: 6px; border-top: 1px solid #9a9a9a; font-weight: 700; }
  .totals .base { margin: 8px -6px; padding: 6px; color: #173b63; background: #eaf3fb; font-weight: 700; }
  .totals .ret { color: #9a2b2b; }
  .totals .total { padding-top: 9px; border-top: 2px solid #2d2d2d; font-size: 17px; font-weight: 700; color: #111; }
  .note { margin-top: 12px; color: #4a4a4a; font-size: 11px; }
  .foot { margin-top: 20px; color: #3b3b3b; font-size: 11px; }
`;

// Documento completo (con <title>, que el navegador usa como nombre sugerido del PDF).
export function sheetDocument(title, bodyHtml) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${SHEET_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

// Devuelve false si el navegador bloquea la ventana emergente.
export function openSheetWindow(title, bodyHtml) {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return false;
  popup.document.write(sheetDocument(title, bodyHtml));
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => {
    popup.print();
    popup.close();
  }, 250);
  return true;
}
