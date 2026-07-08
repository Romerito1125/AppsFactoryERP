import { getStoredSession } from '@/auth/auth-context'

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

function getBaseUrl() {
  return new URL(API_BASE_URL, window.location.origin)
}

function isFormDataBody(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData
}

function buildUrl(path, params) {
  const baseUrl = getBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${baseUrl.pathname.replace(/\/$/, '')}${normalizedPath}`, baseUrl.origin)

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    url.searchParams.set(key, String(value))
  })

  return baseUrl.origin === window.location.origin ? `${url.pathname}${url.search}` : url.toString()
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

function parseResponsePayload(text) {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path, options = {}, params) {
  const isFormData = isFormDataBody(options.body)
  const accessToken = getStoredSession()?.accessToken

  let response

  try {
    response = await fetch(buildUrl(path, params), {
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers ?? {}),
      },
      ...options,
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica que el API local este iniciado.')
  }

  const text = await response.text()
  const payload = parseResponsePayload(text)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'No se pudo completar la solicitud'))
  }

  return payload
}

function withBody(body) {
  if (body === undefined) {
    return undefined
  }

  return isFormDataBody(body) ? body : JSON.stringify(body)
}

export const apiClient = {
  get: (path, params) => request(path, { method: 'GET' }, params),
  getAllPages: async (path, params = {}, options = {}) => {
    const pageSize = options.limit ?? 200
    const firstPage = await request(path, { method: 'GET' }, { ...params, page: 1, limit: pageSize })

    if (Array.isArray(firstPage)) {
      return firstPage
    }

    const totalPages = Number(firstPage?.totalPages ?? 1)
    const pages = [firstPage]

    if (totalPages > 1) {
      const remainingPages = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          request(path, { method: 'GET' }, { ...params, page: index + 2, limit: pageSize }),
        ),
      )

      pages.push(...remainingPages)
    }

    return pages.flatMap((payload) => payload?.data ?? [])
  },
  post: (path, body) =>
    request(path, {
      method: 'POST',
      body: withBody(body),
    }),
  patch: (path, body) =>
    request(path, {
      method: 'PATCH',
      body: withBody(body),
    }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
