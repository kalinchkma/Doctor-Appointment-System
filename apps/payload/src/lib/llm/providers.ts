import type { ChatProvider, EmbedProvider, RagRuntimeSettings } from './settings'

const ollamaFallback = () =>
  (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/$/, '')

function chatEndpoint(settings: RagRuntimeSettings): { url: string; headers: Record<string, string> } {
  const key = settings.chatApiKey
  switch (settings.chatProvider) {
    case 'openai':
      return {
        url: `${(settings.chatBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
        headers: { Authorization: `Bearer ${key}` },
      }
    case 'anthropic':
      return {
        url: `${(settings.chatBaseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`,
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      }
    case 'google':
      return {
        url: `${(settings.chatBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${settings.chatModel}:generateContent?key=${encodeURIComponent(key)}`,
        headers: {},
      }
    default:
      return {
        url: `${(settings.chatBaseUrl || ollamaFallback()).replace(/\/$/, '')}/chat/completions`,
        headers: { Authorization: `Bearer ${key || 'ollama'}` },
      }
  }
}

function embedEndpoint(settings: RagRuntimeSettings): { url: string; headers: Record<string, string> } {
  const key = settings.embedApiKey
  switch (settings.embedProvider) {
    case 'openai':
      return {
        url: `${(settings.embedBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/embeddings`,
        headers: { Authorization: `Bearer ${key}` },
      }
    case 'google':
      return {
        url: `${(settings.embedBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${settings.embedModel}:batchEmbedContents?key=${encodeURIComponent(key)}`,
        headers: {},
      }
    default:
      return {
        url: `${(settings.embedBaseUrl || ollamaFallback()).replace(/\/$/, '')}/embeddings`,
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
    throw new Error(`provider ${response.status}`)
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

export async function proxyEmbeddings(
  settings: RagRuntimeSettings,
  input: string[],
): Promise<number[][]> {
  if (input.length === 0) return []

  const { url, headers } = embedEndpoint(settings)

  if (settings.embedProvider === 'google') {
    const parsed = await postJson(
      url,
      headers,
      {
        requests: input.map((text) => ({
          model: `models/${settings.embedModel}`,
          content: { parts: [{ text }] },
        })),
      },
      45_000,
    )
    const embeddings = (parsed.embeddings as { values?: number[] }[] | undefined) ?? []
    if (embeddings.length !== input.length) {
      throw new Error('embeddings: unexpected batch size')
    }
    return embeddings.map((item) => item.values ?? [])
  }

  const parsed = await postJson(url, headers, { model: settings.embedModel, input }, 45_000)
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
      45_000,
    )
    const content = parsed.content as { text?: string }[] | undefined
    const text = content?.find((part) => part.text)?.text
    if (!text) throw new Error('completion: empty')
    return text
  }

  if (provider === 'google') {
    const parsed = await postJson(
      url,
      headers,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      },
      45_000,
    )
    const candidates = parsed.candidates as
      | { content?: { parts?: { text?: string }[] } }[]
      | undefined
    const text = candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
    if (!text) throw new Error('completion: empty')
    return text
  }

  const parsed = await postJson(
    url,
    headers,
    {
      model: settings.chatModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
    45_000,
  )
  const choices = parsed.choices as { message?: { content?: string } }[] | undefined
  const text = choices?.[0]?.message?.content
  if (!text) throw new Error('completion: empty')
  return text
}

export type { EmbedProvider }
