import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import {
  getPriceLevel,
  grossFromNet,
  grossPriceFromMargin,
  marginPercent,
  netFromGross,
  roundMoney,
} from "@/lib/commercial-pricing";
import { advanceFrom } from "@/lib/enter-advance";
import "./price-update-dialog.css";
import { formatCop } from "@/lib/cop";
import { CopInput } from "@/components/money/cop-input";

const LEVELS = [0, 1, 2, 3];

// Formato de la captura Saint: 483,33 · 12,12 %
function parseDecimal(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// En COP los precios son enteros: sin centavos ni coma decimal.
const asText = (value) => (value > 0 ? String(Math.round(value)) : "");

function catalogGross(product, level) {
  const price = (product?.prices ?? []).find(
    (entry) =>
      entry?.isActive !== false &&
      entry?.deletedAt == null &&
      getPriceLevel(entry) === level,
  );
  return price ? grossFromNet(Number(price.price), product?.taxRate) : 0;
}

/**
 * «PRECIOS DEL PRODUCTO» (capturas C24/C25 de Saint). Por cada nivel:
 * Muestra y edita valores con IVA: costo anterior, costo nuevo, Precio 0–3 y utilidad.
 * La conversión a neto se hace internamente al guardar en el catálogo.
 */
export function PriceUpdateDialog({
  product,
  previousCost,
  newCost,
  pendingPrices,
  onAccept,
  onCancel,
}) {
  const taxRate = Number(product?.taxRate ?? 0);
  const initialCostNet = netFromGross(Number(newCost ?? 0), taxRate);
  const [newCostText, setNewCostText] = useState(asText(Number(newCost ?? 0)));
  const parsedNewCost = parseDecimal(newCostText);
  const costNet =
    parsedNewCost !== null && parsedNewCost > 0
      ? netFromGross(parsedNewCost, taxRate)
      : 0;
  const baseline = useMemo(
    () => LEVELS.map((level) => catalogGross(product, level)),
    [product],
  );
  const [rows, setRows] = useState(() =>
    LEVELS.map((level, index) => {
      const gross = pendingPrices?.[level] > 0 ? Number(pendingPrices[level]) : baseline[index];
      const net = gross > 0 ? netFromGross(gross, taxRate) : 0;
      return {
        level,
        gross: asText(gross),
        percent:
          net > 0 && initialCostNet > 0
            ? String(marginPercent(initialCostNet, net) ?? "").replace(".", ",")
            : "",
      };
    }),
  );
  const rootRef = useRef(null);

  useEffect(() => {
    setRows((current) =>
      current.map((row) => {
        const gross = parseDecimal(row.gross);
        const net = gross !== null && gross > 0 ? netFromGross(gross, taxRate) : 0;
        return {
          ...row,
          percent:
            net > 0 && costNet > 0
              ? String(marginPercent(costNet, net) ?? "").replace(".", ",")
              : "",
        };
      }),
    );
  }, [costNet, taxRate]);

  useEffect(() => {
    const first = rootRef.current?.querySelector("input");
    first?.focus();
    first?.select();
  }, []);

  function update(level, field, rawValue) {
    if (!/^-?\d*([.,]\d{0,4})?$/.test(rawValue)) return;
    const parsed = parseDecimal(rawValue);
    setRows((current) =>
      current.map((row) => {
        if (row.level !== level) return row;
        if (parsed === null || parsed <= 0) return { ...row, [field]: rawValue };
        if (field === "percent") {
          const nextGross = grossPriceFromMargin(costNet, parsed, taxRate);
          return {
            ...row,
            percent: rawValue,
            gross: asText(nextGross),
          };
        }
        const nextNet = netFromGross(parsed, taxRate);
        return {
          ...row,
          gross: rawValue,
          percent:
            costNet > 0
              ? String(marginPercent(costNet, nextNet) ?? "").replace(".", ",")
              : "",
        };
      }),
    );
  }

  function accept() {
    const values = {};
    rows.forEach((row) => {
      const gross = parseDecimal(row.gross);
      values[row.level] = gross !== null && gross > 0 ? roundMoney(gross) : null;
    });
    onAccept(
      values,
      parsedNewCost !== null && parsedNewCost > 0 ? roundMoney(parsedNewCost) : null,
    );
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.target.tagName === "BUTTON") {
      event.target.click();
      return;
    }
    advanceFrom(event.target, { scope: "[data-price-dialog]", onLast: accept });
  }

  return (
    <div className="module-dialog-backdrop price-dialog-backdrop">
      <section
        ref={rootRef}
        data-price-dialog
        className="module-dialog price-update-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Precios del producto"
        onKeyDown={handleKeyDown}
      >
        <header className="module-dialog-titlebar price-dialog-title">
          <strong>PRECIOS DEL PRODUCTO</strong>
          <button type="button" onClick={onCancel} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="price-dialog-body">
          <div className="price-dialog-costs">
            <span>Costo anterior</span>
            <output>{formatCop(previousCost)}</output>
            <span>Costo nuevo</span>
            <CopInput
              aria-label="Costo nuevo con IVA"
              value={parsedNewCost ?? 0}
              onChange={(value) => setNewCostText(String(value))}
            />
          </div>
          <div className="price-dialog-grid">
            <span />
            <b>Precio con IVA</b>
            <b>% Utilidad</b>
            {rows.map((row) => {
              return [
                <span key={`l${row.level}`} className="price-dialog-level">
                  Precio {row.level}
                </span>,
                <CopInput
                  key={`p${row.level}`}
                  className="price-dialog-prev"
                  aria-label={`Precio ${row.level} con IVA`}
                  value={parseDecimal(row.gross) ?? 0}
                  onChange={(value) => update(row.level, "gross", String(value))}
                />,
                <input
                  key={`u${row.level}`}
                  inputMode="decimal"
                  aria-label={`Utilidad del Precio ${row.level}`}
                  value={row.percent}
                  onChange={(event) => update(row.level, "percent", event.target.value)}
                />,
              ];
            })}
          </div>
        </div>
        <div className="price-dialog-actions">
          <button type="button" onClick={accept}>
            <span className="price-dialog-icon"><Check size={12} /></span> Aceptar
          </button>
          <button type="button" onClick={onCancel}>
            <span className="price-dialog-icon"><X size={12} /></span> Cancelar
          </button>
        </div>
      </section>
    </div>
  );
}
