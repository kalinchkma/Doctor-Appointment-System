import type { ChatProvider, EmbedProvider, RagRuntimeSettings } from './settings'

export type EmbedTask = 'document' | 'query'
export type CompletionMode = 'json' | 'text'

function runningInCompose(): boolean {
  const internal = process.env.PAYLOAD_INTERNAL_URL || ''
  return /:\/\/cms(?::|\/|$)/i.test(internal) || process.env.HOSTNAME === '0.0.0.0'
}

const ollamaFallback = () => {
  const fromEnv = process.env.OLLAMA_BASE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  // 127.0.0.1 inside the CMS container is the CMS itself, not the laptop.
  if (runningInCompose()) return 'http://host.docker.internal:11434/v1'
  return 'http://127.0.0.1:11434/v1'
}

const GOOGLE_API = 'https://generativelanguage.googleapis.com/v1beta'
const OPENROUTER_API = 'https://openrouter.ai/api/v1'
const DEEPSEEK_API = 'https://api.deepseek.com'

function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://das.local',
    'X-Title': process.env.OPENROUTER_APP_TITLE || 'DAS Knowledge Assistant',
  }
}

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
    if (
      /googleapis\.com|openai\.com|anthropic\.com|openrouter\.ai|deepseek\.com|generateContent|batchEmbed/i.test(
        value,
      )
    ) {
      return fallback.replace(/\/$/, '')
    }
  }
  if (provider === 'google') {
    // Admins sometimes paste full method URLs; keep only the API root.
    // Correct base: https://generativelanguage.googleapis.com/v1beta
    // Wrong examples: .../interactions, .../models/x:generateContent
    const stripped = value
      .replace(/\/models\/[^/]+:(generateContent|streamGenerateContent|batchEmbedContents|embedContent).*$/i, '')
      .replace(/\/interactions\/?$/i, '')
      .replace(/\/$/, '')
    return stripped || GOOGLE_API
  }
  if (provider === 'openrouter') {
    if (/googleapis\.com|11434|ollama|anthropic\.com|deepseek\.com/i.test(value) && !/openrouter\.ai/i.test(value)) {
      return fallback.replace(/\/$/, '')
    }
  }
  if (provider === 'deepseek') {
    if (
      /googleapis\.com|11434|ollama|anthropic\.com|openrouter\.ai|openai\.com/i.test(value) &&
      !/deepseek\.com/i.test(value)
    ) {
      return fallback.replace(/\/$/, '')
    }
    // Official docs use https://api.deepseek.com/chat/completions (not /v1).
    // Keep an explicit /v1 if the admin pasted the OpenAI-compat root.
    return value.replace(/\/(chat\/)?completions$/i, '')
  }
  if (provider === 'openai' && /googleapis\.com|11434|ollama|openrouter\.ai|deepseek\.com/i.test(value)) {
    return fallback.replace(/\/$/, '')
  }
  return value
}

function ollamaOrigin(configured: string): string {
  return providerBaseUrl('ollama', configured, ollamaFallback()).replace(/\/v1$/i, '')
}

function chatEndpoint(settings: RagRuntimeSettings): { url: string; headers: Record<string, string> } {
  const key = settings.chatApiKey
  switch (settings.chatProvider) {
    case 'openai':
      return {
        url: `${providerBaseUrl('openai', settings.chatBaseUrl, 'https://api.openai.com/v1')}/chat/completions`,
        headers: { Authorization: `Bearer ${key}` },
      }
    case 'openrouter':
      return {
        url: `${providerBaseUrl('openrouter', settings.chatBaseUrl, OPENROUTER_API)}/chat/completions`,
        headers: openRouterHeaders(key),
      }
    case 'deepseek':
      return {
        url: `${providerBaseUrl('deepseek', settings.chatBaseUrl, DEEPSEEK_API)}/chat/completions`,
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
    case 'openrouter':
      return {
        url: `${providerBaseUrl('openrouter', settings.embedBaseUrl, OPENROUTER_API)}/embeddings`,
        headers: openRouterHeaders(key),
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
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    const message = error instanceof Error ? error.message : String(error)
    const detail = cause || message
    const ollamaDown = /ECONNREFUSED|fetch failed/i.test(detail) && /11434|ollama/i.test(url)
    throw new Error(
      ollamaDown
        ? `Ollama is not reachable at ${url}. Local Compose without packed Ollama needs host Ollama (ollama serve) or switch Embed provider in RAG Settings to OpenAI, Google, or OpenRouter. DeepSeek has no embeddings API.`
        : `fetch failed at ${url}: ${detail}`,
    )
  }
  const text = await response.text()
  if (!response.ok) {
    const detail = text.replace(/\s+/g, ' ').slice(0, 240)
    const path = (() => {
      try {
        const parsed = new URL(url)
        return `${parsed.origin}${parsed.pathname}`
      } catch {
        return url.slice(0, 120)
      }
    })()
    throw new Error(
      `provider ${response.status} at ${path}${detail ? `: ${detail}` : ' (empty body — often a bad model id, wrong base URL, or missing/invalid API key)'}`,
    )
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

/**
 * nomic-embed-text is asymmetric: documents and queries must use different prefixes
 * or Atlas cosine scores collapse near 0.5 (orthogonal) even for seeded questions.
 */
function applyEmbedPrefix(model: string, texts: string[], task: EmbedTask): string[] {
  if (!/nomic-embed/i.test(model)) return texts
  const prefix = task === 'query' ? 'search_query: ' : 'search_document: '
  return texts.map((text) => {
    const trimmed = text.trim()
    if (/^search_(query|document):/i.test(trimmed)) return text
    return prefix + text
  })
}

function parseOpenAIEmbeddingData(data: unknown, expected: number): number[][] {
  if (!Array.isArray(data) || data.length !== expected) {
    throw new Error(
      `embeddings: expected ${expected} vectors, got ${Array.isArray(data) ? data.length : 0}`,
    )
  }

  const rows = data as { index?: number; embedding?: number[] }[]
  const sequential = rows.some((item) => typeof item?.index !== 'number')
  const out = new Array<number[]>(expected)

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i]
    const idx = sequential || typeof item?.index !== 'number' ? i : item.index
    if (idx < 0 || idx >= expected) {
      throw new Error(`embeddings: out-of-range index ${idx}`)
    }
    if (!item?.embedding?.length) {
      throw new Error('embeddings: empty vector')
    }
    out[idx] = item.embedding
  }
  if (out.some((vec) => !vec?.length)) {
    throw new Error('embeddings: empty vector')
  }
  return out
}

function nativeOllamaEmbeddings(parsed: Record<string, unknown>): number[][] {
  if (Array.isArray(parsed.embeddings) && parsed.embeddings.length > 0) {
    return parsed.embeddings as number[][]
  }
  if (Array.isArray(parsed.embedding) && typeof parsed.embedding[0] === 'number') {
    return [parsed.embedding as number[]]
  }
  return []
}

async function embedOllama(settings: RagRuntimeSettings, texts: string[]): Promise<number[][]> {
  const origin = ollamaOrigin(settings.embedBaseUrl)
  const headers = { Authorization: `Bearer ${settings.embedApiKey || 'ollama'}` }

  try {
    const parsed = await postJson(`${origin}/api/embed`, headers, { model: settings.embedModel, input: texts }, 180_000)
    const embeddings = nativeOllamaEmbeddings(parsed)
    if (embeddings.length === texts.length && embeddings.every((vec) => vec?.length)) {
      return embeddings.map(l2Normalize)
    }
  } catch {
    // Fall through to the OpenAI-compatible /v1/embeddings path.
  }

  const { url, headers: compatHeaders } = embedEndpoint(settings)
  const parsed = await postJson(url, compatHeaders, { model: settings.embedModel, input: texts }, 180_000)
  return parseOpenAIEmbeddingData(parsed.data, texts.length).map(l2Normalize)
}

export async function proxyEmbeddings(
  settings: RagRuntimeSettings,
  input: string[],
  task: EmbedTask = 'document',
): Promise<number[][]> {
  if (input.length === 0) return []

  const texts = applyEmbedPrefix(settings.embedModel, input, task)

  if (settings.embedProvider === 'google') {
    if (!settings.embedApiKey?.trim()) {
      throw new Error(
        'Google embedding API key is missing in RAG Settings. Add a Gemini API key, or switch Embed provider to Ollama (nomic-embed-text).',
      )
    }
    const model = resolveGoogleEmbedModel(settings.embedModel)
    const dims = settings.embedDimensions || 768
    const { url, headers } = embedEndpoint(settings)
    const parsed = await postJson(
      url,
      headers,
      {
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: task === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          // Keep Atlas index dims stable; gemini-embedding-001 defaults to 3072.
          outputDimensionality: dims,
        })),
      },
      60_000,
    )
    const embeddings = (parsed.embeddings as { values?: number[] }[] | undefined) ?? []
    if (embeddings.length !== texts.length) {
      throw new Error(`embeddings: expected ${texts.length} vectors, got ${embeddings.length}`)
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

  if (settings.embedProvider === 'openrouter' && !settings.embedApiKey?.trim()) {
    throw new Error('OpenRouter embedding API key is missing in RAG Settings')
  }

  if (settings.embedProvider === 'ollama') {
    return embedOllama(settings, texts)
  }

  const { url, headers } = embedEndpoint(settings)
  const parsed = await postJson(
    url,
    headers,
    {
      model: settings.embedModel,
      input: texts,
      encoding_format: 'float',
    },
    60_000,
  )
  return parseOpenAIEmbeddingData(parsed.data, texts.length).map(l2Normalize)
}

export async function proxyCompletion(
  settings: RagRuntimeSettings,
  system: string,
  user: string,
  mode: CompletionMode = 'json',
): Promise<string> {
  const { url, headers } = chatEndpoint(settings)
  const provider: ChatProvider = settings.chatProvider
  const temperature = mode === 'json' ? 0 : 0.4
  const wantJson = mode === 'json'

  if (provider === 'anthropic') {
    if (!settings.chatApiKey?.trim()) throw new Error('Anthropic API key is missing in RAG Settings')
    const parsed = await postJson(
      url,
      headers,
      {
        model: settings.chatModel,
        max_tokens: mode === 'json' ? 400 : 512,
        temperature,
        system,
        messages: [{ role: 'user', content: user }],
      },
      120_000,
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
          temperature,
          maxOutputTokens: mode === 'json' ? 400 : 512,
          ...(wantJson ? { responseMimeType: 'application/json' } : {}),
        },
      },
      120_000,
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

  if (provider === 'openrouter' && !settings.chatApiKey?.trim()) {
    throw new Error('OpenRouter API key is missing in RAG Settings')
  }

  if (provider === 'deepseek' && !settings.chatApiKey?.trim()) {
    throw new Error('DeepSeek API key is missing in RAG Settings')
  }

  const isDeepSeekReasoner = isReasoningChatModel(settings)

  // Short answers: cap tokens so local models finish quickly instead of rambling.
  const maxTokens = isDeepSeekReasoner ? 500 : mode === 'json' ? 350 : 400

  const parsed = await postJson(
    url,
    headers,
    {
      model: settings.chatModel,
      temperature,
      max_tokens: maxTokens,
      ...(wantJson && supportsJsonObjectMode(settings) ? { response_format: { type: 'json_object' } } : {}),
      ...(settings.chatProvider === 'ollama' && isDeepSeekReasoner ? { think: false } : {}),
      // Flash/Pro default to thinking=enabled; that plus json_object is slow and can look blank.
      ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
    isDeepSeekReasoner ? 150_000 : 120_000,
  )
  const choices = parsed.choices as { message?: { content?: string } }[] | undefined
  let text = choices?.[0]?.message?.content
  if (!text) {
    const message = choices?.[0]?.message as
      | { reasoning?: string; reasoning_content?: string; content?: string }
      | undefined
    text = message?.content || message?.reasoning_content || message?.reasoning || ''
  }
  if (!text) throw new Error('completion: empty')
  return stripReasoningWrappers(text)
}

function isReasoningChatModel(settings: RagRuntimeSettings): boolean {
  const model = settings.chatModel.toLowerCase()
  if (settings.chatProvider === 'deepseek') {
    return model.includes('reasoner') || model.includes('r1')
  }
  return (
    settings.chatProvider === 'ollama' &&
    (model.includes('deepseek-r1') || model.includes('deepseek-reasoner'))
  )
}

function supportsJsonObjectMode(settings: RagRuntimeSettings): boolean {
  if (isReasoningChatModel(settings)) return false
  if (settings.chatProvider === 'ollama') return true
  // OpenAI, OpenRouter, DeepSeek-chat, and other OpenAI-compatible endpoints support json_object.
  return true
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
  applyEmbedPrefix,
  parseOpenAIEmbeddingData,
  ollamaOrigin,
}
