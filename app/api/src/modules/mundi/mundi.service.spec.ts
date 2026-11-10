import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Model, ModelProvider, ModelRequest } from '@openai/agents';
import { Role } from '../../common/enums/role.enum';
import { CreateInvoiceDto } from '../facturas/dto/create-invoice.dto';
import { CreateReceiptDto } from '../recibos/dto/receipt.dto';
import { accessDenial, buildPermissionSet } from './mundi-access';
import { MundiValidationError, toDto, toToolOutput } from './mundi-tools';
import { MundiService, type MundiEvent } from './mundi.service';

type Turn =
  | { text: string }
  | { call: { name: string; args: Record<string, unknown>; callId?: string } };

/** Modelo de OpenAI simulado: responde turnos guionizados y guarda las solicitudes. */
class ScriptedModel implements Model {
  readonly requests: ModelRequest[] = [];
  constructor(private readonly turns: Turn[]) {}

  private output(turn: Turn | undefined) {
    if (turn && 'call' in turn) {
      return [
        {
          type: 'function_call' as const,
          id: `fc_${turn.call.callId ?? turn.call.name}`,
          callId: turn.call.callId ?? `call_${turn.call.name}`,
          name: turn.call.name,
          arguments: JSON.stringify(turn.call.args),
          status: 'completed' as const,
        },
      ];
    }
    return [
      {
        type: 'message' as const,
        id: 'msg_1',
        role: 'assistant' as const,
        status: 'completed' as const,
        content: [{ type: 'output_text' as const, text: turn?.text ?? 'Listo.' }],
      },
    ];
  }

  getResponse(request: ModelRequest) {
    this.requests.push(request);
    const output = this.output(this.turns.shift());
    return Promise.resolve({
      usage: { requests: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 } as never,
      output,
      responseId: 'resp_1',
    });
  }

  async *getStreamedResponse(request: ModelRequest) {
    this.requests.push(request);
    const output = this.output(this.turns.shift());
    yield { type: 'response_started' as const };
    for (const item of output) {
      if (item.type === 'message') {
        yield { type: 'output_text_delta' as const, delta: item.content[0].text };
      }
    }
    yield {
      type: 'response_done' as const,
      response: {
        id: 'resp_1',
        usage: { requests: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        output,
      },
    } as never;
  }
}

function fnMock(value: unknown = { id: 1 }) {
  return jest.fn().mockResolvedValue(value);
}

function setup(turns: Turn[], options: { overrides?: Array<{ code: string; isAllowed: boolean }>; provider?: boolean } = {}) {
  const model = new ScriptedModel(turns);
  const provider: ModelProvider = { getModel: () => model };
  const prisma = { userPermission: { findMany: fnMock(options.overrides ?? []) } };
  const audit = { log: fnMock({ id: 900 }), findAll: fnMock({ data: [] }) };
  const facturas = {
    findAll: fnMock({ data: [], total: 0, page: 1, totalPages: 1 }),
    findOne: fnMock({ id: 10 }),
    create: fnMock({ id: 55, consecutive: 'FAC-55', total: '119000.00' }),
    remove: fnMock({ id: 55 }),
    bonusBalance: fnMock({ balance: 0 }),
  };
  const clientes = {
    findAll: fnMock({ data: [{ id: 3, firstName: 'Ana', lastName: 'Pérez' }], total: 1 }),
    findOne: fnMock({ id: 3 }),
    create: fnMock({ id: 3 }),
    update: fnMock({ id: 3 }),
  };
  const compras = { create: fnMock({ id: 8 }), findAll: fnMock({ data: [] }) };
  const generic = () =>
    new Proxy({}, { get: (target: Record<string, jest.Mock>, key: string) => (target[key] ??= fnMock({})) });

  const service = new MundiService(
    prisma as never,
    audit as never,
    facturas as never,
    clientes as never,
    generic() as never, // productos
    generic() as never, // productProfit
    generic() as never, // inventario
    generic() as never, // bodegas
    compras as never,
    generic() as never, // proveedores
    generic() as never, // cuentasBancarias
    generic() as never, // movimientosBancarios
    generic() as never, // recibos
    generic() as never, // creditos
    generic() as never, // anticipos
    generic() as never, // devoluciones
    generic() as never, // cotizaciones
    generic() as never, // deliveries
    generic() as never, // retenciones
    generic() as never, // ofertas
    generic() as never, // usuarios
    options.provider === false ? undefined : provider,
  );
  return { service, model, prisma, audit, facturas, clientes, compras };
}

const admin = { sub: 1, username: 'admin@mundotienda.com', role: Role.ADMIN };
const cajero = { sub: 2, username: 'caja@mundotienda.com', role: Role.CAJERO };

async function collect(events: AsyncIterable<MundiEvent>) {
  const out: MundiEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

function toolOutputsSentToModel(model: ScriptedModel) {
  const last = model.requests.at(-1);
  const input = Array.isArray(last?.input) ? last.input : [];
  return input
    .filter((item) => (item as { type?: string }).type === 'function_call_result')
    .map((item) => JSON.stringify((item as { output?: unknown }).output));
}

const invoiceArgs = {
  clientId: 3,
  warehouseId: null,
  saleMode: 'CONTADO',
  creditDueDate: null,
  priceLevel: null,
  items: [{ productId: 7, barcode: null, quantity: 2, warehouseId: null, productPriceId: null, unitPrice: null }],
  payments: [{ bankAccountId: 1, advanceId: null, amount: 119000, reference: null }],
  paymentNotes: null,
};

describe('Mundi: permisos', () => {
  it('replica roles y permisos de los guards', () => {
    const vendedor = { sub: 3, username: 'v', role: Role.VENDEDOR };
    const ctx = { user: vendedor, permissions: buildPermissionSet(vendedor, []) };
    expect(accessDenial(ctx, { permissions: ['CLIENTS_EDIT'] })).toBeNull();
    expect(accessDenial(ctx, { roles: [Role.ADMIN, Role.CONTADOR, Role.BODEGA] })).toMatch(/rol/);

    const restricted = {
      user: vendedor,
      permissions: buildPermissionSet(vendedor, [{ code: 'CLIENTS_EDIT', isAllowed: false }]),
    };
    expect(accessDenial(restricted, { permissions: ['CLIENTS_EDIT'] })).toMatch(/CLIENTS_EDIT/);

    const adminCtx = { user: admin, permissions: new Set<string>() };
    expect(accessDenial(adminCtx, { permissions: ['CUALQUIERA'] })).toBeNull();
  });

  it('marca como escritura todas las herramientas que modifican datos', () => {
    const { service } = setup([]);
    const writes = service.listTools().filter((item) => item.write).map((item) => item.name);
    expect(writes).toEqual(
      expect.arrayContaining([
        'crear_factura',
        'anular_factura',
        'crear_compra',
        'pagar_compra',
        'registrar_recibo',
        'registrar_abono_credito',
        'crear_devolucion',
        'movimiento_inventario',
        'movimiento_bancario',
        'crear_cliente',
      ]),
    );
    expect(writes).not.toContain('buscar_clientes');
    expect(writes).not.toContain('reporte_ventas');
  });
});

describe('Mundi: ejecución del agente', () => {
  beforeEach(() => jest.clearAllMocks());

  it('las consultas se ejecutan directo y responden en streaming', async () => {
    const { service, clientes, model } = setup([
      { call: { name: 'buscar_clientes', args: { q: 'Ana', estado: null, page: null, limit: null } } },
      { text: 'Encontré a Ana Pérez.' },
    ]);

    const events = await collect(service.chat(admin, { messages: [{ role: 'user', content: '¿Quién es Ana?' }] }));

    expect(clientes.findAll).toHaveBeenCalledWith(expect.objectContaining({ q: 'Ana', page: 1, limit: 20 }));
    expect(events).toContainEqual({ type: 'tool', name: 'buscar_clientes', label: 'Buscar clientes', status: 'start' });
    expect(events).toContainEqual({ type: 'text', delta: 'Encontré a Ana Pérez.' });
    expect(events.at(-1)).toEqual({ type: 'done', text: 'Encontré a Ana Pérez.' });
    expect(toolOutputsSentToModel(model).join()).toContain('Ana');
    // Configuración pedida: razonamiento alto.
    expect(model.requests[0].modelSettings.reasoning?.effort).toBe('high');
  });

  it('las acciones de escritura piden confirmación y no tocan datos antes', async () => {
    const { service, facturas, audit } = setup([
      { call: { name: 'crear_factura', args: invoiceArgs, callId: 'call_fac' } },
      { text: 'Factura FAC-55 creada.' },
    ]);

    const events = await collect(service.chat(admin, { messages: [{ role: 'user', content: 'Factura a Ana' }] }));
    const approval = events.find((event) => event.type === 'approval');

    expect(approval).toMatchObject({
      type: 'approval',
      actions: [{ callId: 'call_fac', name: 'crear_factura', label: 'Crear factura' }],
    });
    expect(approval && approval.type === 'approval' && approval.actions[0].summary).toContain('CONTADO');
    expect(facturas.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();

    const resumed = await collect(
      service.confirm(admin, (approval as { pendingId: string }).pendingId, true)(),
    );

    expect(facturas.create).toHaveBeenCalledTimes(1);
    const [dto, actor] = facturas.create.mock.calls[0];
    expect(dto).toBeInstanceOf(CreateInvoiceDto);
    expect(dto).toMatchObject({ clientId: 3, saleMode: 'CONTADO', source: 'ADMIN' });
    expect(dto.items[0].unitPrice).toBeUndefined();
    expect(actor).toBe(admin);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: admin,
        module: 'MUNDI',
        action: 'MUNDI_CREAR_FACTURA',
        entityId: 55,
        entityLabel: 'FAC-55',
      }),
    );
    expect(resumed.at(-1)).toEqual({ type: 'done', text: 'Factura FAC-55 creada.' });
  });

  it('si el usuario cancela, la acción no se ejecuta', async () => {
    const { service, facturas, model } = setup([
      { call: { name: 'crear_factura', args: invoiceArgs } },
      { text: 'Entendido, no la creé.' },
    ]);
    const events = await collect(service.chat(admin, { messages: [{ role: 'user', content: 'Factura' }] }));
    const { pendingId } = events.find((event) => event.type === 'approval') as { pendingId: string };

    await collect(service.confirm(admin, pendingId, false)());

    expect(facturas.create).not.toHaveBeenCalled();
    expect(toolOutputsSentToModel(model).join()).toContain('canceló');
  });

  it('sin permiso no pide confirmación ni ejecuta; le explica el motivo al modelo', async () => {
    const { service, compras, model } = setup([
      {
        call: {
          name: 'crear_compra',
          args: {
            providerId: 1,
            warehouseId: 1,
            externalReference: null,
            invoiceDate: null,
            dueDate: null,
            paymentCondition: null,
            notes: null,
            freight: null,
            discount1Percent: null,
            items: [{ productId: 7, quantity: 1, unit: null, unitCost: 1000 }],
          },
        },
      },
      { text: 'No tienes permiso para crear compras.' },
    ]);

    const events = await collect(service.chat(cajero, { messages: [{ role: 'user', content: 'Crea la compra' }] }));

    expect(events.some((event) => event.type === 'approval')).toBe(false);
    expect(compras.create).not.toHaveBeenCalled();
    expect(toolOutputsSentToModel(model).join()).toMatch(/rol \(CAJERO\)/);
  });

  it('respeta permisos personalizados del usuario (overrides)', async () => {
    const { service, clientes, model } = setup(
      [
        { call: { name: 'buscar_clientes', args: { q: null, estado: null, page: null, limit: null } } },
        { text: 'Sin acceso.' },
      ],
      { overrides: [{ code: 'CLIENTS_VIEW', isAllowed: false }] },
    );

    await collect(service.chat(cajero, { messages: [{ role: 'user', content: 'Clientes' }] }));

    expect(clientes.findAll).not.toHaveBeenCalled();
    expect(toolOutputsSentToModel(model).join()).toContain('CLIENTS_VIEW');
  });

  it('una confirmación solo la puede usar quien la originó y una sola vez', async () => {
    const { service } = setup([{ call: { name: 'crear_factura', args: invoiceArgs } }, { text: 'ok' }]);
    const events = await collect(service.chat(admin, { messages: [{ role: 'user', content: 'Factura' }] }));
    const { pendingId } = events.find((event) => event.type === 'approval') as { pendingId: string };

    expect(() => service.confirm(cajero, pendingId, true)).toThrow(ForbiddenException);
    await collect(service.confirm(admin, pendingId, true)());
    expect(() => service.confirm(admin, pendingId, true)).toThrow(NotFoundException);
  });

  it('envía PDFs e imágenes adjuntos como archivos de entrada', async () => {
    const { service, model } = setup([{ text: 'Leí la factura.' }]);
    await collect(
      service.chat(admin, {
        messages: [
          {
            role: 'user',
            content: 'Lee esta factura',
            attachments: [
              { name: 'factura.pdf', mimeType: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0=' },
              { name: 'foto.png', mimeType: 'image/png', data: 'data:image/png;base64,iVBORw0=' },
            ],
          },
        ],
      }),
    );

    const content = JSON.stringify(model.requests[0].input);
    expect(content).toContain('"type":"input_file"');
    expect(content).toContain('factura.pdf');
    expect(content).toContain('"type":"input_image"');
  });

  it('sin OPENAI_API_KEY responde un mensaje claro', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    try {
      const { service } = setup([], { provider: false });
      const events = await collect(service.chat(admin, { messages: [{ role: 'user', content: 'Hola' }] }));
      expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'NOT_CONFIGURED' })]);
      expect(service.status(admin)).toMatchObject({ configured: false, message: expect.stringContaining('OPENAI_API_KEY') });
    } finally {
      process.env.OPENAI_API_KEY = previous;
    }
  });
});

describe('Mundi: utilidades', () => {
  it('valida con los mismos DTO del API', async () => {
    await expect(toDto(CreateReceiptDto, { documentNumber: '', detail: 'x', allocations: [] })).rejects.toBeInstanceOf(
      MundiValidationError,
    );
    const dto = await toDto(CreateInvoiceDto, { ...invoiceArgs, hack: true });
    expect(dto).not.toHaveProperty('hack');
    expect(dto.creditDueDate).toBeUndefined();
  });

  it('oculta datos sensibles y archivos en la salida de herramientas', () => {
    const output = toToolOutput({ password: 'x', supportData: 'data:...', nested: { image: `data:image/png;base64,${'A'.repeat(300)}` } });
    expect(output).not.toContain('password');
    expect(output).not.toContain('supportData');
    expect(output).toContain('archivo adjunto omitido');
  });
});
