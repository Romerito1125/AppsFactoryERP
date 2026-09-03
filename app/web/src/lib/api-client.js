const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(
  /\/$/,
  "",
);
const AUTH_STORAGE_KEY = "mmm-auth-session";

let refreshPromise = null;

export function getStoredSession() {
  try {
    const value = localStorage.getItem(AUTH_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function storeSession(session) {
  if (session) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent("auth:session-updated", { detail: session }),
  );
}

function buildUrl(path, params) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(
    `${API_BASE_URL}${normalizedPath}`,
    window.location.origin,
  );
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function parsePayload(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(payload, fallback) {
  if (Array.isArray(payload?.message)) return payload.message.join(", ");
  if (payload?.message) return payload.message;
  if (typeof payload === "string" && payload) return payload;
  return fallback;
}

function isAuthPath(path) {
  return ["/auth/login", "/auth/refresh"].includes(path);
}

function tokenIsNearExpiry(token) {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
    );
    return Number(payload.exp) - Math.floor(Date.now() / 1000) <= 300;
  } catch {
    return false;
  }
}

async function refreshAccessToken() {
  const current = getStoredSession();
  if (!current?.refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    })
      .then(async (response) => {
        const payload = parsePayload(await response.text());
        if (!response.ok || !payload?.accessToken || !payload?.refreshToken) {
          storeSession(null);
          return false;
        }
        storeSession({ ...current, ...payload });
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request(path, options = {}, params, allowRefresh = true) {
  let session = getStoredSession();
  if (
    session?.accessToken &&
    allowRefresh &&
    !isAuthPath(path) &&
    tokenIsNearExpiry(session.accessToken)
  ) {
    await refreshAccessToken();
    session = getStoredSession();
  }
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(session?.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el API. Verifica que el servidor esté iniciado.",
    );
  }
  const payload = parsePayload(await response.text());
  if (
    response.status === 401 &&
    session?.accessToken &&
    allowRefresh &&
    !isAuthPath(path)
  ) {
    if (await refreshAccessToken())
      return request(path, options, params, false);
    throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  }
  if (response.status === 401 && !session?.accessToken && !isAuthPath(path)) {
    throw new Error("Necesitas iniciar sesión para realizar esta acción.");
  }
  if (!response.ok)
    throw new Error(errorMessage(payload, "No se pudo completar la solicitud"));
  return payload;
}

export const apiClient = {
  get: (path, params) => request(path, { method: "GET" }, params),
  getAllPages: async (path, params = {}) => {
    const first = await request(
      path,
      { method: "GET" },
      { ...params, page: 1, limit: 250 },
    );
    if (Array.isArray(first)) return first;
    const pages = [first];
    const totalPages = Number(first?.totalPages ?? 1);
    if (totalPages > 1)
      pages.push(
        ...(await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            request(
              path,
              { method: "GET" },
              { ...params, page: index + 2, limit: 250 },
            ),
          ),
        )),
      );
    return pages.flatMap((page) => page?.data ?? []);
  },
  post: (path, body) =>
    request(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path, body) =>
    request(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" }),
  upload: (path, formData, method = "PATCH") =>
    request(path, { method, body: formData }),
  login: async (email, password) => {
    const session = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeSession(session);
    return session;
  },
};
