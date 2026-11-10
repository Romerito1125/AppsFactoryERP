import { useState } from "react";

function parseDecimal(value) {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function displayValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "";
  return String(Math.round(amount * 100) / 100);
}

/** Input monetario para saldos que pueden tener hasta dos decimales. */
export function DecimalInput({ value, onChange, onBlur, onFocus, ...rest }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => displayValue(value));
  const shown = editing ? draft : displayValue(value);

  return (
    <input
      {...rest}
      inputMode="decimal"
      value={shown}
      onFocus={(event) => {
        setEditing(true);
        setDraft(displayValue(value));
        event.target.select();
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^\d.,-]/g, "");
        setDraft(raw);
        onChange?.(parseDecimal(raw));
      }}
      onBlur={(event) => {
        setEditing(false);
        setDraft(displayValue(parseDecimal(event.target.value)));
        onBlur?.(event);
      }}
    />
  );
}

