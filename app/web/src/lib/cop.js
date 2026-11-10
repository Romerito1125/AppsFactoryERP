// Pesos colombianos (COP): todo precio, costo, saldo y monto del sistema es entero.
// Un solo lugar para leer y mostrar dinero; los módulos no deben tener formateadores propios.

export const COP_MAX_DIGITS = 12;

const CURRENCY_PREFIX = "$ ";

// 1234567 → "1.234.567"
export function groupThousands(digits) {
  return String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Lee lo que el usuario escribió o pegó y devuelve el valor entero en pesos.
// - Los puntos y espacios de miles se ignoran: "1.234.567" → 1234567.
// - Una cola decimal con ceros se descarta: "1.234.567,00" → 1234567.
// - Una cola decimal con cifras distintas de cero no es válida: "1,5" → hasDecimals.
// En modo normal (escritura, borrado) los separadores son de miles: "1.234.56" es un estado
// intermedio al borrar, no centavos. En modo estricto (pegado) una cola decimal sí se evalúa.
export function readCopInput(raw, { allowNegative = false, strict = false } = {}) {
  const text = String(raw ?? "").trim();
  const negative = allowNegative && /^-/.test(text);
  let body = text;
  let hasDecimals = false;
  const decimalTail = strict ? /[.,](\d{1,2})$/.exec(text) : null;
  if (decimalTail) {
    body = text.slice(0, decimalTail.index);
    hasDecimals = /[1-9]/.test(decimalTail[1]);
  }
  const digits = body
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, COP_MAX_DIGITS);
  const magnitude = digits ? Number(digits) : 0;
  return {
    value: negative ? -magnitude : magnitude,
    digits,
    negative,
    hasDecimals,
  };
}

// Texto que se muestra dentro del input mientras se escribe (sin símbolo).
export function formatCopDraft(value, { allowNegative = false } = {}) {
  const amount = Math.round(Number(value) || 0);
  if (amount === 0 && !(allowNegative && Object.is(amount, -0))) return "";
  const sign = amount < 0 ? "-" : "";
  return `${sign}${groupThousands(String(Math.abs(amount)))}`;
}

// Texto para pantallas, tickets y PDF: "$ 1.234.567".
export function formatCop(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? "-" : "";
  return `${sign}${CURRENCY_PREFIX}${groupThousands(String(Math.abs(amount)))}`;
}

// Formato de cartera: conserva hasta dos decimales cuando el saldo los tiene.
export function formatCopExact(value) {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  const decimals = Number.isInteger(amount) ? 0 : 2;
  const formatted = new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${amount < 0 ? "-" : ""}$ ${formatted}`;
}

// Posición del cursor en el texto formateado, dado cuántos dígitos había a su izquierda.
export function caretFromDigitCount(formatted, digitCount) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) {
      seen += 1;
      if (seen === digitCount) return index + 1;
    }
  }
  return formatted.length;
}
