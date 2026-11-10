import { HttpException } from '@nestjs/common';
import { tool, type RunContext } from '@openai/agents';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { z } from 'zod';
import { Role } from '../../common/enums/role.enum';
import { AnticiposService } from '../anticipos/anticipos.service';
import {
  CreateAdvanceDto,
  ListAdvancesQueryDto,
} from '../anticipos/dto/advance.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ListAuditLogQueryDto } from '../audit-log/dto/list-audit-log-query.dto';
import { BodegasService } from '../bodegas/bodegas.service';
import { FilterWarehousesDto } from '../bodegas/dto/filter-warehouses.dto';
import { ClientesService } from '../clientes/clientes.service';
import { CreateClientDto } from '../clientes/dto/create-client.dto';
import { FilterClientsDto } from '../clientes/dto/filter-clients.dto';
import { UpdateClientDto } from '../clientes/dto/update-client.dto';
import { ComprasService } from '../compras/compras.service';
import { CreatePurchaseOrderDto } from '../compras/dto/create-purchase-order.dto';
import { CreatePurchasePaymentDto } from '../compras/dto/create-purchase-payment.dto';
import { ListPurchaseOrdersQueryDto } from '../compras/dto/list-purchase-orders-query.dto';
import { PurchaseReportQueryDto } from '../compras/dto/purchase-report-query.dto';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';
import { CreateQuoteDto } from '../cotizaciones/dto/quote.dto';
import { ListQuotesQueryDto } from '../cotizaciones/dto/list-quotes-query.dto';
import { CreditosService } from '../creditos/creditos.service';
import { CreateCreditPaymentDto } from '../creditos/dto/credit.dto';
import { ListCreditsQueryDto } from '../creditos/dto/list-credits-query.dto';
import { CuentasBancariasService } from '../cuentas-bancarias/cuentas-bancarias.service';
import {
  BankAmountDto,
  BankTransferDto,
} from '../cuentas-bancarias/dto/bank-account.dto';
import { FilterBankAccountsDto } from '../cuentas-bancarias/dto/filter-bank-accounts.dto';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { CreateDeliveryDto } from '../deliveries/dto/create-delivery.dto';
import { ListDeliveriesQueryDto } from '../deliveries/dto/list-deliveries-query.dto';
import { UpdateDeliveryStatusDto } from '../deliveries/dto/update-delivery-status.dto';
import { DevolucionesService } from '../devoluciones/devoluciones.service';
import {
  CreateReturnDto,
  ListReturnsQueryDto,
} from '../devoluciones/dto/return.dto';
import { CreateInvoiceDto } from '../facturas/dto/create-invoice.dto';
import { ListInvoicesQueryDto } from '../facturas/dto/list-invoices-query.dto';
import { FacturasService } from '../facturas/facturas.service';
import {
  InventoryAdjustmentDto,
  InventoryEntryDto,
  InventoryExitDto,
  InventoryTransferDto,
} from '../inventario/dto/inventory-movement.dto';
import { ListInventoryQueryDto } from '../inventario/dto/list-inventory-query.dto';
import { InventarioService } from '../inventario/inventario.service';
import { ListBankMovementsQueryDto } from '../movimientos-bancarios/dto/list-bank-movements-query.dto';
import { MovimientosBancariosService } from '../movimientos-bancarios/movimientos-bancarios.service';
import { FilterOffersDto } from '../ofertas/dto/filter-offers.dto';
import { OfertasService } from '../ofertas/ofertas.service';
import { FilterProductsDto } from '../productos/dto/filter-products.dto';
import { ProfitProductsQueryDto } from '../productos/dto/profit-products-query.dto';
import { ProductProfitService } from '../productos/product-profit.service';
import { ProductosService } from '../productos/productos.service';
import { CreateProviderDto } from '../proveedores/dto/create-provider.dto';
import { FilterProvidersDto } from '../proveedores/dto/filter-providers.dto';
import { ProveedoresService } from '../proveedores/proveedores.service';
import {
  CreateReceiptDto,
  ListReceiptsQueryDto,
  StatementQueryDto,
} from '../recibos/dto/receipt.dto';
import { RecibosService } from '../recibos/recibos.service';
import { FilterRetentionsDto } from '../retenciones/dto/filter-retentions.dto';
import { RetencionesService } from '../retenciones/retenciones.service';
import { ListUsersQueryDto } from '../usuarios/dto/list-users-query.dto';
import { UsuariosService } from '../usuarios/usuarios.service';
import {
  accessDenial,
  type MundiAccessRule,
  type MundiRunContext,
} from './mundi-access';

/** Servicios de negocio que Mundi usa. Nunca hace SQL directo. */
export interface MundiServices {
  audit: AuditLogService;
  facturas: FacturasService;
  clientes: ClientesService;
  productos: ProductosService;
  productProfit: ProductProfitService;
  inventario: InventarioService;
  bodegas: BodegasService;
  compras: ComprasService;
  proveedores: ProveedoresService;
  cuentasBancarias: CuentasBancariasService;
  movimientosBancarios: MovimientosBancariosService;
  recibos: RecibosService;
  creditos: CreditosService;
  anticipos: AnticiposService;
  devoluciones: DevolucionesService;
  cotizaciones: CotizacionesService;
  deliveries: DeliveriesService;
  retenciones: RetencionesService;
  ofertas: OfertasService;
  usuarios: UsuariosService;
}

type AnyZodObject = z.ZodObject<z.ZodRawShape>;

export interface MundiToolSpec<S extends AnyZodObject = AnyZodObject> {
  name: string;
  /** Texto corto en español para la interfaz ("Crear factura"). */
  label: string;
  /** Módulo del ERP para la auditoría. */
  module: string;
  /** true = escribe datos: pide confirmación y queda en auditoría. */
  write?: boolean;
  access: MundiAccessRule;
  description: string;
  parameters: S;
  /** Resumen legible para la tarjeta de confirmación. */
  summarize?: (input: z.infer<S>) => string;
  run: (input: z.infer<S>, ctx: MundiRunContext) => Promise<unknown>;
}

function defineTool<S extends AnyZodObject>(spec: MundiToolSpec<S>) {
  return spec as unknown as MundiToolSpec;
}

// En modo estricto todos los campos son obligatorios: lo opcional se declara
// como nullable y luego se limpia antes de construir el DTO real.
const opt = <T extends z.ZodTypeAny>(schema: T) => schema.nullable();
const id = (description: string) => z.number().int().positive().describe(description);
const page = opt(z.number().int().min(1)).describe('Página (desde 1).');
const limit = opt(z.number().int().min(1).max(100)).describe(
  'Registros por página (por defecto 20).',
);
const search = opt(z.string()).describe('Texto a buscar.');
const estado = opt(z.enum(['activos', 'inactivos', 'todos'])).describe(
  'Estado del registro (por defecto activos).',
);
const isoDate = (description: string) =>
  opt(z.string()).describe(`${description} Formato AAAA-MM-DD.`);
const unit = opt(
  z.enum(['UND', 'KG', 'G', 'LB', 'L', 'ML', 'CAJA', 'PAQUETE']),
).describe('Unidad (por defecto la del producto).');

/** Quita null/undefined recursivamente para que el DTO vea campos ausentes. */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripNulls) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null || item === undefined) continue;
      out[key] = stripNulls(item);
    }
    return out as T;
  }
  return value;
}

export class MundiValidationError extends Error {}

function flattenErrors(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map(
      (message) => `${path}: ${message}`,
    );
    return [...own, ...flattenErrors(error.children ?? [], path)];
  });
}

/** Igual que el ValidationPipe global (whitelist + transform). */
export async function toDto<T extends object>(
  cls: new () => T,
  plain: object,
): Promise<T> {
  const instance = plainToInstance(cls, stripNulls(plain));
  const errors = await validate(instance, { whitelist: true });
  if (errors.length) {
    throw new MundiValidationError(flattenErrors(errors).join('; '));
  }
  return instance;
}

function paging(input: { page?: number | null; limit?: number | null }) {
  return { page: input.page ?? 1, limit: input.limit ?? 20 };
}

const OMITTED_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'supportData',
  'documentData',
  'paymentSupportData',
]);

/** Convierte la respuesta de un servicio en texto compacto para el modelo. */
export function toToolOutput(value: unknown, maxLength = 24_000) {
  const json = JSON.stringify(value ?? null, (key, item: unknown) => {
    if (OMITTED_KEYS.has(key)) return undefined;
    if (typeof item === 'bigint') return Number(item);
    if (typeof item === 'string' && item.startsWith('data:') && item.length > 200) {
      return '[archivo adjunto omitido]';
    }
    return item;
  });
  if (json.length <= maxLength) return json;
  return `${json.slice(0, maxLength)}… [respuesta recortada: pide una página más pequeña o filtra mejor]`;
}

export function errorMessage(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { message?: string | string[] } | string;
    if (typeof response === 'string') return response;
    if (Array.isArray(response?.message)) return response.message.join('; ');
    return response?.message ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

const SALES_ROLES = [Role.ADMIN, Role.CAJERO, Role.VENDEDOR, Role.CONTADOR];
const PURCHASE_ROLES = [Role.ADMIN, Role.CONTADOR, Role.BODEGA];
const BANK_ROLES = [Role.ADMIN, Role.CAJERO, Role.CONTADOR];

type InvoiceLike = {
  id: number;
  consecutive?: string;
  createdAt: Date | string;
  total: unknown;
  subtotal?: unknown;
  taxes?: unknown;
  saleMode?: string;
  status?: string;
  client?: { firstName?: string; lastName?: string } | null;
  items?: Array<{
    productId: number;
    quantity: unknown;
    total: unknown;
    product?: { name?: string } | null;
  }>;
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Reporte de ventas por rango de fechas a partir del listado de facturas
 * (ordenado por id descendente), sin consultas SQL propias.
 */
async function salesReport(
  services: MundiServices,
  ctx: MundiRunContext,
  from: Date,
  to: Date,
) {
  const invoices: InvoiceLike[] = [];
  let truncated = false;
  for (let pageNumber = 1; pageNumber <= 40; pageNumber += 1) {
    const query = await toDto(ListInvoicesQueryDto, { page: pageNumber, limit: 250 });
    const result = (await services.facturas.findAll(query, ctx.user)) as unknown as {
      data: InvoiceLike[];
      totalPages?: number;
    };
    const rows = result.data ?? [];
    let reachedStart = false;
    for (const invoice of rows) {
      const created = new Date(invoice.createdAt);
      if (created < from) {
        reachedStart = true;
        continue;
      }
      if (created <= to) invoices.push(invoice);
    }
    if (reachedStart || !rows.length || pageNumber >= Number(result.totalPages ?? 1)) {
      break;
    }
    if (pageNumber === 40) truncated = true;
  }

  const active = invoices.filter((invoice) => invoice.status !== 'ANULADA');
  const byDay = new Map<string, { facturas: number; total: number }>();
  const byMode = new Map<string, number>();
  const products = new Map<number, { nombre: string; cantidad: number; total: number }>();
  let total = 0;
  let taxes = 0;
  for (const invoice of active) {
    const amount = Number(invoice.total ?? 0);
    total += amount;
    taxes += Number(invoice.taxes ?? 0);
    const key = dayKey(new Date(invoice.createdAt));
    const day = byDay.get(key) ?? { facturas: 0, total: 0 };
    day.facturas += 1;
    day.total += amount;
    byDay.set(key, day);
    const mode = invoice.saleMode ?? 'CONTADO';
    byMode.set(mode, (byMode.get(mode) ?? 0) + amount);
    for (const item of invoice.items ?? []) {
      const row = products.get(item.productId) ?? {
        nombre: item.product?.name ?? `Producto ${item.productId}`,
        cantidad: 0,
        total: 0,
      };
      row.cantidad += Number(item.quantity ?? 0);
      row.total += Number(item.total ?? 0);
      products.set(item.productId, row);
    }
  }

  return {
    desde: dayKey(from),
    hasta: dayKey(to),
    facturas: active.length,
    anuladas: invoices.length - active.length,
    totalVentas: Math.round(total),
    impuestos: Math.round(taxes),
    ticketPromedio: active.length ? Math.round(total / active.length) : 0,
    porModalidad: Object.fromEntries([...byMode].map(([k, v]) => [k, Math.round(v)])),
    porDia: [...byDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, row]) => ({ fecha, facturas: row.facturas, total: Math.round(row.total) })),
    topProductos: [...products.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((row) => ({ ...row, total: Math.round(row.total) })),
    advertencia: truncated ? 'Rango muy amplio: se resumieron las 10.000 facturas más recientes.' : undefined,
  };
}

function parseDate(value: string | null | undefined, fallback: Date, endOfDay = false) {
  if (!value) return fallback;
  const date = new Date(`${value.slice(0, 10)}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-05:00`);
  if (Number.isNaN(date.getTime())) {
    throw new MundiValidationError(`Fecha inválida: ${value}`);
  }
  return date;
}

/** Catálogo completo de herramientas de Mundi. */
export function buildMundiToolSpecs(s: MundiServices): MundiToolSpec[] {
  return [
    // ───────────────────────── Ventas ─────────────────────────
    defineTool({
      name: 'buscar_facturas',
      label: 'Buscar facturas',
      module: 'VENTAS',
      access: { roles: [...SALES_ROLES, Role.BODEGA] },
      description:
        'Lista facturas de venta (más recientes primero). Filtra por texto (consecutivo, cliente), estado o canal.',
      parameters: z.object({
        q: search,
        status: opt(z.enum(['ACTIVA', 'ANULADA'])),
        source: opt(z.enum(['ADMIN', 'POS', 'APP_MOVIL'])),
        page,
        limit,
      }),
      run: async (input, ctx) =>
        s.facturas.findAll(
          await toDto(ListInvoicesQueryDto, { ...input, ...paging(input) }),
          ctx.user,
        ),
    }),
    defineTool({
      name: 'ver_factura',
      label: 'Ver factura',
      module: 'VENTAS',
      access: { roles: [...SALES_ROLES, Role.BODEGA] },
      description: 'Detalle completo de una factura por id: líneas, pagos, crédito, cliente.',
      parameters: z.object({ invoiceId: id('Id de la factura.') }),
      run: (input, ctx) => s.facturas.findOne(input.invoiceId, ctx.user),
    }),
    defineTool({
      name: 'reporte_ventas',
      label: 'Reporte de ventas',
      module: 'REPORTES',
      access: { roles: [Role.ADMIN, Role.CONTADOR], permissions: ['REPORTS_VIEW'] },
      description:
        'Resumen de ventas en un rango de fechas: total, impuestos, ticket promedio, ventas por día, por modalidad (contado/crédito) y top 10 productos. Por defecto, el mes actual.',
      parameters: z.object({
        desde: isoDate('Fecha inicial.'),
        hasta: isoDate('Fecha final.'),
      }),
      run: (input, ctx) => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return salesReport(
          s,
          ctx,
          parseDate(input.desde, monthStart),
          parseDate(input.hasta, now, true),
        );
      },
    }),
    defineTool({
      name: 'saldo_bonus_cliente',
      label: 'Saldo de bonus',
      module: 'VENTAS',
      access: { roles: SALES_ROLES },
      description: 'Saldo de beneficios/bonus (miembro fiel) disponible de un cliente.',
      parameters: z.object({ clientId: id('Id del cliente.') }),
      run: (input) => s.facturas.bonusBalance(input.clientId),
    }),
    defineTool({
      name: 'crear_factura',
      label: 'Crear factura',
      module: 'VENTAS',
      write: true,
      access: { roles: SALES_ROLES, permissions: ['SALES_CREATE'] },
      description:
        'Crea una factura de venta. CONTADO exige pagos (payments) que sumen el total con bankAccountId (consulta cuentas_bancarias). CREDITO exige creditDueDate. Usa productId (o barcode) y cantidades; no envíes unitPrice salvo que el usuario pida cambiar el precio (requiere permiso). Antes de crearla consulta productos, stock y el cliente.',
      parameters: z.object({
        clientId: id('Id del cliente.'),
        warehouseId: opt(z.number().int().positive()).describe('Bodega que despacha.'),
        saleMode: z.enum(['CONTADO', 'CREDITO']),
        creditDueDate: isoDate('Vencimiento del crédito (solo CREDITO).'),
        priceLevel: opt(z.number().int().min(0).max(3)).describe('Nivel de precio 0-3.'),
        items: z
          .array(
            z.object({
              productId: opt(z.number().int().positive()),
              barcode: opt(z.string()),
              quantity: z.number().positive(),
              warehouseId: opt(z.number().int().positive()),
              productPriceId: opt(z.number().int().positive()),
              unitPrice: opt(z.number().positive()).describe('Solo si se cambia el precio.'),
            }),
          )
          .min(1),
        payments: opt(
          z.array(
            z.object({
              bankAccountId: opt(z.number().int().positive()),
              advanceId: opt(z.number().int().positive()),
              amount: z.number().positive(),
              reference: opt(z.string()),
            }),
          ),
        ),
        paymentNotes: opt(z.string()),
      }),
      summarize: (input) =>
        `Factura ${input.saleMode} para el cliente #${input.clientId} con ${input.items.length} línea(s).`,
      run: async (input, ctx) =>
        s.facturas.create(
          await toDto(CreateInvoiceDto, { ...input, source: 'ADMIN' }),
          ctx.user,
        ),
    }),
    defineTool({
      name: 'anular_factura',
      label: 'Anular factura',
      module: 'VENTAS',
      write: true,
      access: { roles: [Role.ADMIN] },
      description:
        'Anula una factura (la conserva para trazabilidad y devuelve el inventario). Solo ADMIN.',
      parameters: z.object({ invoiceId: id('Id de la factura.') }),
      summarize: (input) => `Anular la factura #${input.invoiceId}.`,
      run: (input, ctx) => s.facturas.remove(input.invoiceId, ctx.user),
    }),

    // ──────────────────────── Cotizaciones ────────────────────────
    defineTool({
      name: 'buscar_cotizaciones',
      label: 'Buscar cotizaciones',
      module: 'COTIZACIONES',
      access: {},
      description: 'Lista cotizaciones y preventas.',
      parameters: z.object({
        q: search,
        status: opt(z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CONVERTIDA', 'EXPIRADA'])),
        page,
        limit,
      }),
      run: async (input, ctx) =>
        s.cotizaciones.findAll(
          await toDto(ListQuotesQueryDto, { ...input, ...paging(input) }),
          ctx.user,
        ),
    }),
    defineTool({
      name: 'ver_cotizacion',
      label: 'Ver cotización',
      module: 'COTIZACIONES',
      access: {},
      description: 'Detalle de una cotización por id.',
      parameters: z.object({ quoteId: id('Id de la cotización.') }),
      run: (input, ctx) => s.cotizaciones.findOne(input.quoteId, ctx.user),
    }),
    defineTool({
      name: 'crear_cotizacion',
      label: 'Crear cotización',
      module: 'COTIZACIONES',
      write: true,
      access: {},
      description: 'Crea una cotización (COTIZACION) o preventa (PREVENTA) para un cliente.',
      parameters: z.object({
        clientId: id('Id del cliente.'),
        kind: opt(z.enum(['COTIZACION', 'PREVENTA'])),
        expiresAt: isoDate('Vencimiento.'),
        priceLevel: opt(z.number().int().min(0).max(3)),
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().positive(),
              productPriceId: opt(z.number().int().positive()),
              warehouseId: opt(z.number().int().positive()),
            }),
          )
          .min(1),
      }),
      summarize: (input) =>
        `${input.kind ?? 'COTIZACION'} para el cliente #${input.clientId} con ${input.items.length} línea(s).`,
      run: async (input, ctx) => s.cotizaciones.create(await toDto(CreateQuoteDto, input), ctx.user),
    }),
    defineTool({
      name: 'convertir_cotizacion_en_factura',
      label: 'Facturar cotización',
      module: 'COTIZACIONES',
      write: true,
      access: { roles: SALES_ROLES },
      description: 'Convierte una cotización aprobada en factura.',
      parameters: z.object({ quoteId: id('Id de la cotización.') }),
      summarize: (input) => `Convertir la cotización #${input.quoteId} en factura.`,
      run: (input) => s.cotizaciones.convertToInvoice(input.quoteId),
    }),

    // ───────────────────────── Devoluciones ─────────────────────────
    defineTool({
      name: 'buscar_devoluciones',
      label: 'Buscar devoluciones',
      module: 'DEVOLUCIONES',
      access: { roles: SALES_ROLES, permissions: ['RETURNS_VIEW'] },
      description: 'Lista devoluciones por factura, cliente, producto o fechas.',
      parameters: z.object({
        invoiceId: opt(z.number().int().positive()),
        clientId: opt(z.number().int().positive()),
        productId: opt(z.number().int().positive()),
        q: search,
        from: isoDate('Desde.'),
        to: isoDate('Hasta.'),
      }),
      run: async (input) => s.devoluciones.findAll(await toDto(ListReturnsQueryDto, input)),
    }),
    defineTool({
      name: 'lineas_devolvibles_factura',
      label: 'Líneas devolvibles',
      module: 'DEVOLUCIONES',
      access: { roles: SALES_ROLES, permissions: ['RETURNS_VIEW'] },
      description:
        'Líneas de una factura que aún se pueden devolver (invoiceItemId y cantidad disponible). Úsala antes de crear_devolucion.',
      parameters: z.object({ invoiceId: id('Id de la factura.') }),
      run: (input) => s.devoluciones.returnable(input.invoiceId),
    }),
    defineTool({
      name: 'crear_devolucion',
      label: 'Registrar devolución',
      module: 'DEVOLUCIONES',
      write: true,
      access: { roles: [Role.ADMIN, Role.CAJERO], permissions: ['RETURNS_CREATE'] },
      description:
        'Registra una devolución de venta. Si excede la deuda del crédito (o fue de contado) indica refundMethod CUENTA (con bankAccountId) o SALDO_FAVOR.',
      parameters: z.object({
        invoiceId: id('Id de la factura.'),
        reason: z.string().min(3),
        notes: opt(z.string()),
        items: z
          .array(z.object({ invoiceItemId: z.number().int().positive(), quantity: z.number().positive() }))
          .min(1),
        refundMethod: opt(z.enum(['CUENTA', 'SALDO_FAVOR'])),
        bankAccountId: opt(z.number().int().positive()),
      }),
      summarize: (input) =>
        `Devolución de ${input.items.length} línea(s) de la factura #${input.invoiceId}: ${input.reason}.`,
      run: async (input, ctx) => s.devoluciones.create(await toDto(CreateReturnDto, input), ctx.user),
    }),

    // ───────────────────────── Clientes ─────────────────────────
    defineTool({
      name: 'buscar_clientes',
      label: 'Buscar clientes',
      module: 'CLIENTES',
      access: { permissions: ['CLIENTS_VIEW'] },
      description: 'Busca clientes por nombre, identificación o teléfono.',
      parameters: z.object({ q: search, estado, page, limit }),
      run: async (input) => s.clientes.findAll(await toDto(FilterClientsDto, { ...input, ...paging(input) })),
    }),
    defineTool({
      name: 'ver_cliente',
      label: 'Ver cliente',
      module: 'CLIENTES',
      access: { permissions: ['CLIENTS_VIEW'] },
      description: 'Ficha de un cliente: datos, cupo de crédito, nivel de precio.',
      parameters: z.object({ clientId: id('Id del cliente.') }),
      run: (input) => s.clientes.findOne(input.clientId),
    }),
    defineTool({
      name: 'crear_cliente',
      label: 'Crear cliente',
      module: 'CLIENTES',
      write: true,
      access: { permissions: ['CLIENTS_EDIT'] },
      description: 'Crea un cliente.',
      parameters: z.object({
        identification: z.string().min(3),
        firstName: z.string().min(2),
        lastName: z.string().min(2),
        clientType: z.enum(['MAYORISTA', 'MINORISTA']),
        phone: opt(z.string()),
        email: opt(z.string()),
        address: opt(z.string()),
        neighborhood: opt(z.string()),
        priceLevel: opt(z.number().int().min(0).max(3)),
        hasCredit: opt(z.boolean()),
        maxCredit: opt(z.number().min(0)),
      }),
      summarize: (input) =>
        `Cliente ${input.firstName} ${input.lastName} (${input.identification}), ${input.clientType}.`,
      run: async (input, ctx) => s.clientes.create(await toDto(CreateClientDto, input), ctx.user),
    }),
    defineTool({
      name: 'actualizar_cliente',
      label: 'Actualizar cliente',
      module: 'CLIENTES',
      write: true,
      access: { permissions: ['CLIENTS_EDIT'] },
      description: 'Modifica datos de un cliente. Envía solo los campos a cambiar (el resto en null).',
      parameters: z.object({
        clientId: id('Id del cliente.'),
        firstName: opt(z.string()),
        lastName: opt(z.string()),
        phone: opt(z.string()),
        email: opt(z.string()),
        address: opt(z.string()),
        neighborhood: opt(z.string()),
        clientType: opt(z.enum(['MAYORISTA', 'MINORISTA'])),
        priceLevel: opt(z.number().int().min(0).max(3)),
        hasCredit: opt(z.boolean()),
        maxCredit: opt(z.number().min(0)),
      }),
      summarize: (input) => `Actualizar el cliente #${input.clientId}.`,
      run: async ({ clientId, ...data }, ctx) =>
        s.clientes.update(clientId, await toDto(UpdateClientDto, data), ctx.user),
    }),

    // ───────────────────── Productos e inventario ─────────────────────
    defineTool({
      name: 'buscar_productos',
      label: 'Buscar productos',
      module: 'PRODUCTOS',
      access: { permissions: ['PRODUCTS_VIEW'] },
      description:
        'Busca productos (nombre, marca, código de barras) con precios y stock. stockStatus filtra SIN_STOCK, BAJO_MINIMO, etc.',
      parameters: z.object({
        q: search,
        estado,
        brand: opt(z.string()),
        barcode: opt(z.string()),
        providerId: opt(z.number().int().positive()),
        warehouseId: opt(z.number().int().positive()),
        stockStatus: opt(z.enum(['CON_STOCK', 'SIN_STOCK', 'BAJO_MINIMO', 'EN_RANGO', 'SOBRE_MAXIMO'])),
        page,
        limit,
      }),
      run: async (input) => s.productos.findAll(await toDto(FilterProductsDto, { ...input, ...paging(input) })),
    }),
    defineTool({
      name: 'ver_producto',
      label: 'Ver producto',
      module: 'PRODUCTOS',
      access: { permissions: ['PRODUCTS_VIEW'] },
      description: 'Ficha de un producto: precios por nivel, costos, códigos y stock por bodega.',
      parameters: z.object({ productId: id('Id del producto.') }),
      run: (input) => s.productos.findOne(input.productId),
    }),
    defineTool({
      name: 'producto_por_codigo_barras',
      label: 'Buscar por código',
      module: 'PRODUCTOS',
      access: { permissions: ['PRODUCTS_VIEW'] },
      description: 'Encuentra un producto por su código de barras.',
      parameters: z.object({ code: z.string().min(1) }),
      run: (input) => s.productos.findByBarcode(input.code),
    }),
    defineTool({
      name: 'utilidad_productos',
      label: 'Utilidad de productos',
      module: 'PRODUCTOS',
      access: { roles: [Role.ADMIN, Role.CONTADOR] },
      description: 'Margen y utilidad por producto (uno o el listado paginado).',
      parameters: z.object({ productId: opt(z.number().int().positive()), page, limit }),
      run: async (input) =>
        input.productId
          ? s.productProfit.findProductProfit(input.productId)
          : s.productProfit.findAllProductProfits(
              await toDto(ProfitProductsQueryDto, paging(input)),
            ),
    }),
    defineTool({
      name: 'consultar_inventario',
      label: 'Consultar inventario',
      module: 'INVENTARIO',
      access: { roles: PURCHASE_ROLES, permissions: ['PRODUCTS_VIEW'] },
      description:
        'Existencias. Con productId: stock de ese producto por bodega. Con warehouseId: stock de esa bodega. Sin ambos: listado general.',
      parameters: z.object({
        productId: opt(z.number().int().positive()),
        warehouseId: opt(z.number().int().positive()),
        q: search,
        page,
        limit,
      }),
      run: async (input, ctx) => {
        if (input.productId) return s.inventario.findByProduct(input.productId);
        if (input.warehouseId) return s.inventario.findByWarehouse(input.warehouseId, ctx.user);
        return s.inventario.findAll(await toDto(ListInventoryQueryDto, { q: input.q, ...paging(input) }));
      },
    }),
    defineTool({
      name: 'movimientos_inventario',
      label: 'Movimientos de inventario',
      module: 'INVENTARIO',
      access: { roles: PURCHASE_ROLES, permissions: ['PRODUCTS_VIEW'] },
      description: 'Kardex: entradas, salidas, ajustes y traslados recientes.',
      parameters: z.object({ q: search, page, limit }),
      run: async (input, ctx) =>
        s.inventario.findMovements(await toDto(ListInventoryQueryDto, { ...input, ...paging(input) }), ctx.user),
    }),
    defineTool({
      name: 'traslados_sugeridos',
      label: 'Traslados sugeridos',
      module: 'INVENTARIO',
      access: { roles: PURCHASE_ROLES, permissions: ['PRODUCTS_VIEW'] },
      description: 'Sugerencias de traslado entre bodegas según mínimos.',
      parameters: z.object({}),
      run: (_input, ctx) => s.inventario.suggestTransfers(ctx.user),
    }),
    defineTool({
      name: 'listar_bodegas',
      label: 'Listar bodegas',
      module: 'BODEGAS',
      access: {},
      description: 'Bodegas del negocio (id, nombre).',
      parameters: z.object({ q: search, estado }),
      run: async (input) => s.bodegas.findAll(await toDto(FilterWarehousesDto, { ...input, page: 1, limit: 100 })),
    }),
    defineTool({
      name: 'movimiento_inventario',
      label: 'Movimiento de inventario',
      module: 'INVENTARIO',
      write: true,
      access: { roles: PURCHASE_ROLES, permissions: ['PRODUCTS_VIEW', 'INVENTORY_EDIT'] },
      description:
        'Registra un movimiento de inventario: ENTRADA (a toWarehouseId), SALIDA (de fromWarehouseId), TRASLADO (de fromWarehouseId a toWarehouseId) o AJUSTE (fija la cantidad en warehouseId; exige motivo).',
      parameters: z.object({
        tipo: z.enum(['ENTRADA', 'SALIDA', 'TRASLADO', 'AJUSTE']),
        productId: opt(z.number().int().positive()),
        barcode: opt(z.string()),
        quantity: z.number().min(0),
        unit,
        fromWarehouseId: opt(z.number().int().positive()),
        toWarehouseId: opt(z.number().int().positive()),
        warehouseId: opt(z.number().int().positive()),
        reason: opt(z.string()),
      }),
      summarize: (input) =>
        `${input.tipo} de ${input.quantity} ${input.unit ?? 'und'} del producto ${input.productId ? `#${input.productId}` : input.barcode}.`,
      run: async ({ tipo, ...input }, ctx) => {
        switch (tipo) {
          case 'ENTRADA':
            return s.inventario.entry(await toDto(InventoryEntryDto, input), ctx.user);
          case 'SALIDA':
            return s.inventario.exit(await toDto(InventoryExitDto, input), ctx.user);
          case 'TRASLADO':
            return s.inventario.transfer(
              await toDto(InventoryTransferDto, { ...input, supportNote: input.reason }),
              ctx.user,
            );
          default:
            return s.inventario.adjustment(await toDto(InventoryAdjustmentDto, input), ctx.user);
        }
      },
    }),

    // ───────────────────── Compras y proveedores ─────────────────────
    defineTool({
      name: 'buscar_proveedores',
      label: 'Buscar proveedores',
      module: 'PROVEEDORES',
      access: { permissions: ['PROVIDERS_VIEW'] },
      description: 'Busca proveedores por nombre o NIT.',
      parameters: z.object({ q: search, estado, page, limit }),
      run: async (input) => s.proveedores.findAll(await toDto(FilterProvidersDto, { ...input, ...paging(input) })),
    }),
    defineTool({
      name: 'ver_proveedor',
      label: 'Ver proveedor',
      module: 'PROVEEDORES',
      access: { permissions: ['PROVIDERS_VIEW'] },
      description: 'Ficha de un proveedor: retención, días de crédito, contacto.',
      parameters: z.object({ providerId: id('Id del proveedor.') }),
      run: (input) => s.proveedores.findOne(input.providerId),
    }),
    defineTool({
      name: 'crear_proveedor',
      label: 'Crear proveedor',
      module: 'PROVEEDORES',
      write: true,
      access: { roles: [Role.ADMIN], permissions: ['PROVIDERS_EDIT'] },
      description: 'Crea un proveedor (por ejemplo, a partir de una factura PDF).',
      parameters: z.object({
        name: z.string().min(2),
        taxId: opt(z.string()),
        email: opt(z.string()),
        phonePrimary: opt(z.string()),
        address: opt(z.string()),
        city: opt(z.string()),
        department: opt(z.string()),
        creditDays: opt(z.number().int().min(0)),
        observations: opt(z.string()),
      }),
      summarize: (input) => `Proveedor ${input.name}${input.taxId ? ` (NIT ${input.taxId})` : ''}.`,
      run: async (input, ctx) => s.proveedores.create(await toDto(CreateProviderDto, input), ctx.user),
    }),
    defineTool({
      name: 'buscar_compras',
      label: 'Buscar compras',
      module: 'COMPRAS',
      access: { roles: PURCHASE_ROLES, permissions: ['PURCHASES_VIEW'] },
      description: 'Lista órdenes de compra por estado, proveedor, bodega o fechas.',
      parameters: z.object({
        q: search,
        status: opt(z.enum(['BORRADOR', 'ORDENADA', 'RECIBIDA', 'ANULADA'])),
        providerId: opt(z.number().int().positive()),
        warehouseId: opt(z.number().int().positive()),
        dateFrom: isoDate('Desde.'),
        dateTo: isoDate('Hasta.'),
        page,
        limit,
      }),
      run: async (input, ctx) =>
        s.compras.findAll(await toDto(ListPurchaseOrdersQueryDto, { ...input, ...paging(input) }), ctx.user),
    }),
    defineTool({
      name: 'ver_compra',
      label: 'Ver compra',
      module: 'COMPRAS',
      access: { roles: PURCHASE_ROLES, permissions: ['PURCHASES_VIEW'] },
      description: 'Detalle de una orden de compra.',
      parameters: z.object({ purchaseOrderId: id('Id de la compra.') }),
      run: (input, ctx) => s.compras.findOne(input.purchaseOrderId, ctx.user),
    }),
    defineTool({
      name: 'reporte_compras',
      label: 'Reporte de compras',
      module: 'REPORTES',
      access: { roles: PURCHASE_ROLES, permissions: ['PURCHASES_VIEW'] },
      description: 'Resumen de compras por periodo, proveedores y productos más comprados.',
      parameters: z.object({
        dateFrom: isoDate('Desde.'),
        dateTo: isoDate('Hasta.'),
        providerId: opt(z.number().int().positive()),
        warehouseId: opt(z.number().int().positive()),
        granularity: opt(z.enum(['DIA', 'MES'])),
      }),
      run: async (input, ctx) => s.compras.getSummary(await toDto(PurchaseReportQueryDto, input), ctx.user),
    }),
    defineTool({
      name: 'compras_pendientes_hoy',
      label: 'Compras pendientes',
      module: 'COMPRAS',
      access: { roles: PURCHASE_ROLES, permissions: ['PURCHASES_VIEW'] },
      description: 'Compras pendientes de recibir o pagar hoy.',
      parameters: z.object({}),
      run: (_input, ctx) => s.compras.getPendingToday(ctx.user),
    }),
    defineTool({
      name: 'proveedor_sugerido',
      label: 'Proveedor sugerido',
      module: 'COMPRAS',
      access: { roles: PURCHASE_ROLES, permissions: ['PURCHASES_VIEW'] },
      description: 'Proveedor y último costo sugeridos para comprar un producto.',
      parameters: z.object({ productId: id('Id del producto.') }),
      run: (input) => s.compras.suggestProvider(input.productId),
    }),
    defineTool({
      name: 'crear_compra',
      label: 'Crear compra',
      module: 'COMPRAS',
      write: true,
      access: { roles: PURCHASE_ROLES, permissions: ['PURCHASES_VIEW', 'PURCHASES_EDIT'] },
      description:
        'Crea una orden de compra en BORRADOR. Útil tras leer una factura PDF de proveedor: busca el proveedor y cada producto por nombre/código antes de proponerla. unitCost es el costo unitario en COP (entero).',
      parameters: z.object({
        providerId: id('Id del proveedor.'),
        warehouseId: id('Bodega que recibe.'),
        externalReference: opt(z.string()).describe('Número de la factura del proveedor.'),
        invoiceDate: isoDate('Fecha de la factura del proveedor.'),
        dueDate: isoDate('Vencimiento.'),
        paymentCondition: opt(z.enum(['CONTADO', 'CREDITO'])),
        notes: opt(z.string()),
        freight: opt(z.number().int().min(0)),
        discount1Percent: opt(z.number().min(0).max(100)),
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().int().positive(),
              unit,
              unitCost: z.number().int().positive(),
            }),
          )
          .min(1),
      }),
      summarize: (input) =>
        `Compra al proveedor #${input.providerId} con ${input.items.length} producto(s)${input.externalReference ? `, factura ${input.externalReference}` : ''}.`,
      run: async (input, ctx) => s.compras.create(await toDto(CreatePurchaseOrderDto, input), ctx.user),
    }),
    defineTool({
      name: 'gestionar_compra',
      label: 'Gestionar compra',
      module: 'COMPRAS',
      write: true,
      access: { roles: PURCHASE_ROLES, permissions: ['PURCHASES_VIEW', 'PURCHASES_EDIT'] },
      description:
        'Cambia el estado de una compra: ORDENAR (borrador → ordenada), RECIBIR (entra al inventario) o ANULAR (solo ADMIN/CONTADOR).',
      parameters: z.object({
        purchaseOrderId: id('Id de la compra.'),
        accion: z.enum(['ORDENAR', 'RECIBIR', 'ANULAR']),
      }),
      summarize: (input) => `${input.accion} la compra #${input.purchaseOrderId}.`,
      run: (input, ctx) => {
        if (input.accion === 'ORDENAR') return s.compras.order(input.purchaseOrderId);
        if (input.accion === 'RECIBIR') return s.compras.receive(input.purchaseOrderId, ctx.user);
        const denial = accessDenial(ctx, { roles: [Role.ADMIN, Role.CONTADOR] });
        if (denial) throw new MundiValidationError(denial);
        return s.compras.cancel(input.purchaseOrderId);
      },
    }),
    defineTool({
      name: 'pagar_compra',
      label: 'Pagar compra',
      module: 'CUENTAS POR PAGAR',
      write: true,
      access: { roles: [Role.ADMIN, Role.CONTADOR], permissions: ['PURCHASES_VIEW', 'PAYABLES_EDIT'] },
      description: 'Registra un pago a una compra desde una cuenta bancaria.',
      parameters: z.object({
        purchaseOrderId: id('Id de la compra.'),
        amount: z.number().int().positive(),
        bankAccountId: id('Cuenta bancaria de salida.'),
        notes: opt(z.string()),
      }),
      summarize: (input) =>
        `Pagar ${input.amount} a la compra #${input.purchaseOrderId} desde la cuenta #${input.bankAccountId}.`,
      run: async ({ purchaseOrderId, ...data }) =>
        s.compras.pay(purchaseOrderId, await toDto(CreatePurchasePaymentDto, data)),
    }),

    // ───────────────────── Cartera (cobrar / pagar) ─────────────────────
    defineTool({
      name: 'buscar_creditos',
      label: 'Buscar créditos',
      module: 'CUENTAS POR COBRAR',
      access: { permissions: ['RECEIVABLES_VIEW'] },
      description: 'Créditos de clientes (cartera). Con clientId lista los de ese cliente.',
      parameters: z.object({
        clientId: opt(z.number().int().positive()),
        status: opt(z.enum(['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'CANCELADA'])),
        q: search,
        page,
        limit,
      }),
      run: async (input) =>
        input.clientId
          ? s.creditos.findByClient(input.clientId)
          : s.creditos.findAll(await toDto(ListCreditsQueryDto, { ...input, ...paging(input) })),
    }),
    defineTool({
      name: 'estado_cuenta_cliente',
      label: 'Estado de cuenta cliente',
      module: 'CUENTAS POR COBRAR',
      access: { roles: SALES_ROLES, permissions: ['RECEIVABLES_VIEW'] },
      description: 'Estado de cuenta de un cliente: créditos, abonos y saldo.',
      parameters: z.object({ clientId: id('Id del cliente.'), from: isoDate('Desde.'), to: isoDate('Hasta.') }),
      run: async ({ clientId, ...range }) =>
        s.recibos.clientStatement(clientId, await toDto(StatementQueryDto, range)),
    }),
    defineTool({
      name: 'estado_cuenta_proveedor',
      label: 'Estado de cuenta proveedor',
      module: 'CUENTAS POR PAGAR',
      access: { roles: PURCHASE_ROLES, permissions: ['PAYABLES_VIEW'] },
      description: 'Estado de cuenta con un proveedor: compras, pagos y saldo por pagar.',
      parameters: z.object({ providerId: id('Id del proveedor.'), from: isoDate('Desde.'), to: isoDate('Hasta.') }),
      run: async ({ providerId, ...range }) =>
        s.recibos.providerStatement(providerId, await toDto(StatementQueryDto, range)),
    }),
    defineTool({
      name: 'buscar_recibos',
      label: 'Buscar recibos',
      module: 'CARTERA',
      access: {},
      description: 'Recibos de cobro (COBRO, a clientes) o de pago (PAGO, a proveedores).',
      parameters: z.object({
        kind: z.enum(['COBRO', 'PAGO']),
        clientId: opt(z.number().int().positive()),
        providerId: opt(z.number().int().positive()),
        from: isoDate('Desde.'),
        to: isoDate('Hasta.'),
      }),
      run: async (input, ctx) => {
        const rule: MundiAccessRule =
          input.kind === 'COBRO'
            ? { roles: SALES_ROLES, permissions: ['RECEIVABLES_VIEW'] }
            : { roles: PURCHASE_ROLES, permissions: ['PAYABLES_VIEW'] };
        const denial = accessDenial(ctx, rule);
        if (denial) throw new MundiValidationError(denial);
        return s.recibos.list(await toDto(ListReceiptsQueryDto, input));
      },
    }),
    defineTool({
      name: 'buscar_anticipos',
      label: 'Buscar anticipos',
      module: 'CUENTAS POR COBRAR',
      access: { permissions: ['RECEIVABLES_VIEW'] },
      description: 'Anticipos y saldos a favor de clientes.',
      parameters: z.object({
        clientId: opt(z.number().int().positive()),
        status: opt(z.enum(['DISPONIBLE', 'APLICADO', 'DEVUELTO'])),
      }),
      run: async (input) => s.anticipos.findAll(await toDto(ListAdvancesQueryDto, input)),
    }),
    defineTool({
      name: 'registrar_abono_credito',
      label: 'Registrar abono',
      module: 'CUENTAS POR COBRAR',
      write: true,
      access: { roles: SALES_ROLES, permissions: ['RECEIVABLES_EDIT'] },
      description: 'Registra un abono a un crédito de cliente, opcionalmente a una cuenta bancaria.',
      parameters: z.object({
        creditId: id('Id del crédito.'),
        amount: z.number().int().positive(),
        bankAccountId: opt(z.number().int().positive()),
        reference: opt(z.string()),
        notes: opt(z.string()),
      }),
      summarize: (input) => `Abono de ${input.amount} al crédito #${input.creditId}.`,
      run: async ({ creditId, ...data }, ctx) =>
        s.creditos.pay(creditId, await toDto(CreateCreditPaymentDto, data), ctx.user),
    }),
    defineTool({
      name: 'registrar_recibo',
      label: 'Registrar recibo',
      module: 'CARTERA',
      write: true,
      access: {},
      description:
        'Crea un recibo de COBRO (cliente, asigna a creditId) o de PAGO (proveedor, asigna a purchaseOrderId). Los instrumentos son las cuentas bancarias donde entra/sale el dinero; deben sumar lo asignado.',
      parameters: z.object({
        kind: z.enum(['COBRO', 'PAGO']),
        clientId: opt(z.number().int().positive()),
        providerId: opt(z.number().int().positive()),
        documentNumber: z.string().min(1).max(40),
        detail: z.string().min(2).max(200),
        paidAt: isoDate('Fecha del pago.'),
        allocations: z
          .array(
            z.object({
              creditId: opt(z.number().int().positive()),
              purchaseOrderId: opt(z.number().int().positive()),
              amount: z.number().positive(),
              retention: opt(z.number().min(0)),
            }),
          )
          .min(1),
        instruments: z
          .array(
            z.object({
              bankAccountId: z.number().int().positive(),
              amount: z.number().positive(),
              reference: opt(z.string()),
            }),
          )
          .min(1),
        comments: opt(z.string()),
      }),
      summarize: (input) =>
        `Recibo de ${input.kind} ${input.documentNumber}: ${input.detail} (${input.allocations.length} documento(s)).`,
      run: async ({ kind, ...data }, ctx) => {
        const rule: MundiAccessRule =
          kind === 'COBRO'
            ? { roles: SALES_ROLES, permissions: ['RECEIVABLES_EDIT'] }
            : { roles: [Role.ADMIN, Role.CONTADOR], permissions: ['PAYABLES_EDIT'] };
        const denial = accessDenial(ctx, rule);
        if (denial) throw new MundiValidationError(denial);
        const dto = await toDto(CreateReceiptDto, data);
        return kind === 'COBRO'
          ? s.recibos.createCollection(dto, ctx.user)
          : s.recibos.createPayment(dto, ctx.user);
      },
    }),
    defineTool({
      name: 'registrar_anticipo',
      label: 'Registrar anticipo',
      module: 'CUENTAS POR COBRAR',
      write: true,
      access: { roles: BANK_ROLES, permissions: ['RECEIVABLES_EDIT'] },
      description: 'Registra un anticipo de un cliente que entra a una cuenta bancaria.',
      parameters: z.object({
        clientId: id('Id del cliente.'),
        amount: z.number().int().positive(),
        bankAccountId: id('Cuenta bancaria.'),
        notes: opt(z.string()),
      }),
      summarize: (input) => `Anticipo de ${input.amount} del cliente #${input.clientId}.`,
      run: async (input, ctx) => s.anticipos.create(await toDto(CreateAdvanceDto, input), ctx.user),
    }),

    // ───────────────────────── Bancos ─────────────────────────
    defineTool({
      name: 'cuentas_bancarias',
      label: 'Cuentas bancarias',
      module: 'BANCOS',
      access: { roles: BANK_ROLES, permissions: ['BANKS_VIEW'] },
      description: 'Cuentas bancarias y cajas con su saldo actual (ids para pagos).',
      parameters: z.object({ q: search, estado }),
      run: async (input) =>
        s.cuentasBancarias.findAll(await toDto(FilterBankAccountsDto, { ...input, page: 1, limit: 100 })),
    }),
    defineTool({
      name: 'movimientos_bancarios',
      label: 'Movimientos bancarios',
      module: 'BANCOS',
      access: { roles: BANK_ROLES, permissions: ['BANKS_VIEW'] },
      description: 'Movimientos de bancos (ingresos, egresos, traslados, 4x1000).',
      parameters: z.object({ q: search, page, limit }),
      run: async (input) =>
        s.movimientosBancarios.findAll(await toDto(ListBankMovementsQueryDto, { ...input, ...paging(input) })),
    }),
    defineTool({
      name: 'movimiento_bancario',
      label: 'Movimiento bancario',
      module: 'BANCOS',
      write: true,
      access: { roles: BANK_ROLES, permissions: ['BANKS_VIEW', 'BANKS_EDIT'] },
      description:
        'Registra un INGRESO o EGRESO en una cuenta (bankAccountId) o un TRASLADO entre cuentas (fromBankAccountId → toBankAccountId).',
      parameters: z.object({
        tipo: z.enum(['INGRESO', 'EGRESO', 'TRASLADO']),
        amount: z.number().int().positive(),
        bankAccountId: opt(z.number().int().positive()),
        fromBankAccountId: opt(z.number().int().positive()),
        toBankAccountId: opt(z.number().int().positive()),
        description: opt(z.string()),
        appliesGmf: opt(z.boolean()).describe('Aplica 4x1000.'),
      }),
      summarize: (input) =>
        input.tipo === 'TRASLADO'
          ? `Traslado de ${input.amount} de la cuenta #${input.fromBankAccountId} a la #${input.toBankAccountId}.`
          : `${input.tipo} de ${input.amount} en la cuenta #${input.bankAccountId}.`,
      run: async ({ tipo, ...input }, ctx) => {
        if (tipo === 'TRASLADO') {
          return s.movimientosBancarios.transfer(await toDto(BankTransferDto, input), ctx.user);
        }
        const dto = await toDto(BankAmountDto, input);
        return tipo === 'INGRESO'
          ? s.movimientosBancarios.income(dto.bankAccountId, dto, ctx.user)
          : s.movimientosBancarios.expense(dto.bankAccountId, dto, ctx.user);
      },
    }),

    // ───────────────────────── Domicilios ─────────────────────────
    defineTool({
      name: 'buscar_domicilios',
      label: 'Buscar domicilios',
      module: 'DOMICILIOS',
      access: { roles: [Role.ADMIN, Role.BODEGA, Role.DOMICILIARIO], permissions: ['DELIVERIES_VIEW'] },
      description: 'Domicilios por estado.',
      parameters: z.object({
        q: search,
        status: opt(z.enum(['PENDIENTE', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'])),
        page,
        limit,
      }),
      run: async (input, ctx) =>
        s.deliveries.findAll(await toDto(ListDeliveriesQueryDto, { ...input, ...paging(input) }), ctx.user),
    }),
    defineTool({
      name: 'crear_domicilio',
      label: 'Crear domicilio',
      module: 'DOMICILIOS',
      write: true,
      access: { roles: [Role.ADMIN], permissions: ['DELIVERIES_EDIT'] },
      description: 'Crea un domicilio para una factura.',
      parameters: z.object({
        invoiceId: id('Id de la factura.'),
        address: z.string().min(3),
        recipientName: z.string().min(2),
        recipientPhone: z.string().min(5),
        notes: opt(z.string()),
        assignedUserId: opt(z.number().int().positive()),
        deliveryFee: opt(z.number().int().min(0)),
      }),
      summarize: (input) => `Domicilio de la factura #${input.invoiceId} a ${input.address}.`,
      run: async (input) => s.deliveries.create(await toDto(CreateDeliveryDto, input)),
    }),
    defineTool({
      name: 'actualizar_estado_domicilio',
      label: 'Estado de domicilio',
      module: 'DOMICILIOS',
      write: true,
      access: { roles: [Role.ADMIN, Role.BODEGA, Role.DOMICILIARIO], permissions: ['DELIVERIES_DISPATCH'] },
      description: 'Cambia el estado de un domicilio.',
      parameters: z.object({
        deliveryId: id('Id del domicilio.'),
        status: z.enum(['PENDIENTE', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO']),
      }),
      summarize: (input) => `Domicilio #${input.deliveryId} → ${input.status}.`,
      run: async ({ deliveryId, ...data }, ctx) =>
        s.deliveries.updateStatus(deliveryId, await toDto(UpdateDeliveryStatusDto, data), ctx.user),
    }),

    // ───────────────────── Configuración y control ─────────────────────
    defineTool({
      name: 'listar_retenciones',
      label: 'Retenciones',
      module: 'RETENCIONES',
      access: { permissions: ['RETENTIONS_VIEW'] },
      description: 'Tarifas de retención configuradas.',
      parameters: z.object({ q: search, estado }),
      run: async (input) => s.retenciones.findAll(await toDto(FilterRetentionsDto, { ...input, page: 1, limit: 100 })),
    }),
    defineTool({
      name: 'listar_ofertas',
      label: 'Ofertas',
      module: 'OFERTAS',
      access: { roles: [Role.ADMIN, Role.CONTADOR], permissions: ['OFFERS_VIEW'] },
      description: 'Ofertas y promociones.',
      parameters: z.object({ q: search, estado, page, limit }),
      run: async (input) => s.ofertas.findAll(await toDto(FilterOffersDto, { ...input, ...paging(input) })),
    }),
    defineTool({
      name: 'listar_usuarios',
      label: 'Usuarios',
      module: 'USUARIOS',
      access: { roles: [Role.ADMIN] },
      description: 'Usuarios del sistema con su rol (solo ADMIN).',
      parameters: z.object({ q: search, estado, page, limit }),
      run: async (input) => s.usuarios.findAll(await toDto(ListUsersQueryDto, { ...input, ...paging(input) })),
    }),
    defineTool({
      name: 'consultar_auditoria',
      label: 'Auditoría',
      module: 'AUDITORIA',
      access: { roles: [Role.ADMIN] },
      description: 'Log de auditoría: quién hizo qué y cuándo (solo ADMIN).',
      parameters: z.object({
        q: search,
        module: opt(z.string()),
        action: opt(z.string()),
        userId: opt(z.number().int().positive()),
        startDate: isoDate('Desde.'),
        endDate: isoDate('Hasta.'),
        page,
        limit,
      }),
      run: async (input) => s.audit.findAll(await toDto(ListAuditLogQueryDto, { ...input, ...paging(input) })),
    }),
  ];
}

/**
 * Convierte la especificación en una herramienta del SDK de agentes:
 * - verifica rol/permisos antes de pedir confirmación y antes de ejecutar;
 * - las de escritura piden aprobación (needsApproval) y quedan en auditoría.
 */
export function toAgentTool(
  spec: MundiToolSpec,
  services: Pick<MundiServices, 'audit'>,
) {
  return tool({
    name: spec.name,
    description: spec.write
      ? `${spec.description} REQUIERE CONFIRMACIÓN del usuario: el sistema se la pide automáticamente.`
      : spec.description,
    parameters: spec.parameters,
    strict: true,
    // Solo se pide confirmación cuando el usuario sí tiene permiso: si no lo
    // tiene, execute responde el motivo sin tocar datos.
    needsApproval: async (runContext: RunContext<MundiRunContext>) =>
      Boolean(spec.write) && accessDenial(runContext.context, spec.access) === null,
    execute: async (input, runContext?: RunContext<MundiRunContext>, details?) => {
      const ctx = runContext?.context;
      if (!ctx?.user) return toToolOutput({ error: 'Sesión no válida.' });
      const denial = accessDenial(ctx, spec.access);
      if (denial) return toToolOutput({ error: denial, permitido: false });

      const callId = details?.toolCall?.callId;
      // Defensa extra al SDK: la escritura solo corre si el usuario confirmó esta llamada.
      if (spec.write && !(callId && ctx.confirmedCallIds?.has(callId))) {
        return toToolOutput({ error: 'La acción no fue confirmada por el usuario.', ejecutada: false });
      }

      try {
        const result = await spec.run(input as never, ctx);
        if (spec.write) {
          const entity = result as { id?: number; consecutive?: string } | null;
          await services.audit.log({
            actor: ctx.user,
            module: 'MUNDI',
            action: `MUNDI_${spec.name.toUpperCase()}`,
            entityType: spec.module,
            entityId: typeof entity?.id === 'number' ? entity.id : null,
            entityLabel: entity?.consecutive ?? null,
            description: `Mundi (asistente IA) ejecutó "${spec.label}" confirmado por ${ctx.user.username}.`,
            metadata: { tool: spec.name, input: stripNulls(input) as Record<string, unknown>, callId },
          });
        }
        return toToolOutput(result);
      } catch (error) {
        if (spec.write) {
          await services.audit
            .log({
              actor: ctx.user,
              module: 'MUNDI',
              action: `MUNDI_${spec.name.toUpperCase()}_FALLIDA`,
              entityType: spec.module,
              description: `Mundi no pudo ejecutar "${spec.label}": ${errorMessage(error)}`,
              metadata: { tool: spec.name, input: stripNulls(input) as Record<string, unknown>, callId },
            })
            .catch(() => undefined);
        }
        return toToolOutput({ error: errorMessage(error) });
      }
    },
  });
}
