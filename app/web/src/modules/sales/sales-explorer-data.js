// Explorador de ventas: convierte las facturas en líneas (una por producto vendido) para filtrar
// por cualquier dato (barrio, marca, empresa, vendedor…) y cruzar dos dimensiones entre sí.

export const EXPLORER_DIMENSIONS = [
  { id: "neighborhood", label: "Barrio" },
  { id: "brand", label: "Marca" },
  { id: "provider", label: "Empresa / proveedor" },
  { id: "productType", label: "Tipo de producto" },
  { id: "product", label: "Producto" },
  { id: "client", label: "Cliente" },
  { id: "clientType", label: "Tipo de cliente" },
  { id: "seller", label: "Vendedor" },
  { id: "warehouse", label: "Bodega" },
  { id: "source", label: "Origen" },
  { id: "saleMode", label: "Forma de pago" },
  { id: "weekday", label: "Día de la semana" },
  { id: "month", label: "Mes" },
];

// Filtros de igualdad: cada uno coincide con una dimensión de la línea.
export const EXPLORER_FILTER_KEYS = [
  "source",
  "saleMode",
  "warehouse",
  "seller",
  "client",
  "neighborhood",
  "clientType",
  "brand",
  "provider",
  "productType",
];

export const EXPLORER_INITIAL_FILTERS = {
  period: "30D",
  from: "",
  to: "",
  status: "ACTIVA",
  query: "",
  ...Object.fromEntries(EXPLORER_FILTER_KEYS.map((key) => [key, "ALL"])),
};

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const SOURCE_LABELS = { ADMIN: "Administrativo", POS: "POS", APP_MOVIL: "App móvil" };
const NONE = "Sin dato";
const DAY = 86_400_000;

const text = (value) => {
  const clean = String(value ?? "").trim();
  return clean || NONE;
};

const personName = (client) =>
  client ? [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || client.identification || NONE : "Consumidor final";

const sellerName = (invoice) =>
  invoice.sellerUsername ?? invoice.createdByUsername ?? invoice.createdByUser?.username ?? "Sin vendedor";

function lineProfit(item) {
  const explicit = Number(item.profitAmount);
  if (Number.isFinite(explicit) && explicit !== 0) return explicit;
  return Number(item.total ?? 0) - Number(item.unitCost ?? 0) * Number(item.quantity ?? 0);
}

/** Una línea por producto vendido, con todos los datos por los que se puede filtrar o agrupar. */
export function buildSalesLines(invoices, { providersById = new Map() } = {}) {
  const lines = [];
  for (const invoice of invoices ?? []) {
    const date = new Date(invoice.createdAt);
    const client = invoice.client;
    const base = {
      invoiceId: invoice.id,
      consecutive: invoice.consecutive,
      date,
      status: invoice.status,
      source: SOURCE_LABELS[invoice.source] ?? text(invoice.source),
      saleMode: invoice.saleMode === "CREDITO" ? "Crédito" : "Contado",
      clientId: invoice.clientId ?? client?.id ?? null,
      client: personName(client),
      neighborhood: text(client?.neighborhood),
      clientType: client?.clientType === "MAYORISTA" ? "Mayorista" : client?.clientType === "MINORISTA" ? "Minorista" : NONE,
      seller: sellerName(invoice),
      weekday: Number.isNaN(date.getTime()) ? NONE : WEEKDAYS[date.getDay()],
      month: Number.isNaN(date.getTime())
        ? NONE
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    };
    for (const item of invoice.items ?? []) {
      const product = item.product ?? {};
      const providerId = product.providerId ?? null;
      lines.push({
        ...base,
        warehouse: text(item.warehouse?.location ?? invoice.warehouse?.location),
        productId: item.productId ?? product.id ?? null,
        product: text(product.name),
        brand: text(product.brand),
        provider: text(providersById.get(Number(providerId)) ?? (providerId ? `Proveedor #${providerId}` : "")),
        productType: text(product.productType?.name),
        units: Number(item.quantity ?? 0),
        total: Number(item.total ?? 0),
        profit: lineProfit(item),
      });
    }
  }
  return lines;
}

export function explorerRange(filters, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (filters.period === "CUSTOM") {
    const start = filters.from ? new Date(`${filters.from}T00:00:00`) : new Date(0);
    const customEnd = filters.to ? new Date(`${filters.to}T23:59:59`) : end;
    return { start, end: customEnd, label: `${filters.from || "inicio"} · ${filters.to || "hoy"}` };
  }
  if (filters.period === "ALL") return { start: new Date(0), end, label: "Todo el historial" };
  const days = { TODAY: 0, "7D": 6, "30D": 29, "90D": 89, "365D": 364 }[filters.period] ?? 29;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  const labels = { TODAY: "Hoy", "7D": "Últimos 7 días", "30D": "Últimos 30 días", "90D": "Últimos 90 días", "365D": "Último año" };
  return { start, end, label: labels[filters.period] ?? "Periodo seleccionado" };
}

export function filterSalesLines(lines, filters, range) {
  const query = String(filters.query ?? "").trim().toLowerCase();
  return lines.filter((line) => {
    if (range && (line.date < range.start || line.date > range.end)) return false;
    if (filters.status && filters.status !== "ALL" && line.status !== filters.status) return false;
    for (const key of EXPLORER_FILTER_KEYS) {
      const wanted = filters[key];
      if (wanted && wanted !== "ALL" && String(line[key]) !== String(wanted)) return false;
    }
    if (
      query &&
      !`${line.consecutive} ${line.client} ${line.product} ${line.brand} ${line.provider} ${line.neighborhood}`
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    return true;
  });
}

/** Valores posibles de una dimensión, ordenados alfabéticamente (para los filtros). */
export function distinctValues(lines, dimension) {
  return [...new Set(lines.map((line) => line[dimension]))]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .sort((left, right) => String(left).localeCompare(String(right), "es"));
}

function spanDays(lines, range) {
  if (!lines.length) return 1;
  const first = Math.min(...lines.map((line) => line.date.getTime()));
  const start = Math.max(first, range?.start?.getTime?.() ?? first);
  const end = Math.min(range?.end?.getTime?.() ?? Date.now(), Date.now());
  return Math.max(1, Math.ceil((end - start) / DAY));
}

/**
 * Agrupa por una dimensión: ventas, unidades, utilidad, facturas distintas (frecuencia),
 * clientes distintos, participación y cada cuántos días se vende.
 */
export function groupSalesLines(lines, dimension, range) {
  const totalSales = lines.reduce((sum, line) => sum + line.total, 0);
  const days = spanDays(lines, range);
  const groups = new Map();
  for (const line of lines) {
    const key = line[dimension] ?? NONE;
    const group = groups.get(key) ?? { key, sales: 0, units: 0, profit: 0, invoiceIds: new Set(), clientIds: new Set(), dates: new Set() };
    group.sales += line.total;
    group.units += line.units;
    group.profit += line.profit;
    group.invoiceIds.add(line.invoiceId);
    group.clientIds.add(line.clientId ?? line.client);
    group.dates.add(line.date.toDateString());
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      sales: Math.round(group.sales),
      units: Math.round(group.units * 100) / 100,
      profit: Math.round(group.profit),
      invoices: group.invoiceIds.size,
      clients: group.clientIds.size,
      activeDays: group.dates.size,
      share: totalSales > 0 ? (group.sales / totalSales) * 100 : 0,
      everyDays: group.invoiceIds.size > 0 ? days / group.invoiceIds.size : null,
    }))
    .sort((left, right) => right.sales - left.sales);
}

const METRIC_OF = {
  sales: (line) => line.total,
  units: (line) => line.units,
};

/**
 * Cruce de dos dimensiones (filas × columnas) con la medida elegida. Las columnas se limitan a las
 * de mayor venta; el resto se suma en «Otros» para no perder valor.
 */
export function crossSalesLines(lines, rowDimension, columnDimension, metric = "sales", limit = 8) {
  const columnRank = groupSalesLines(lines, columnDimension).map((row) => row.key);
  const top = columnRank.slice(0, limit);
  const hasOthers = columnRank.length > limit;
  const columns = hasOthers ? [...top, "Otros"] : top;
  const topSet = new Set(top);
  const rows = new Map();
  for (const line of lines) {
    const rowKey = line[rowDimension] ?? NONE;
    const columnKey = topSet.has(line[columnDimension]) ? line[columnDimension] : "Otros";
    const row = rows.get(rowKey) ?? { key: rowKey, cells: new Map(), total: 0 };
    const cell = row.cells.get(columnKey) ?? { value: 0, invoiceIds: new Set() };
    if (metric === "invoices") cell.invoiceIds.add(line.invoiceId);
    else cell.value += METRIC_OF[metric](line);
    row.cells.set(columnKey, cell);
    rows.set(rowKey, row);
  }
  const result = [...rows.values()].map((row) => {
    const values = Object.fromEntries(
      columns.map((column) => {
        const cell = row.cells.get(column);
        const value = !cell ? 0 : metric === "invoices" ? cell.invoiceIds.size : cell.value;
        return [column, metric === "units" ? Math.round(value * 100) / 100 : Math.round(value)];
      }),
    );
    const total =
      metric === "invoices"
        ? new Set([...row.cells.values()].flatMap((cell) => [...cell.invoiceIds])).size
        : Object.values(values).reduce((sum, value) => sum + value, 0);
    return { key: row.key, values, total };
  });
  result.sort((left, right) => right.total - left.total);
  return { columns, rows: result };
}
