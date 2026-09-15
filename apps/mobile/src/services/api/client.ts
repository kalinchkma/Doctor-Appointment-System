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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await readToken()

  let response: Response
  try {
    response = await fetch(`${baseURL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        // Payload also accepts a cookie, but the Android WebView origin differs from the
        // API origin, which makes that cookie cross-site. The header works everywhere.
        ...(token ? { Authorization: `JWT ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      0,
      'We could not reach the server. Check your connection and try again.',
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = (await response.json().catch(() => ({}))) as ErrorBody & T

  if (!response.ok) {
    if (response.status === 401) {
      await clearToken()
      onUnauthenticated?.()
    }
    throw new ApiError(
      body.code ?? 'REQUEST_FAILED',
      response.status,
      body.message ?? body.errors?.[0]?.message ?? 'Something went wrong. Please try again.',
    )
  }

  return body
}

export const get = <T>(path: string) => request<T>(path)

export const post = <T>(path: string, payload?: unknown) =>
  request<T>(path, {
    method: 'POST',
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })

/** Resolves the display URL for a Payload upload, preferring the generated thumbnail. */
export function mediaURL(media: unknown): string | undefined {
  if (!media || typeof media !== 'object') {
    return undefined
  }
  const upload = media as { url?: string; sizes?: { thumbnail?: { url?: string } } }
  const path = upload.sizes?.thumbnail?.url ?? upload.url

  return path ? `${baseURL}${path}` : undefined
}
