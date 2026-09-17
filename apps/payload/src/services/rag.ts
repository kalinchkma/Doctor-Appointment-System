const ragURL = () => (process.env.RAG_SERVICE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')
const secret = () => process.env.RAG_INTERNAL_SECRET || ''

export type RagChatResult = {
  sufficient: boolean
  answer: string
  sources: { title: string; page?: number; score?: number }[]
  reason?: string
  topScore?: number
  confidence?: number
}

async function ragFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(`${ragURL()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-RAG-Internal-Secret': secret(),
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
}

export async function syncDocument(input: {
  documentId: string
  version: number
  title: string
  fileUrl: string
}): Promise<void> {
  const response = await ragFetch(
    '/internal/v1/documents/sync',
    { method: 'POST', body: JSON.stringify(input) },
    8_000,
  )
  if (!response.ok) {
    throw new Error(`RAG sync returned ${response.status}`)
  }
}

export async function deleteDocument(documentId: string): Promise<void> {
  const response = await ragFetch(`/internal/v1/documents/${documentId}`, { method: 'DELETE' }, 8_000)
  if (!response.ok) {
    throw new Error(`RAG delete returned ${response.status}`)
  }
}

export async function askRag(
  question: string,
  requestId?: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<RagChatResult> {
  // Must stay above the Go RAG chat budget (RAG_CHAT_TIMEOUT_SEC, default 180s).
  // Aborting earlier cancels the Go request mid-generate ("context canceled").
  const response = await ragFetch(
    '/internal/v1/chat',
    {
      method: 'POST',
      body: JSON.stringify({
        question,
        ...(history.length > 0 ? { history } : {}),
      }),
      headers: requestId ? { 'X-Request-Id': requestId } : {},
    },
    200_000,
  )

  if (response.status === 502 || response.status === 504) {
    const error = new Error('RAG_PROVIDER')
    error.name = 'RagProviderError'
    throw error
  }
  if (!response.ok) {
    const error = new Error(`RAG chat returned ${response.status}`)
    error.name = 'RagUnavailableError'
    throw error
  }

  return (await response.json()) as RagChatResult
}

export function isRagUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'RagUnavailableError' ||
    error.name === 'TimeoutError' ||
    error.name === 'AbortError'
  )
}

export function isRagProviderError(error: unknown): boolean {
  return error instanceof Error && error.name === 'RagProviderError'
}
