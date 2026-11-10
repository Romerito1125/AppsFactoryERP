import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Ellipsis,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { formatCop } from "@/lib/cop";
import mundiAvatar from "./mundi-avatar.webp";
import {
  MUNDI_ACCEPT,
  MUNDI_MAX_FILE_BYTES,
  fetchMundiStatus,
  readFileAsDataUrl,
  streamMundiChat,
  streamMundiConfirm,
} from "./mundi-api";
import { MundiMarkdown } from "./mundi-markdown";
import "./mundi-chat.css";

const STORAGE_KEY = "mundi-chat-v1";
const MAX_ATTACHMENTS = 5;

const GREETING = {
  id: "greeting",
  role: "assistant",
  content:
    "¡Hola! 👋 Soy **Mundi**, tu asistente de Mundo Tienda. Puedo consultar ventas, inventario, cartera y bancos, crear facturas, compras o recibos (siempre te pido confirmación) y leer PDFs como facturas de proveedor. ¿En qué te ayudo?",
};

const SUGGESTIONS = [
  "¿Cuánto vendimos este mes?",
  "¿Qué productos están bajo el mínimo?",
  "¿Qué clientes tienen créditos vencidos?",
  "Saldos de las cuentas bancarias",
];

// Campos de dinero en las acciones: se muestran con formatCop.
const MONEY_KEYS = new Set([
  "amount",
  "unitCost",
  "unitPrice",
  "freight",
  "maxCredit",
  "deliveryFee",
  "retention",
  "cashAmount",
  "totalAmount",
]);

const FIELD_LABELS = {
  clientId: "Cliente",
  providerId: "Proveedor",
  warehouseId: "Bodega",
  bankAccountId: "Cuenta bancaria",
  fromBankAccountId: "Cuenta origen",
  toBankAccountId: "Cuenta destino",
  fromWarehouseId: "Bodega origen",
  toWarehouseId: "Bodega destino",
  invoiceId: "Factura",
  purchaseOrderId: "Compra",
  creditId: "Crédito",
  quoteId: "Cotización",
  deliveryId: "Domicilio",
  productId: "Producto",
  saleMode: "Modalidad",
  creditDueDate: "Vence",
  amount: "Monto",
  quantity: "Cantidad",
  reason: "Motivo",
  tipo: "Tipo",
  accion: "Acción",
  kind: "Tipo",
  status: "Estado",
  documentNumber: "Documento",
  detail: "Detalle",
  externalReference: "Factura proveedor",
  description: "Descripción",
  name: "Nombre",
  firstName: "Nombres",
  lastName: "Apellidos",
  identification: "Identificación",
  address: "Dirección",
  notes: "Notas",
};

const ID_KEYS = /Id$/;

let messageSeq = 0;
const newId = () => `m${Date.now().toString(36)}${(messageSeq++).toString(36)}`;

function loadStoredMessages() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : [GREETING];
  } catch {
    return [GREETING];
  }
}

function storeMessages(messages) {
  try {
    // Sin el contenido de los adjuntos: solo nombres, para no llenar el almacenamiento.
    const light = messages
      .filter((message) => !message.streaming)
      .map(({ attachments, approval, ...rest }) => ({
        ...rest,
        attachments: attachments?.map(({ name, mimeType }) => ({ name, mimeType })),
        approval: approval ? { ...approval, resolved: approval.resolved ?? "expired" } : undefined,
      }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(light.slice(-60)));
  } catch {
    // Almacenamiento no disponible: el chat sigue funcionando en memoria.
  }
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === "") return null;
  if (MONEY_KEYS.has(key) && typeof value === "number") return formatCop(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (ID_KEYS.test(key) && typeof value === "number") return `#${value}`;
  return String(value);
}

function itemLine(item) {
  const product = item.productId ? `Producto #${item.productId}` : item.barcode ? `Código ${item.barcode}` : null;
  const lineId = item.invoiceItemId ? `Línea #${item.invoiceItemId}` : null;
  const target = item.creditId
    ? `Crédito #${item.creditId}`
    : item.purchaseOrderId
      ? `Compra #${item.purchaseOrderId}`
      : item.bankAccountId
        ? `Cuenta #${item.bankAccountId}`
        : null;
  const label = product ?? lineId ?? target ?? "Línea";
  const qty = item.quantity ? ` × ${item.quantity}` : "";
  const price = item.unitCost ?? item.unitPrice;
  const money = price ? ` a ${formatCop(price)}` : item.amount ? `: ${formatCop(item.amount)}` : "";
  return `${label}${qty}${money}`;
}

function ActionDetails({ args }) {
  const rows = [];
  const lists = [];
  for (const [key, value] of Object.entries(args ?? {})) {
    if (Array.isArray(value)) {
      if (value.length) lists.push([key, value]);
      continue;
    }
    if (value && typeof value === "object") continue;
    const shown = formatValue(key, value);
    if (shown !== null) rows.push([FIELD_LABELS[key] ?? key, shown]);
  }
  const listTitles = { items: "Líneas", payments: "Pagos", allocations: "Documentos", instruments: "Medios de pago" };
  return (
    <div className="mundi-action-details">
      {rows.length > 0 && (
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {lists.map(([key, value]) => {
        const total = value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        return (
          <div className="mundi-action-list" key={key}>
            <span>{listTitles[key] ?? key}</span>
            <ul>
              {value.map((item, index) => (
                <li key={index}>{itemLine(item)}</li>
              ))}
            </ul>
            {total > 0 && <strong>Total: {formatCop(total)}</strong>}
          </div>
        );
      })}
    </div>
  );
}

function ApprovalCard({ approval, busy, onDecide }) {
  const resolved = approval.resolved;
  return (
    <div className={`mundi-approval ${resolved ? `is-${resolved}` : ""}`}>
      <div className="mundi-approval-head">
        <ShieldCheck size={16} aria-hidden="true" />
        <strong>{resolved ? "Acción" : "Confirma esta acción"}</strong>
      </div>
      {approval.actions.map((action) => (
        <div className="mundi-approval-action" key={action.callId || action.name}>
          <b>{action.label}</b>
          <p>{action.summary}</p>
          <ActionDetails args={action.arguments} />
        </div>
      ))}
      {resolved ? (
        <p className="mundi-approval-result">
          {resolved === "approved" && "✔ Confirmada"}
          {resolved === "rejected" && "✖ Cancelada"}
          {resolved === "expired" && "Ya no está disponible"}
        </p>
      ) : (
        <div className="mundi-approval-buttons">
          <button type="button" className="mundi-btn-cancel" disabled={busy} onClick={() => onDecide(false)}>
            Cancelar
          </button>
          <button type="button" className="mundi-btn-confirm" disabled={busy} onClick={() => onDecide(true)}>
            <Check size={15} aria-hidden="true" /> Confirmar
          </button>
        </div>
      )}
    </div>
  );
}

function AttachmentChip({ attachment, onRemove }) {
  const Icon = attachment.mimeType === "application/pdf" ? FileText : ImageIcon;
  return (
    <span className="mundi-chip">
      <Icon size={13} aria-hidden="true" />
      <span title={attachment.name}>{attachment.name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar ${attachment.name}`}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/** Historial que viaja al API: texto completo y solo los adjuntos más recientes. */
function buildHistory(messages) {
  const usable = messages.filter(
    (message) => message.id !== "greeting" && (message.role === "user" || message.content?.trim()),
  );
  let withFiles = 0;
  const history = [];
  for (let index = usable.length - 1; index >= 0; index -= 1) {
    const message = usable[index];
    const files = (message.attachments ?? []).filter((item) => item.data);
    const keepFiles = files.length > 0 && withFiles < 2;
    if (keepFiles) withFiles += 1;
    const names = (message.attachments ?? []).map((item) => item.name).join(", ");
    history.unshift({
      role: message.role,
      content:
        message.content?.trim() ||
        (names ? `(adjuntó: ${names})` : message.role === "assistant" ? "…" : ""),
      ...(keepFiles
        ? { attachments: files.map(({ name, mimeType, data }) => ({ name, mimeType, data })) }
        : {}),
    });
  }
  return history.slice(-40);
}

export function MundiChat({ session }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadStoredMessages);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState(null);
  const [status, setStatus] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fileError, setFileError] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => storeMessages(messages), [messages]);

  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    fetchMundiStatus()
      .then((result) => !cancelled && setStatus(result))
      .catch((error) => !cancelled && setStatus({ configured: false, message: error.message, offline: true }));
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, activity, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchMessage = useCallback((id, patch) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, ...(typeof patch === "function" ? patch(message) : patch) } : message,
      ),
    );
  }, []);

  const runStream = useCallback(
    async (starter) => {
      const replyId = newId();
      setMessages((current) => [...current, { id: replyId, role: "assistant", content: "", streaming: true }]);
      setBusy(true);
      setActivity({ label: "Pensando…" });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await starter((event) => {
          if (event.type === "text") {
            setActivity(null);
            patchMessage(replyId, (message) => ({ content: `${message.content}${event.delta}` }));
          } else if (event.type === "tool") {
            setActivity(event.status === "start" ? { label: `${event.label}…`, tool: true } : { label: "Pensando…" });
          } else if (event.type === "approval") {
            patchMessage(replyId, { approval: { pendingId: event.pendingId, actions: event.actions } });
          } else if (event.type === "done") {
            patchMessage(replyId, (message) => ({ content: message.content || event.text }));
          } else if (event.type === "error") {
            patchMessage(replyId, { error: event.message, code: event.code });
            if (event.code === "NOT_CONFIGURED") setStatus((current) => ({ ...current, configured: false, message: event.message }));
          }
        }, controller.signal);
      } catch (error) {
        if (error?.name !== "AbortError") patchMessage(replyId, { error: error.message });
      } finally {
        patchMessage(replyId, { streaming: false });
        setBusy(false);
        setActivity(null);
        abortRef.current = null;
      }
    },
    [patchMessage],
  );

  const send = useCallback(
    (text) => {
      const content = (text ?? input).trim();
      if (busy || (!content && !attachments.length)) return;
      const userMessage = { id: newId(), role: "user", content, attachments };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInput("");
      setAttachments([]);
      setFileError("");
      runStream((onEvent, signal) => streamMundiChat(buildHistory(nextMessages), onEvent, signal));
    },
    [attachments, busy, input, messages, runStream],
  );

  const decide = useCallback(
    (messageId, pendingId, approve) => {
      if (busy) return;
      patchMessage(messageId, (message) => ({
        approval: { ...message.approval, resolved: approve ? "approved" : "rejected" },
      }));
      runStream((onEvent, signal) => streamMundiConfirm(pendingId, approve, onEvent, signal));
    },
    [busy, patchMessage, runStream],
  );

  async function addFiles(fileList) {
    setFileError("");
    const files = [...(fileList ?? [])];
    const room = MAX_ATTACHMENTS - attachments.length;
    if (files.length > room) setFileError(`Máximo ${MAX_ATTACHMENTS} archivos por mensaje.`);
    const accepted = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (!/^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(file.type)) {
        setFileError(`${file.name}: solo PDF o imágenes (PNG, JPG, WEBP, GIF).`);
        continue;
      }
      if (file.size > MUNDI_MAX_FILE_BYTES) {
        setFileError(`${file.name} supera los 10 MB.`);
        continue;
      }
      try {
        accepted.push({ name: file.name, mimeType: file.type, data: await readFileAsDataUrl(file) });
      } catch (error) {
        setFileError(error.message);
      }
    }
    if (accepted.length) setAttachments((current) => [...current, ...accepted]);
  }

  function resetConversation() {
    abortRef.current?.abort();
    setMessages([GREETING]);
    setAttachments([]);
    setInput("");
    setMenuOpen(false);
  }

  if (!session) return null;

  const configured = status?.configured !== false;
  const showSuggestions = messages.length === 1 && !busy;

  return (
    <div className="mundi-root">
      {open && (
        <section className="mundi-panel" role="dialog" aria-label="Chat con Mundi, asistente de IA">
          <header className="mundi-header">
            <img src={mundiAvatar} alt="" className="mundi-header-avatar" />
            <div className="mundi-header-title">
              <strong>Mundi</strong>
              <span>
                <i className={configured ? "is-online" : "is-offline"} />
                {configured ? "Asistente IA de Mundo Tienda" : "Sin configurar"}
              </span>
            </div>
            <div className="mundi-header-actions">
              <button type="button" aria-label="Más opciones" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
                <Ellipsis size={18} />
              </button>
              <button type="button" aria-label="Cerrar chat" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
              {menuOpen && (
                <div className="mundi-menu" role="menu">
                  <button type="button" role="menuitem" onClick={resetConversation}>
                    <RotateCcw size={14} /> Nueva conversación
                  </button>
                </div>
              )}
            </div>
          </header>

          {!configured && (
            <div className="mundi-warning" role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>{status?.message ?? "Mundi no está configurado."}</span>
            </div>
          )}

          <div className="mundi-messages" ref={listRef} aria-live="polite">
            {messages.map((message) => {
              const thinking = message.streaming && activity;
              const empty =
                !message.content && !message.attachments?.length && !message.approval && !message.error;
              // Un solo avatar por respuesta: el indicador va dentro de la respuesta en curso.
              if (empty && !thinking) return null;
              return (
              <div key={message.id} className={`mundi-row is-${message.role}`}>
                {message.role === "assistant" && <img src={mundiAvatar} alt="" className="mundi-row-avatar" />}
                <div className="mundi-bubble-stack">
                  {(message.content || message.attachments?.length > 0) && (
                    <div className="mundi-bubble">
                      {message.attachments?.length > 0 && (
                        <div className="mundi-bubble-files">
                          {message.attachments.map((item, index) => (
                            <AttachmentChip key={index} attachment={item} />
                          ))}
                        </div>
                      )}
                      {message.role === "assistant" ? <MundiMarkdown text={message.content} /> : message.content}
                    </div>
                  )}
                  {message.approval && (
                    <ApprovalCard
                      approval={message.approval}
                      busy={busy}
                      onDecide={(approve) => decide(message.id, message.approval.pendingId, approve)}
                    />
                  )}
                  {message.error && (
                    <div className="mundi-error">
                      <TriangleAlert size={14} aria-hidden="true" /> {message.error}
                    </div>
                  )}
                  {thinking && (
                    <div className="mundi-thinking">
                      {activity.tool ? (
                        <LoaderCircle size={14} className="mundi-spin" />
                      ) : (
                        <span className="mundi-dots">
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                      {activity.label}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>

          {showSuggestions && configured && (
            <div className="mundi-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <footer className="mundi-footer">
            {(attachments.length > 0 || fileError) && (
              <div className="mundi-pending-files">
                {attachments.map((item, index) => (
                  <AttachmentChip
                    key={`${item.name}-${index}`}
                    attachment={item}
                    onRemove={() => setAttachments((current) => current.filter((_, n) => n !== index))}
                  />
                ))}
                {fileError && <span className="mundi-file-error">{fileError}</span>}
              </div>
            )}
            <form
              className="mundi-input"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (configured) addFiles(event.dataTransfer.files);
              }}
            >
              <button
                type="button"
                className="mundi-attach"
                aria-label="Adjuntar PDF o imagen"
                title="Adjuntar PDF o imagen"
                disabled={!configured || busy}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip size={18} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={MUNDI_ACCEPT}
                multiple
                hidden
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                disabled={!configured}
                placeholder={configured ? "Pregúntale a Mundi…" : "Configura OPENAI_API_KEY para usar Mundi"}
                onChange={(event) => setInput(event.target.value)}
                onPaste={(event) => {
                  if (event.clipboardData.files?.length) {
                    event.preventDefault();
                    addFiles(event.clipboardData.files);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <button
                type="submit"
                className="mundi-send"
                aria-label="Enviar"
                disabled={!configured || busy || (!input.trim() && !attachments.length)}
              >
                {busy ? <LoaderCircle size={17} className="mundi-spin" /> : <ArrowUp size={18} />}
              </button>
            </form>
          </footer>
        </section>
      )}

      <button
        type="button"
        className={`mundi-launcher ${open ? "is-open" : ""}`}
        aria-label={open ? "Cerrar Mundi" : "Abrir Mundi, asistente de IA"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown size={26} /> : <img src={mundiAvatar} alt="" />}
      </button>
    </div>
  );
}
