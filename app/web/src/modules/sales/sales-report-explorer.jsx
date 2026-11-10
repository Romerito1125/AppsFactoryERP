import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, Filter, GitCompareArrows, RotateCcw, Search } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { formatCop } from "@/lib/cop";
import {
  EXPLORER_DIMENSIONS,
  EXPLORER_INITIAL_FILTERS,
  buildSalesLines,
  crossSalesLines,
  distinctValues,
  explorerRange,
  filterSalesLines,
  groupSalesLines,
} from "./sales-explorer-data";
import "./sales-report-explorer.css";

// Filtros que se muestran como listas desplegables, con sus valores tomados de las ventas.
const SELECT_FILTERS = [
  ["neighborhood", "Barrio"],
  ["brand", "Marca"],
  ["provider", "Empresa / proveedor"],
  ["productType", "Tipo de producto"],
  ["client", "Cliente"],
  ["clientType", "Tipo de cliente"],
  ["seller", "Vendedor"],
  ["warehouse", "Bodega"],
  ["source", "Origen"],
  ["saleMode", "Forma de pago"],
];

const PRESETS = [
  { label: "Marcas más vendidas", groupBy: "brand", crossBy: "" },
  { label: "Ventas por barrio", groupBy: "neighborhood", crossBy: "" },
  { label: "Empresas / proveedores", groupBy: "provider", crossBy: "" },
  { label: "Barrio × marca", groupBy: "neighborhood", crossBy: "brand" },
  { label: "Empresa × barrio", groupBy: "provider", crossBy: "neighborhood" },
  { label: "Marca × día de la semana", groupBy: "brand", crossBy: "weekday" },
];

const dimensionLabel = (id) => EXPLORER_DIMENSIONS.find((dimension) => dimension.id === id)?.label ?? id;
const formatUnits = (value) => Number(value ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 2 });

function frequencyLabel(everyDays) {
  if (everyDays === null || everyDays === undefined) return "—";
  if (everyDays <= 1) return "Varias veces al día";
  return `1 cada ${everyDays.toLocaleString("es-CO", { maximumFractionDigits: 1 })} días`;
}

function downloadCsv(fileName, headers, rows) {
  const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function SalesReportExplorer({ invoices = [] }) {
  const [filters, setFilters] = useState(EXPLORER_INITIAL_FILTERS);
  const [groupBy, setGroupBy] = useState("brand");
  const [crossBy, setCrossBy] = useState("");
  const [crossMetric, setCrossMetric] = useState("sales");
  const [providersById, setProvidersById] = useState(() => new Map());

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getAllPages("/proveedores")
      .then((providers) => {
        if (!cancelled) setProvidersById(new Map(providers.map((provider) => [Number(provider.id), provider.name])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const allLines = useMemo(() => buildSalesLines(invoices, { providersById }), [invoices, providersById]);
  const range = useMemo(() => explorerRange(filters), [filters]);
  const lines = useMemo(() => filterSalesLines(allLines, filters, range), [allLines, filters, range]);
  const options = useMemo(
    () => Object.fromEntries(SELECT_FILTERS.map(([key]) => [key, distinctValues(allLines, key)])),
    [allLines],
  );
  const grouped = useMemo(() => groupSalesLines(lines, groupBy, range), [lines, groupBy, range]);
  const cross = useMemo(
    () => (crossBy && crossBy !== groupBy ? crossSalesLines(lines, groupBy, crossBy, crossMetric) : null),
    [lines, groupBy, crossBy, crossMetric],
  );
  const kpis = useMemo(() => {
    const invoiceIds = new Set(lines.map((line) => line.invoiceId));
    const clientIds = new Set(lines.map((line) => line.clientId ?? line.client));
    return {
      sales: lines.reduce((sum, line) => sum + line.total, 0),
      units: lines.reduce((sum, line) => sum + line.units, 0),
      profit: lines.reduce((sum, line) => sum + line.profit, 0),
      invoices: invoiceIds.size,
      clients: clientIds.size,
    };
  }, [lines]);
  const activeFilters = SELECT_FILTERS.filter(([key]) => filters[key] !== "ALL").length + (filters.query.trim() ? 1 : 0);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function applyPreset(preset) {
    setGroupBy(preset.groupBy);
    setCrossBy(preset.crossBy);
  }

  function exportCsv() {
    const stamp = range.label.replace(/\W+/g, "-").toLowerCase();
    if (cross) {
      downloadCsv(
        `ventas-${groupBy}-x-${crossBy}-${stamp}.csv`,
        [dimensionLabel(groupBy), ...cross.columns, "Total"],
        cross.rows.map((row) => [row.key, ...cross.columns.map((column) => row.values[column]), row.total]),
      );
      return;
    }
    downloadCsv(
      `ventas-por-${groupBy}-${stamp}.csv`,
      [dimensionLabel(groupBy), "Ventas", "Unidades", "Facturas", "Clientes", "Utilidad", "Participación %", "Frecuencia"],
      grouped.map((row) => [row.key, row.sales, row.units, row.invoices, row.clients, row.profit, row.share.toFixed(1), frequencyLabel(row.everyDays)]),
    );
  }

  const formatCell = (value) => (crossMetric === "sales" ? formatCop(value) : formatUnits(value));

  return (
    <div className="sales-explorer">
      <section className="sales-report-filter-panel">
        <div className="sales-report-filter-heading">
          <div><Filter size={15} /><strong>Filtra por cualquier dato</strong></div>
          <span>
            {lines.length} líneas · {kpis.invoices} facturas · {range.label}
            {activeFilters ? ` · ${activeFilters} filtro(s) activo(s)` : ""}
          </span>
        </div>
        <div className="sales-report-quick-filters" aria-label="Periodos rápidos">
          {[["TODAY", "Hoy"], ["7D", "7 días"], ["30D", "30 días"], ["90D", "90 días"], ["365D", "Año"], ["ALL", "Historial"]].map(([value, label]) => (
            <button key={value} type="button" className={filters.period === value ? "is-active" : ""} onClick={() => updateFilter("period", value)}>{label}</button>
          ))}
          <button type="button" className={filters.period === "CUSTOM" ? "is-active" : ""} onClick={() => updateFilter("period", "CUSTOM")}>
            <CalendarDays size={13} /> Rango personalizado
          </button>
          <button type="button" onClick={() => setFilters(EXPLORER_INITIAL_FILTERS)}>
            <RotateCcw size={13} /> Limpiar filtros
          </button>
        </div>
        <div className="sales-report-filters sales-explorer-filters">
          {filters.period === "CUSTOM" && (
            <>
              <label><span>Desde</span><input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
              <label><span>Hasta</span><input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
            </>
          )}
          <label>
            <span>Estado</span>
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="ACTIVA">Activas</option>
              <option value="ANULADA">Anuladas</option>
              <option value="ALL">Todas</option>
            </select>
          </label>
          {SELECT_FILTERS.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <select value={filters[key]} onChange={(event) => updateFilter(key, event.target.value)}>
                <option value="ALL">Todos</option>
                {options[key].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="sales-report-filter-search">
            <span>Buscar</span>
            <div>
              <Search size={14} />
              <input value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="Producto, cliente, factura, barrio…" />
            </div>
          </label>
        </div>
      </section>

      <section className="sales-explorer-kpis">
        <div><span>Ventas</span><strong>{formatCop(kpis.sales)}</strong></div>
        <div><span>Unidades</span><strong>{formatUnits(kpis.units)}</strong></div>
        <div><span>Facturas</span><strong>{kpis.invoices}</strong></div>
        <div><span>Clientes</span><strong>{kpis.clients}</strong></div>
        <div><span>Utilidad</span><strong>{formatCop(kpis.profit)}</strong></div>
      </section>

      <section className="sales-report-card sales-explorer-card">
        <div className="sales-explorer-controls">
          <label>
            <span>Agrupar por</span>
            <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
              {EXPLORER_DIMENSIONS.map((dimension) => (
                <option key={dimension.id} value={dimension.id}>{dimension.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span><GitCompareArrows size={13} /> Cruzar con</span>
            <select value={crossBy} onChange={(event) => setCrossBy(event.target.value)}>
              <option value="">Sin cruce</option>
              {EXPLORER_DIMENSIONS.filter((dimension) => dimension.id !== groupBy).map((dimension) => (
                <option key={dimension.id} value={dimension.id}>{dimension.label}</option>
              ))}
            </select>
          </label>
          {cross && (
            <label>
              <span>Medida</span>
              <select value={crossMetric} onChange={(event) => setCrossMetric(event.target.value)}>
                <option value="sales">Ventas</option>
                <option value="units">Unidades</option>
                <option value="invoices">Facturas (frecuencia)</option>
              </select>
            </label>
          )}
          <button type="button" className="sales-explorer-export" onClick={exportCsv} disabled={!lines.length}>
            <Download size={14} /> CSV
          </button>
        </div>
        <div className="sales-explorer-presets" aria-label="Reportes rápidos">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={groupBy === preset.groupBy && crossBy === preset.crossBy ? "is-active" : ""}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="sales-report-card-heading">
          <div>
            <span>{cross ? "CORRELACIÓN" : "RANKING"}</span>
            <strong>
              {cross
                ? `${dimensionLabel(groupBy)} × ${dimensionLabel(crossBy)}`
                : `Ventas por ${dimensionLabel(groupBy).toLowerCase()}`}
            </strong>
          </div>
          <span className="sales-report-card-meta">{range.label}</span>
        </div>

        <div className="sales-report-detail-scroll">
          {cross ? (
            <table className="sales-report-detail-table sales-explorer-table">
              <thead>
                <tr>
                  <th>{dimensionLabel(groupBy)}</th>
                  {cross.columns.map((column) => <th key={column} className="sales-report-number">{column}</th>)}
                  <th className="sales-report-number">Total</th>
                </tr>
              </thead>
              <tbody>
                {cross.rows.map((row) => {
                  const max = Math.max(...cross.columns.map((column) => row.values[column]), 1);
                  return (
                    <tr key={row.key}>
                      <td><strong>{row.key}</strong></td>
                      {cross.columns.map((column) => {
                        const value = row.values[column];
                        return (
                          <td
                            key={column}
                            className="sales-report-number sales-explorer-heat"
                            style={{ "--heat": value > 0 ? 0.12 + (value / max) * 0.55 : 0 }}
                          >
                            {value ? formatCell(value) : "—"}
                          </td>
                        );
                      })}
                      <td className="sales-report-number"><strong>{formatCell(row.total)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="sales-report-detail-table sales-explorer-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{dimensionLabel(groupBy)}</th>
                  <th className="sales-report-number">Ventas</th>
                  <th className="sales-report-number">Participación</th>
                  <th className="sales-report-number">Unidades</th>
                  <th className="sales-report-number">Facturas</th>
                  <th className="sales-report-number">Clientes</th>
                  <th>Frecuencia</th>
                  <th className="sales-report-number">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((row, index) => (
                  <tr key={row.key}>
                    <td>{index + 1}</td>
                    <td><strong>{row.key}</strong></td>
                    <td className="sales-report-number">{formatCop(row.sales)}</td>
                    <td className="sales-report-number">
                      <span className="sales-explorer-share"><i style={{ width: `${Math.min(100, row.share)}%` }} />{row.share.toFixed(1)}%</span>
                    </td>
                    <td className="sales-report-number">{formatUnits(row.units)}</td>
                    <td className="sales-report-number">{row.invoices}</td>
                    <td className="sales-report-number">{row.clients}</td>
                    <td>{frequencyLabel(row.everyDays)}</td>
                    <td className="sales-report-number">{formatCop(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!lines.length && <div className="sales-report-empty">No hay ventas con los filtros seleccionados.</div>}
        </div>
      </section>
    </div>
  );
}
