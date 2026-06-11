const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

function buildUrl(path, params) {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin)

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    url.searchParams.set(key, String(value))
  })

  return `${url.pathname}${url.search}`
}

function getErrorMessage(payload, fallback) {
  if (!payload) {
    return fallback
  }

  if (typeof payload === 'string') {
    return payload
  }

  if (Array.isArray(payload.message)) {
    return payload.message.join(', ')
  }

  if (payload.message) {
    return payload.message
  }

  return fallback
}

async function request(path, options = {}, params) {
  const response = await fetch(buildUrl(path, params), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'No se pudo completar la solicitud'))
  }

  return payload
}

export const apiClient = {
  get: (path, params) => request(path, { method: 'GET' }, params),
  post: (path, body) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patch: (path, body) =>
    request(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
