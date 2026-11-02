// Navegación con teclado para tablas de facturación: Enter confirma el campo
// actual (los inputs son controlados, el valor ya está guardado en el estado)
// y mueve el foco al siguiente recuadro dentro del mismo contenedor.
const FIELD_SELECTOR = [
  "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([disabled]):not([readonly])",
  "select:not([disabled])",
].join(",");

function visibleFields(root) {
  return [...root.querySelectorAll(FIELD_SELECTOR)].filter(
    (element) => element.tabIndex !== -1 && element.offsetParent !== null,
  );
}

export function advanceFrom(element, { scope = "[data-enter-scope]", onLast } = {}) {
  const root = element?.closest?.(scope);
  if (!root) return false;
  const fields = visibleFields(root);
  const index = fields.indexOf(element);
  if (index < 0) return false;
  const next = fields[index + 1];
  if (next) {
    next.focus();
    if (typeof next.select === "function" && next.type !== "date") next.select();
    return true;
  }
  onLast?.(element);
  return Boolean(onLast);
}

// Úsalo como onKeyDown de un contenedor `data-enter-scope` o de un campo.
export function handleEnterAdvance(event, options) {
  if (event.key !== "Enter" || event.defaultPrevented) return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.nativeEvent?.isComposing) {
    return false;
  }
  const target = event.target;
  if (!target?.matches?.(FIELD_SELECTOR)) return false;
  event.preventDefault();
  return advanceFrom(target, options);
}
