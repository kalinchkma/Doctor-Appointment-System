import type { Payload } from 'payload'

/** Ensure Admin → RAG Settings uses the project defaults (Ollama DeepSeek + nomic embeddings). */
export async function seedRagSettings(payload: Payload) {
  await payload.updateGlobal({
    slug: 'rag-settings',
    overrideAccess: true,
    data: {
      chatProvider: 'ollama',
      chatModel: 'llama3.2',
      embedProvider: 'ollama',
      embedModel: 'nomic-embed-text',
      embedDimensions: 768,
    },
  })
  payload.logger.info('RAG settings defaulted to llama3.2 + nomic-embed-text')
}
