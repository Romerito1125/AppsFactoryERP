import { useLayoutEffect, useRef, useState } from "react";

import { caretFromDigitCount, formatCopDraft, readCopInput } from "@/lib/cop";
import "./cop-input.css";

const DECIMAL_MESSAGE = "En COP no se usan centavos. Escribe pesos enteros.";

/**
 * Input de dinero en COP. Agrega los puntos de miles mientras se escribe.
 * - Solo acepta dígitos (y "-" al inicio si allowNegative).
 * - La coma indica centavos: se bloquea junto con las cifras que siguen.
 * - El punto es separador de miles y se ignora al escribir.
 * - Al pegar se limpia "$ 1.234.567,00" → 1.234.567; un pegado con centavos se rechaza.
 * - Recibe y entrega el valor como número entero.
 */
export function CopInput({
  value,
  onChange,
  allowNegative = false,
  onKeyDown,
  onBlur,
  onFocus,
  className = "",
  ...rest
}) {
  const inputRef = useRef(null);
  const caretRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [decimalBlocked, setDecimalBlocked] = useState(false);
  const [error, setError] = useState("");

  const shown = editing ? draft : formatCopDraft(value, { allowNegative });

  useLayoutEffect(() => {
    if (caretRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  function handleFocus(event) {
    setEditing(true);
    setDraft(shown);
    setError("");
    event.target.select();
    onFocus?.(event);
  }

  function handleBlur(event) {
    setEditing(false);
    setDecimalBlocked(false);
    setError("");
    onBlur?.(event);
  }

  function handleKeyDown(event) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Teclas de control (Enter, Tab, flechas, Supr, Retroceso) pasan sin cambios.
    if (event.key.length !== 1) return;

    if (/\d/.test(event.key)) {
      if (decimalBlocked) event.preventDefault();
      return;
    }
    // La coma y el punto marcan centavos al escribir: se bloquean con su cifra siguiente.
    // Los puntos de miles aparecen solos, así que el usuario nunca necesita escribirlos.
    if (event.key === "," || event.key === ".") {
      event.preventDefault();
      setDecimalBlocked(true);
      setError(DECIMAL_MESSAGE);
      return;
    }
    if (allowNegative && event.key === "-" && event.currentTarget.selectionStart === 0) {
      return;
    }
    event.preventDefault();
  }

  function handleChange(event) {
    const raw = event.target.value;
    const inputType = event.nativeEvent?.inputType ?? "";
    const strict = inputType === "insertFromPaste" || inputType === "insertFromDrop";
    const read = readCopInput(raw, { allowNegative, strict });
    if (read.hasDecimals) {
      setError(DECIMAL_MESSAGE);
      setDraft(draft);
      return;
    }
    const formatted =
      read.negative && read.digits === ""
        ? "-"
        : formatCopDraft(read.value, { allowNegative });
    const caret = event.target.selectionStart ?? raw.length;
    const digitsLeft = Math.min(
      raw.slice(0, caret).replace(/\D/g, "").length,
      read.digits.length,
    );
    caretRef.current = caretFromDigitCount(formatted, digitsLeft);
    setError("");
    setDraft(formatted);
    onChange?.(read.value);
  }

  return (
    <>
      <input
        ref={inputRef}
        inputMode="numeric"
        autoComplete="off"
        className={`cop-input ${error ? "is-invalid" : ""} ${className}`.trim()}
        value={shown}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...rest}
      />
      {error && (
        <span className="cop-input-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
