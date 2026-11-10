import { apiClient, getStoredSession } from "@/lib/api-client";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

export const MUNDI_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MUNDI_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

// Estado del asistente. Pasa por apiClient para refrescar el token si está por vencer.
export function fetchMundiStatus() {
  return apiClient.get("/mundi/estado");
}

/**
 * POST con respuesta NDJSON (un evento JSON por línea). Llama onEvent por cada
 * evento a medida que llega para mostrar el texto en vivo.
 */
async function streamNdjson(path, body, onEvent, signal) {
  // Asegura un token vigente antes de abrir el stream.
  await fetchMundiStatus();
  const session = getStoredSession();
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("No se pudo conectar con el sistema. Verifica que el servicio esté disponible.");
  }

  if (!response.ok) {
    const text = await response.text();
    let message = "Mundi no pudo procesar la solicitud.";
    try {
      const payload = JSON.parse(text);
      message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message || message;
    } catch {
      if (response.status === 413) message = "Los archivos adjuntos son demasiado grandes.";
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line));
        } catch {
          // Línea incompleta o inválida: se ignora.
        }
      }
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()));
    } catch {
      // Sin evento final legible.
    }
  }
}

export function streamMundiChat(messages, onEvent, signal) {
  return streamNdjson("/mundi/chat", { messages }, onEvent, signal);
}

export function streamMundiConfirm(pendingId, approve, onEvent, signal) {
  return streamNdjson("/mundi/confirmar", { pendingId, approve }, onEvent, signal);
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
    reader.readAsDataURL(file);
  });
}
