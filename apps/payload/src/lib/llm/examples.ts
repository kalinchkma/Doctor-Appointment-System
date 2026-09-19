import type { ChatProvider, EmbedProvider } from './settings'

export type ChatExample = {
  model: string
  note: string
}

export type EmbedExample = {
  model: string
  dims: number
  note: string
}

/** One working chat model per provider — used as the admin default when the provider changes. */
export const CHAT_EXAMPLES: Record<ChatProvider, ChatExample> = {
  ollama: { model: 'llama3.2', note: 'Local. Pull with `ollama pull llama3.2`.' },
  openai: { model: 'gpt-4o-mini', note: 'Cloud. Requires an OpenAI API key.' },
  anthropic: { model: 'claude-sonnet-4-5', note: 'Cloud. Anthropic has no embeddings API.' },
  google: { model: 'gemini-2.0-flash', note: 'Cloud. Requires a Gemini API key.' },
  openrouter: {
    model: 'openai/gpt-4o-mini',
    note: 'Cloud via OpenRouter. Use provider/model ids from openrouter.ai/models. Requires an OpenRouter API key.',
  },
  deepseek: {
    model: 'deepseek-chat',
    note: 'Cloud. Default is deepseek-chat (V3). Use deepseek-reasoner for R1-style reasoning. Requires a DeepSeek API key. No embeddings API — keep Ollama/OpenAI/Google for vectors.',
  },
}

/** One working embedding model per provider that actually produces vectors. */
export const EMBED_EXAMPLES: Record<EmbedProvider, EmbedExample> = {
  ollama: {
    model: 'nomic-embed-text',
    dims: 768,
    note: 'Local. Pull with `ollama pull nomic-embed-text`. Uses search_query / search_document prefixes.',
  },
  openai: {
    model: 'text-embedding-3-small',
    dims: 1536,
    note: 'Cloud. Changing dimensions requires dropping the Atlas index and re-ingesting.',
  },
  google: {
    model: 'gemini-embedding-001',
    dims: 768,
    note: 'Cloud. outputDimensionality is pinned to 768 so the Atlas index stays stable.',
  },
  openrouter: {
    model: 'openai/text-embedding-3-small',
    dims: 1536,
    note: 'Cloud via OpenRouter. Use an embedding model id from openrouter.ai/models. Re-ingest after changing dims.',
  },
}

export const CHAT_MODEL_HELP =
  'One example per provider — Ollama: llama3.2 · OpenAI: gpt-4o-mini · Anthropic: claude-sonnet-4-5 · Google: gemini-2.0-flash · OpenRouter: openai/gpt-4o-mini · DeepSeek: deepseek-chat. Switching provider fills the example; you can still type any model id (deepseek-reasoner for R1).'

export const EMBED_MODEL_HELP =
  'One example per provider — Ollama: nomic-embed-text (768) · OpenAI: text-embedding-3-small (1536) · Google: gemini-embedding-001 (768) · OpenRouter: openai/text-embedding-3-small (1536). Anthropic and DeepSeek have no embeddings API. Switching provider fills the example. Re-ingest after changing model or dimensions.'

/**
 * When the admin switches provider, fill that provider's example chat/embed model
 * (and matching dimensions). Custom ids are left alone unless the provider changed.
 */
export function applyProviderExamples(
  data: Record<string, unknown>,
  original?: Record<string, unknown> | null,
): Record<string, unknown> {
  const chatProvider = String(data.chatProvider ?? original?.chatProvider ?? 'ollama') as ChatProvider
  const embedProvider = String(data.embedProvider ?? original?.embedProvider ?? 'ollama') as EmbedProvider

  const chatChanged =
    typeof data.chatProvider === 'string' && data.chatProvider !== original?.chatProvider
  const embedChanged =
    typeof data.embedProvider === 'string' && data.embedProvider !== original?.embedProvider

  const chatEx = CHAT_EXAMPLES[chatProvider] ?? CHAT_EXAMPLES.ollama
  const embedEx = EMBED_EXAMPLES[embedProvider] ?? EMBED_EXAMPLES.ollama

  const currentChat = String(data.chatModel ?? original?.chatModel ?? '').trim()
  if (chatChanged || !currentChat) {
    data.chatModel = chatEx.model
  }

  const currentEmbed = String(data.embedModel ?? original?.embedModel ?? '').trim()
  if (embedChanged || !currentEmbed) {
    data.embedModel = embedEx.model
    data.embedDimensions = embedEx.dims
  }

  return data
}
