import type { Payload } from 'payload'

export type ChatProvider = 'ollama' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'deepseek'
export type EmbedProvider = 'ollama' | 'openai' | 'google' | 'openrouter'

export type RagRuntimeSettings = {
  chatProvider: ChatProvider
  chatModel: string
  chatBaseUrl: string
  chatApiKey: string
  embedProvider: EmbedProvider
  embedModel: string
  embedBaseUrl: string
  embedApiKey: string
  embedDimensions: number
  minScore: number
  strongScore: number
  minChunks: number
  minCoverage: number
  maxConcurrency: number
}

const defaults: RagRuntimeSettings = {
  chatProvider: 'ollama',
  chatModel: 'llama3.2',
  chatBaseUrl: '',
  chatApiKey: '',
  embedProvider: 'ollama',
  embedModel: 'nomic-embed-text',
  embedBaseUrl: '',
  embedApiKey: '',
  embedDimensions: 768,
  minScore: 0.5,
  strongScore: 0.58,
  minChunks: 1,
  minCoverage: 0.25,
  maxConcurrency: 4,
}

export function publicRagSettings(settings: RagRuntimeSettings) {
  return {
    chatProvider: settings.chatProvider,
    chatModel: settings.chatModel,
    embedProvider: settings.embedProvider,
    embedModel: settings.embedModel,
    embedDimensions: settings.embedDimensions,
    minScore: settings.minScore,
    strongScore: settings.strongScore,
    minChunks: settings.minChunks,
    minCoverage: settings.minCoverage,
    maxConcurrency: settings.maxConcurrency,
  }
}

export async function loadRagSettings(payload: Payload): Promise<RagRuntimeSettings> {
  const doc = await payload
    .findGlobal({ slug: 'rag-settings', overrideAccess: true })
    .catch(() => null)

  if (!doc) return defaults

  const settings: RagRuntimeSettings = {
    chatProvider: (doc.chatProvider as ChatProvider) || defaults.chatProvider,
    chatModel: String(doc.chatModel || defaults.chatModel),
    chatBaseUrl: String(doc.chatBaseUrl || ''),
    chatApiKey: String(doc.chatApiKey || ''),
    embedProvider: (doc.embedProvider as EmbedProvider) || defaults.embedProvider,
    embedModel: String(doc.embedModel || defaults.embedModel),
    embedBaseUrl: String(doc.embedBaseUrl || ''),
    embedApiKey: String(doc.embedApiKey || ''),
    embedDimensions: Number(doc.embedDimensions) || defaults.embedDimensions,
    minScore: Number(doc.minScore) || defaults.minScore,
    strongScore: Number(doc.strongScore) || defaults.strongScore,
    minChunks: Number(doc.minChunks) || defaults.minChunks,
    minCoverage: Number(doc.minCoverage) || defaults.minCoverage,
    maxConcurrency: Number(doc.maxConcurrency) || defaults.maxConcurrency,
  }

  // Previous factory gates (0.62 / 0.74 / 2) rejected almost all local nomic hits.
  if (settings.minScore === 0.62 && settings.strongScore === 0.74 && settings.minChunks === 2) {
    settings.minScore = defaults.minScore
    settings.strongScore = defaults.strongScore
    settings.minChunks = defaults.minChunks
  }

  return settings
}
