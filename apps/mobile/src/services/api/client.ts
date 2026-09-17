import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { clearToken, readToken } from '../storage'

export const baseURL = (import.meta.env.VITE_PAYLOAD_URL as string) || 'http://localhost:3000'

/** Mirrors the server's error taxonomy so screens can branch on `code`. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type ErrorBody = {
  code?: string
  message?: string
  errors?: { message?: string }[]
}

/** Called when a request comes back 401, so the app can return to the login screen. */
let onUnauthenticated: (() => void) | null = null

export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler
}

function mergeHeaders(
  token: string | null,
  initHeaders: HeadersInit | undefined,
  hasJsonBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    // Only set JSON content-type when we actually send a body. Empty POSTs with this
    // header confuse some native HTTP stacks into sending `{}` / dropping the payload.
    ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
    // Payload also accepts a cookie, but the Android WebView origin differs from the
    // API origin, which makes that cookie cross-site. The header works everywhere.
    ...(token ? { Authorization: `JWT ${token}` } : {}),
  }

  if (!initHeaders) return headers

  const extra =
    initHeaders instanceof Headers
      ? Object.fromEntries(initHeaders.entries())
      : Array.isArray(initHeaders)
        ? Object.fromEntries(initHeaders)
        : initHeaders

  for (const [key, value] of Object.entries(extra)) {
    if (value != null) headers[key] = String(value)
  }
  return headers
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined
  if (typeof body === 'string') {
    if (!body) return undefined
    try {
      return JSON.parse(body) as unknown
    } catch {
      return body
    }
  }
  return undefined
}

async function throwIfFailed(status: number, body: ErrorBody): Promise<void> {
  if (status >= 200 && status < 300) return
  if (status === 401) {
    await clearToken()
    onUnauthenticated?.()
  }
  throw new ApiError(
    body.code ?? 'REQUEST_FAILED',
    status,
    body.message ?? body.errors?.[0]?.message ?? 'Something went wrong. Please try again.',
  )
}

/**
 * Native CapacitorHttp path. Prefer this over patched `fetch` for JSON APIs:
 * AbortSignal / Request cloning has dropped POST bodies on Android (empty `{}` → Zod
 * "expected string, received undefined" on /api/chat).
 */
async function requestNative<T>(
  path: string,
  init: RequestInit,
  options: { timeoutMs?: number },
  token: string | null,
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const data = parseJsonBody(init.body)
  const hasJsonBody = data !== undefined
  const timeoutMs = options.timeoutMs

  const response = await CapacitorHttp.request({
    url: `${baseURL}${path}`,
    method,
    headers: mergeHeaders(token, init.headers, hasJsonBody),
    data,
    ...(typeof timeoutMs === 'number' && timeoutMs > 0
      ? { connectTimeout: timeoutMs, readTimeout: timeoutMs }
      : {}),
  })

  if (response.status === 204) {
    return undefined as T
  }

  const raw = response.data
  const body = (
    typeof raw === 'string'
      ? (JSON.parse(raw || '{}') as ErrorBody & T)
      : ((raw ?? {}) as ErrorBody & T)
  ) as ErrorBody & T

  await throwIfFailed(response.status, body)
  return body
}

async function requestWeb<T>(
  path: string,
  init: RequestInit,
  options: { timeoutMs?: number },
  token: string | null,
): Promise<T> {
  const data = parseJsonBody(init.body)
  const hasJsonBody = data !== undefined
  const timeoutMs = options.timeoutMs
  const signal =
    init.signal ??
    (typeof timeoutMs === 'number' && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined)

  const response = await fetch(`${baseURL}${path}`, {
    ...init,
    signal,
    headers: mergeHeaders(token, init.headers, hasJsonBody),
  })

  if (response.status === 204) {
    return undefined as T
  }

  const body = (await response.json().catch(() => ({}))) as ErrorBody & T
  await throwIfFailed(response.status, body)
  return body
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const token = await readToken()

  try {
    if (Capacitor.isNativePlatform()) {
      return await requestNative<T>(path, init, options, token)
    }
    return await requestWeb<T>(path, init, options, token)
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new ApiError(
        'ASSISTANT_UNAVAILABLE',
        504,
        'The assistant took too long to respond. Try again, or switch to a faster model in Admin → RAG Settings (for example llama3.2 or gemini-2.0-flash).',
      )
    }
    throw new ApiError(
      'NETWORK_ERROR',
      0,
      `We could not reach the server at ${baseURL}. Check that your phone is on the same Wi‑Fi, the CMS is running, and HTTP cleartext is allowed.`,
    )
  }
}

export const get = <T>(path: string, options?: { timeoutMs?: number }) =>
  request<T>(path, {}, options)

export const post = <T>(path: string, payload?: unknown, options?: { timeoutMs?: number }) =>
  request<T>(
    path,
    {
      method: 'POST',
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    },
    options,
  )

/** Resolves the display URL for a Payload upload, preferring the generated thumbnail. */
export function mediaURL(media: unknown): string | undefined {
  if (!media || typeof media !== 'object') {
    return undefined
  }
  const upload = media as { url?: string; sizes?: { thumbnail?: { url?: string } } }
  const path = upload.sizes?.thumbnail?.url ?? upload.url
  if (!path) return undefined

  // Payload stamps absolute URLs with PAYLOAD_PUBLIC_URL (often http://localhost:3000).
  // Re-host those onto VITE_PAYLOAD_URL so a phone can load them. CDN/S3 URLs are left alone.
  if (/^https?:\/\//i.test(path)) {
    try {
      const absolute = new URL(path)
      const base = new URL(baseURL)
      const loopback = ['localhost', '127.0.0.1', '0.0.0.0'].includes(absolute.hostname)
      if (loopback) {
        return `${base.origin}${absolute.pathname}${absolute.search}`
      }
      return path
    } catch {
      return path
    }
  }

  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${baseURL.replace(/\/$/, '')}${normalized}`
}

/**
 * Load a remote image through `fetch` (patched by CapacitorHttp on native) and return a
 * blob: URL. Needed because `<img src="http://…">` from the https Capacitor WebView is
 * mixed content / blocked even when API JSON calls already work.
 */
export async function fetchMediaObjectUrl(media: unknown): Promise<string | undefined> {
  const remote = mediaURL(media)
  if (!remote) return undefined

  const response = await fetch(remote)
  if (!response.ok) {
    throw new ApiError('REQUEST_FAILED', response.status, 'The image could not be loaded.')
  }
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}
