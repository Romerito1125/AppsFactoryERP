import { useState } from "react";
import { ChevronDown } from "lucide-react";

const statusOptions = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "inactivos", label: "Inactivos" },
];

export function SearchOptionsMenu({ value = "todos", onChange }) {
  const [open, setOpen] = useState(false);

  function selectOption(nextValue) {
    onChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div
      className="search-options-wrapper"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="search-options"
        aria-label="Opciones de búsqueda"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="search-options-menu" role="menu">
          {statusOptions.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              className={value === option.value ? "is-selected" : ""}
              key={option.value}
              onClick={() => selectOption(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
