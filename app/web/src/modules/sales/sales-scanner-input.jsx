const SCANNER_SELECTOR = "[data-sales-scanner]";

// Lleva el foco a la fila de captura de código de la tabla de facturación
// (tras editar una cantidad, cerrar una consulta o agregar un producto).
export function focusSalesScanner() {
  const input = globalThis.document?.querySelector(SCANNER_SELECTOR);
  if (input && !input.disabled) input.focus();
}
