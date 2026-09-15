import type { ChatProvider, EmbedProvider, RagRuntimeSettings } from './settings'

const ollamaFallback = () =>
  (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/$/, '')

const GOOGLE_API = 'https://generativelanguage.googleapis.com/v1beta'

/** Strip optional `models/` prefix used in Gemini resource names. */
function googleModelId(model: string): string {
  return model.trim().replace(/^models\//, '')
}

/**
 * Map retired / mistaken Gemini embedding ids to the current GA model.
 * text-embedding-004 was shut down; chat model names are not valid embed models (404).
 */
function resolveGoogleEmbedModel(model: string): string {
  const id = googleModelId(model).toLowerCase()
  if (
    !id ||
    id.includes('text-embedding-004') ||
    id.includes('embedding-001') ||
    id.startsWith('gemini-2') ||
    id.startsWith('gemini-1.5') ||
    id.startsWith('gemini-pro') ||
    id === 'gemini' ||
    id === 'google'
  ) {
    return 'gemini-embedding-001'
  }
  return googleModelId(model)
}

function resolveGoogleChatModel(model: string): string {
  const id = googleModelId(model)
  if (!id || id.toLowerCase().includes('embedding')) {
    return 'gemini-2.0-flash'
  }
  return id
}

function providerBaseUrl(
  provider: ChatProvider | EmbedProvider,
  configured: string,
  fallback: string,
): string {
  const value = configured.trim().replace(/\/$/, '')
  if (!value) return fallback.replace(/\/$/, '')

  // Ignore leftover URLs from a previous provider (common after switching Gemini ↔ Ollama).
  if (provider === 'ollama') {
    if (/googleapis\.com|openai\.com|anthropic\.com|generateContent|batchEmbed/i.test(value)) {
      return fallback.replace(/\/$/, '')
    }
  }
  if (provider === 'google') {
    // Admins sometimes paste the full generateContent URL; keep only the API root.
    const stripped = value
      .replace(/\/models\/[^/]+:(generateContent|batchEmbedContents|embedContent).*$/i, '')
      .replace(/\/$/, '')
    return stripped || GOOGLE_API
  }
  if (provider === 'openai' && /googleapis\.com|11434|ollama/i.test(value)) {
    return fallback.replace(/\/$/, '')
  }
  return value
}

function chatEndpoint(settings: RagRuntimeSettings): { url: string; headers: Record<string, string> } {
  const key = settings.chatApiKey
  switch (settings.chatProvider) {
    case 'openai':
      return {
        url: `${providerBaseUrl('openai', settings.chatBaseUrl, 'https://api.openai.com/v1')}/chat/completions`,
        headers: { Authorization: `Bearer ${key}` },
      }
    case 'anthropic':
      return {
        url: `${providerBaseUrl('anthropic', settings.chatBaseUrl, 'https://api.anthropic.com')}/v1/messages`,
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      }
    case 'google': {
      const model = resolveGoogleChatModel(settings.chatModel)
      const base = providerBaseUrl('google', settings.chatBaseUrl, GOOGLE_API)
      return {
        url: `${base}/models/${model}:generateContent`,
        headers: { 'x-goog-api-key': key },
      }
    }
    default:
      return {
        url: `${providerBaseUrl('ollama', settings.chatBaseUrl, ollamaFallback())}/chat/completions`,
        headers: { Authorization: `Bearer ${key || 'ollama'}` },
      }
  }
}

function embedEndpoint(settings: RagRuntimeSettings): { url: string; headers: Record<string, string> } {
  const key = settings.embedApiKey
  switch (settings.embedProvider) {
    case 'openai':
      return {
        url: `${providerBaseUrl('openai', settings.embedBaseUrl, 'https://api.openai.com/v1')}/embeddings`,
        headers: { Authorization: `Bearer ${key}` },
      }
    case 'google': {
      const model = resolveGoogleEmbedModel(settings.embedModel)
      const base = providerBaseUrl('google', settings.embedBaseUrl, GOOGLE_API)
      return {
        url: `${base}/models/${model}:batchEmbedContents`,
        headers: { 'x-goog-api-key': key },
      }
    }
    default:
      return {
        url: `${providerBaseUrl('ollama', settings.embedBaseUrl, ollamaFallback())}/embeddings`,
        headers: { Authorization: `Bearer ${key || 'ollama'}` },
      }
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  if (!response.ok) {
    const detail = text.replace(/\s+/g, ' ').slice(0, 240)
    throw new Error(`provider ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

function l2Normalize(values: number[]): number[] {
  let sum = 0
  for (const v of values) sum += v * v
  const norm = Math.sqrt(sum)
  if (!norm || !Number.isFinite(norm)) return values
  return values.map((v) => v / norm)
}

export async function proxyEmbeddings(
  settings: RagRuntimeSettings,
  input: string[],
): Promise<number[][]> {
  if (input.length === 0) return []

  const { url, headers } = embedEndpoint(settings)

  if (settings.embedProvider === 'google') {
    if (!settings.embedApiKey?.trim()) {
      throw new Error('Google embedding API key is missing in RAG Settings')
    }
    const model = resolveGoogleEmbedModel(settings.embedModel)
    const dims = settings.embedDimensions || 768
    const parsed = await postJson(
      url,
      headers,
      {
        requests: input.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          // Keep Atlas index dims stable; gemini-embedding-001 defaults to 3072.
          outputDimensionality: dims,
        })),
      },
      60_000,
    )
    const embeddings = (parsed.embeddings as { values?: number[] }[] | undefined) ?? []
    if (embeddings.length !== input.length) {
      throw new Error(`embeddings: expected ${input.length} vectors, got ${embeddings.length}`)
    }
    return embeddings.map((item) => {
      const values = item.values ?? []
      if (values.length === 0) throw new Error('embeddings: empty vector')
      // Google recommends normalizing when truncating Matryoshka embeddings.
      return l2Normalize(values)
    })
  }

  if (settings.embedProvider === 'openai' && !settings.embedApiKey?.trim()) {
    throw new Error('OpenAI embedding API key is missing in RAG Settings')
  }

  const parsed = await postJson(
    url,
    headers,
    { model: settings.embedModel, input, ...(settings.embedProvider === 'openai' ? { encoding_format: 'float' } : {}) },
    60_000,
  )
  const data = (parsed.data as { index: number; embedding: number[] }[] | undefined) ?? []
  const vectors = new Array<number[]>(input.length)
  for (const item of data) {
    vectors[item.index] = item.embedding
  }
  if (vectors.some((item) => !item?.length)) {
    throw new Error('embeddings: empty vector')
  }
  return vectors
}

export async function proxyCompletion(
  settings: RagRuntimeSettings,
  system: string,
  user: string,
): Promise<string> {
  const { url, headers } = chatEndpoint(settings)
  const provider: ChatProvider = settings.chatProvider

  if (provider === 'anthropic') {
    if (!settings.chatApiKey?.trim()) throw new Error('Anthropic API key is missing in RAG Settings')
    const parsed = await postJson(
      url,
      headers,
      {
        model: settings.chatModel,
        max_tokens: 1024,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      },
      90_000,
    )
    const content = parsed.content as { text?: string }[] | undefined
    const text = content?.find((part) => part.text)?.text
    if (!text) throw new Error('completion: empty')
    return text
  }

  if (provider === 'google') {
    if (!settings.chatApiKey?.trim()) throw new Error('Google API key is missing in RAG Settings')
    const parsed = await postJson(
      url,
      headers,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens: 1024,
        },
      },
      90_000,
    )
    const candidates = parsed.candidates as
      | { content?: { parts?: { text?: string }[] } }[]
      | undefined
    const text = candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
    if (!text) throw new Error('completion: empty')
    return text
  }

  if (provider === 'openai' && !settings.chatApiKey?.trim()) {
    throw new Error('OpenAI API key is missing in RAG Settings')
  }

  const isDeepSeekReasoner =
    settings.chatProvider === 'ollama' &&
    /deepseek-r1|deepseek-reasoner/i.test(settings.chatModel)

  const parsed = await postJson(
    url,
    headers,
    {
      model: settings.chatModel,
      temperature: 0,
      max_tokens: isDeepSeekReasoner ? 700 : 1024,
      ...(supportsJsonObjectMode(settings) ? { response_format: { type: 'json_object' } } : {}),
      ...(isDeepSeekReasoner ? { think: false } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
    isDeepSeekReasoner ? 120_000 : 90_000,
  )
  const choices = parsed.choices as { message?: { content?: string } }[] | undefined
  let text = choices?.[0]?.message?.content
  if (!text) {
    const message = choices?.[0]?.message as { reasoning?: string; content?: string } | undefined
    text = message?.content || message?.reasoning || ''
  }
  if (!text) throw new Error('completion: empty')
  return stripReasoningWrappers(text)
}

function supportsJsonObjectMode(settings: RagRuntimeSettings): boolean {
  if (settings.chatProvider !== 'ollama') return true
  const model = settings.chatModel.toLowerCase()
  return !(model.includes('deepseek-r1') || model.includes('deepseek-reasoner'))
}

function stripReasoningWrappers(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

export type { EmbedProvider }

/** Exported for unit tests. */
export const __test = {
  googleModelId,
  resolveGoogleEmbedModel,
  resolveGoogleChatModel,
  l2Normalize,
}
