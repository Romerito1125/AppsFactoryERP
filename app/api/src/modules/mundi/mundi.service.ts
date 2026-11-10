import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  Agent,
  OpenAIProvider,
  Runner,
  type AgentInputItem,
  type ModelProvider,
  type RunContext,
  type RunState,
  type RunToolApprovalItem,
} from '@openai/agents';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AnticiposService } from '../anticipos/anticipos.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { BodegasService } from '../bodegas/bodegas.service';
import { ClientesService } from '../clientes/clientes.service';
import { ComprasService } from '../compras/compras.service';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';
import { CreditosService } from '../creditos/creditos.service';
import { CuentasBancariasService } from '../cuentas-bancarias/cuentas-bancarias.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DevolucionesService } from '../devoluciones/devoluciones.service';
import { FacturasService } from '../facturas/facturas.service';
import { InventarioService } from '../inventario/inventario.service';
import { MovimientosBancariosService } from '../movimientos-bancarios/movimientos-bancarios.service';
import { OfertasService } from '../ofertas/ofertas.service';
import { ProductProfitService } from '../productos/product-profit.service';
import { ProductosService } from '../productos/productos.service';
import { ProveedoresService } from '../proveedores/proveedores.service';
import { RecibosService } from '../recibos/recibos.service';
import { RetencionesService } from '../retenciones/retenciones.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import type { MundiChatDto, MundiMessageDto } from './dto/mundi-chat.dto';
import { accessDenial, buildPermissionSet, type MundiRunContext } from './mundi-access';
import { readMundiConfig, type MundiConfig } from './mundi.config';
import { buildMundiInstructions } from './mundi.instructions';
import {
  buildMundiToolSpecs,
  errorMessage,
  toAgentTool,
  type MundiServices,
  type MundiToolSpec,
} from './mundi-tools';

/** Permite a las pruebas inyectar un modelo simulado en vez de OpenAI. */
export const MUNDI_MODEL_PROVIDER = 'MUNDI_MODEL_PROVIDER';

export type MundiEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; label: string; status: 'start' | 'done' }
  | {
      type: 'approval';
      pendingId: string;
      actions: Array<{
        callId: string;
        name: string;
        label: string;
        summary: string;
        arguments: Record<string, unknown>;
      }>;
    }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string; code?: string };

interface PendingRun {
  userId: number;
  state: RunState<MundiRunContext, Agent<MundiRunContext>>;
  context: MundiRunContext;
  callIds: string[];
  createdAt: number;
}

const PENDING_TTL_MS = 30 * 60 * 1000;
const MAX_PENDING_PER_USER = 5;

export const MUNDI_NOT_CONFIGURED =
  'Mundi aún no está configurado: falta la variable OPENAI_API_KEY en app/api/.env. Agrégala y reinicia la API.';

@Injectable()
export class MundiService {
  private readonly logger = new Logger(MundiService.name);
  private readonly pending = new Map<string, PendingRun>();
  private readonly specs: MundiToolSpec[];
  private readonly specByName: Map<string, MundiToolSpec>;
  private readonly agent: Agent<MundiRunContext>;
  private runner: Runner | null = null;
  readonly config: MundiConfig;

  constructor(
    private readonly prisma: PrismaService,
    audit: AuditLogService,
    facturas: FacturasService,
    clientes: ClientesService,
    productos: ProductosService,
    productProfit: ProductProfitService,
    inventario: InventarioService,
    bodegas: BodegasService,
    compras: ComprasService,
    proveedores: ProveedoresService,
    cuentasBancarias: CuentasBancariasService,
    movimientosBancarios: MovimientosBancariosService,
    recibos: RecibosService,
    creditos: CreditosService,
    anticipos: AnticiposService,
    devoluciones: DevolucionesService,
    cotizaciones: CotizacionesService,
    deliveries: DeliveriesService,
    retenciones: RetencionesService,
    ofertas: OfertasService,
    usuarios: UsuariosService,
    @Optional()
    @Inject(MUNDI_MODEL_PROVIDER)
    private readonly modelProviderOverride?: ModelProvider,
  ) {
    this.config = readMundiConfig();
    const services: MundiServices = {
      audit,
      facturas,
      clientes,
      productos,
      productProfit,
      inventario,
      bodegas,
      compras,
      proveedores,
      cuentasBancarias,
      movimientosBancarios,
      recibos,
      creditos,
      anticipos,
      devoluciones,
      cotizaciones,
      deliveries,
      retenciones,
      ofertas,
      usuarios,
    };
    this.specs = buildMundiToolSpecs(services);
    this.specByName = new Map(this.specs.map((spec) => [spec.name, spec]));
    this.agent = new Agent<MundiRunContext>({
      name: 'Mundi',
      instructions: (runContext: RunContext<MundiRunContext>) =>
        buildMundiInstructions(runContext.context, this.toolCatalogFor(runContext.context)),
      model: this.config.model,
      modelSettings: {
        reasoning: { effort: this.config.reasoningEffort },
      },
      tools: this.specs.map((spec) => toAgentTool(spec, services)),
    });
  }

  get isConfigured() {
    return Boolean(this.modelProviderOverride) || this.config.configured;
  }

  status(user: AuthUser) {
    return {
      configured: this.isConfigured,
      model: this.config.model,
      reasoningEffort: this.config.reasoningEffort,
      message: this.isConfigured ? null : MUNDI_NOT_CONFIGURED,
      user: { username: user.username, role: user.role },
      tools: this.specs.length,
    };
  }

  /** Lista de herramientas (para la UI o pruebas). */
  listTools() {
    return this.specs.map((spec) => ({
      name: spec.name,
      label: spec.label,
      module: spec.module,
      write: Boolean(spec.write),
      access: spec.access,
    }));
  }

  private toolCatalogFor(ctx: MundiRunContext) {
    return this.specs.map((spec) => ({
      name: spec.name,
      write: Boolean(spec.write),
      allowed: accessDenial(ctx, spec.access) === null,
    }));
  }

  private getRunner() {
    if (!this.runner) {
      const modelProvider: ModelProvider =
        this.modelProviderOverride ?? new OpenAIProvider({ apiKey: this.config.apiKey });
      this.runner = new Runner({
        modelProvider,
        // Los datos del negocio no salen a trazas de OpenAI salvo que se active.
        tracingDisabled: process.env.MUNDI_TRACING !== 'true',
        workflowName: 'Mundi ERP',
      });
    }
    return this.runner;
  }

  async buildContext(user: AuthUser): Promise<MundiRunContext> {
    const overrides = await this.prisma.userPermission.findMany({
      where: { userId: user.sub },
      select: { code: true, isAllowed: true },
    });
    return {
      user,
      permissions: buildPermissionSet(user, overrides),
      confirmedCallIds: new Set(),
    };
  }

  /** Convierte el historial del chat en items de entrada del SDK. */
  toAgentInput(messages: MundiMessageDto[]): AgentInputItem[] {
    return messages.map((message): AgentInputItem => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: message.content || '…' }],
        };
      }
      const content: Array<Record<string, unknown>> = [];
      for (const attachment of message.attachments ?? []) {
        if (attachment.mimeType.startsWith('image/')) {
          content.push({ type: 'input_image', image: attachment.data, detail: 'auto' });
        } else {
          content.push({ type: 'input_file', file: attachment.data, filename: attachment.name });
        }
      }
      const names = (message.attachments ?? []).map((item) => item.name).join(', ');
      content.push({
        type: 'input_text',
        text: message.content?.trim() || (names ? `Revisa el archivo adjunto: ${names}` : '…'),
      });
      return { role: 'user', content } as AgentInputItem;
    });
  }

  async *chat(user: AuthUser, dto: MundiChatDto, signal?: AbortSignal): AsyncGenerator<MundiEvent> {
    if (!this.isConfigured) {
      yield { type: 'error', code: 'NOT_CONFIGURED', message: MUNDI_NOT_CONFIGURED };
      return;
    }
    const context = await this.buildContext(user);
    yield* this.execute(this.toAgentInput(dto.messages), context, signal);
  }

  /**
   * Aplica la decisión del usuario sobre una acción pendiente. Valida dueño y
   * expiración de inmediato (lanza 404/403) y devuelve la reanudación del agente.
   */
  confirm(user: AuthUser, pendingId: string, approve: boolean) {
    this.prunePending();
    const pending = this.pending.get(pendingId);
    if (!pending) {
      throw new NotFoundException(
        'La acción pendiente ya no existe o expiró. Vuelve a pedírsela a Mundi.',
      );
    }
    if (pending.userId !== user.sub) {
      throw new ForbiddenException('Esta confirmación pertenece a otro usuario.');
    }
    this.pending.delete(pendingId);

    for (const interruption of pending.state.getInterruptions()) {
      const callId = this.callIdOf(interruption);
      if (approve) {
        if (callId) pending.context.confirmedCallIds?.add(callId);
        pending.state.approve(interruption);
      } else {
        pending.state.reject(interruption, {
          message: 'El usuario canceló esta acción. No se modificó ningún dato.',
        });
      }
    }
    return (signal?: AbortSignal) => this.execute(pending.state, pending.context, signal);
  }

  private callIdOf(item: RunToolApprovalItem) {
    const raw = item.rawItem as { callId?: string; id?: string };
    return raw.callId ?? raw.id ?? '';
  }

  private parseArguments(item: RunToolApprovalItem) {
    try {
      return JSON.parse(item.arguments ?? '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async *execute(
    input: AgentInputItem[] | RunState<MundiRunContext, Agent<MundiRunContext>>,
    context: MundiRunContext,
    signal?: AbortSignal,
  ): AsyncGenerator<MundiEvent> {
    let text = '';
    try {
      const stream = await this.getRunner().run(this.agent, input, {
        stream: true,
        context,
        maxTurns: this.config.maxTurns,
        signal,
      });

      for await (const event of stream) {
        if (event.type === 'raw_model_stream_event') {
          const data = event.data as { type?: string; delta?: string };
          if (data.type === 'output_text_delta' && data.delta) {
            text += data.delta;
            yield { type: 'text', delta: data.delta };
          }
        } else if (event.type === 'run_item_stream_event') {
          if (event.name !== 'tool_called' && event.name !== 'tool_output') continue;
          const raw = event.item.rawItem as { name?: string };
          const name = raw?.name ?? (event.item as { name?: string }).name ?? '';
          const spec = this.specByName.get(name);
          if (!spec) continue;
          yield {
            type: 'tool',
            name,
            label: spec.label,
            status: event.name === 'tool_called' ? 'start' : 'done',
          };
        }
      }
      await stream.completed;
      if (stream.error) throw stream.error;

      const interruptions = stream.interruptions ?? [];
      if (interruptions.length) {
        const pendingId = randomUUID();
        const actions = interruptions.map((item) => {
          const name = item.name ?? '';
          const spec = this.specByName.get(name);
          const args = this.parseArguments(item);
          let summary = spec?.label ?? name;
          try {
            summary = spec?.summarize?.(args as never) ?? summary;
          } catch {
            // El resumen es solo informativo.
          }
          return { callId: this.callIdOf(item), name, label: spec?.label ?? name, summary, arguments: args };
        });
        this.storePending(pendingId, {
          userId: context.user.sub,
          state: stream.state,
          context,
          callIds: actions.map((action) => action.callId),
          createdAt: Date.now(),
        });
        yield { type: 'approval', pendingId, actions };
        return;
      }

      const finalOutput = typeof stream.finalOutput === 'string' ? stream.finalOutput : text;
      yield { type: 'done', text: finalOutput || text };
    } catch (error) {
      if (signal?.aborted) return;
      this.logger.error(`Mundi falló: ${errorMessage(error)}`);
      yield { type: 'error', ...this.describeError(error) };
    }
  }

  private describeError(error: unknown): { message: string; code?: string } {
    const message = errorMessage(error);
    const status = (error as { status?: number })?.status;
    if (status === 401 || /incorrect api key|invalid api key|401/i.test(message)) {
      return { code: 'INVALID_KEY', message: 'La OPENAI_API_KEY configurada no es válida. Revisa app/api/.env.' };
    }
    if (status === 404 || /model .*(does not exist|not found)|model_not_found/i.test(message)) {
      return {
        code: 'MODEL_NOT_FOUND',
        message: `El modelo "${this.config.model}" no está disponible para esta cuenta de OpenAI. Cambia OPENAI_MODEL en app/api/.env.`,
      };
    }
    if (status === 429 || /rate limit|quota/i.test(message)) {
      return { code: 'RATE_LIMIT', message: 'OpenAI rechazó la solicitud por límite de uso o saldo. Intenta en un momento.' };
    }
    if (/max turns/i.test(message)) {
      return { code: 'MAX_TURNS', message: 'La tarea requirió demasiados pasos. Divide la solicitud en partes más pequeñas.' };
    }
    return { message: `Mundi no pudo responder: ${message}` };
  }

  private storePending(id: string, run: PendingRun) {
    this.prunePending();
    const mine = [...this.pending.entries()]
      .filter(([, item]) => item.userId === run.userId)
      .sort(([, a], [, b]) => a.createdAt - b.createdAt);
    while (mine.length >= MAX_PENDING_PER_USER) {
      const [oldest] = mine.shift()!;
      this.pending.delete(oldest);
    }
    this.pending.set(id, run);
  }

  private prunePending() {
    const now = Date.now();
    for (const [id, run] of this.pending) {
      if (now - run.createdAt > PENDING_TTL_MS) this.pending.delete(id);
    }
  }
}
