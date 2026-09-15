import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Endpoint } from 'payload'
import { json } from '../lib/errors'
import { proxyCompletion, proxyEmbeddings } from '../lib/llm/providers'
import { loadRagSettings, publicRagSettings } from '../lib/llm/settings'
import { knowledgeFilesDir } from '../lib/paths'

function requireInternalSecret(req: { headers: Headers }): boolean {
  return req.headers.get('X-RAG-Internal-Secret') === (process.env.RAG_INTERNAL_SECRET || '')
}

function publicBase(): string {
  return (
    process.env.PAYLOAD_PUBLIC_URL ||
    process.env.PAYLOAD_INTERNAL_URL ||
    'http://127.0.0.1:3000'
  ).replace(/\/$/, '')
}

/**
 * Loads a knowledge PDF whether it lives on the local volume or an object store.
 * Cloud adapters expose an absolute `url`; local uploads expose a relative /api/... path
 * or a filename we read from KNOWLEDGE_FILES_DIR.
 */
async function loadKnowledgePdf(file: {
  filename?: string | null
  url?: string | null
}): Promise<Buffer | null> {
  const url = file.url?.trim()
  if (url?.startsWith('http://') || url?.startsWith('https://')) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
    if (!response?.ok) return null
    return Buffer.from(await response.arrayBuffer())
  }

  if (url?.startsWith('/')) {
    const response = await fetch(`${publicBase()}${url}`, {
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null)
    if (response?.ok) {
      return Buffer.from(await response.arrayBuffer())
    }
  }

  const filename = file.filename
  if (!filename) return null
  return readFile(path.join(knowledgeFilesDir(), filename)).catch(() => null)
}

export const internalRagEndpoints: Endpoint[] = [
  {
    path: '/internal/rag-settings',
    method: 'get',
    handler: async (req) => {
      if (!requireInternalSecret(req)) {
        return json({ error: 'unauthorized' }, 401)
      }
      const settings = await loadRagSettings(req.payload)
      return json(publicRagSettings(settings))
    },
  },
  {
    path: '/internal/embeddings',
    method: 'post',
    handler: async (req) => {
      if (!requireInternalSecret(req)) {
        return json({ error: 'unauthorized' }, 401)
      }
      const body = ((await req.json?.()) ?? {}) as { input?: string[] }
      if (!Array.isArray(body.input)) {
        return json({ error: 'input must be an array of strings' }, 400)
      }
      try {
        const settings = await loadRagSettings(req.payload)
        const vectors = await proxyEmbeddings(settings, body.input)
        return json({
          dimensions: settings.embedDimensions,
          data: vectors.map((embedding, index) => ({ index, embedding })),
        })
      } catch (error) {
        req.payload.logger.error({ err: error }, 'embedding proxy failed')
        return json({ error: 'The embedding provider is unavailable.' }, 502)
      }
    },
  },
  {
    path: '/internal/chat/completions',
    method: 'post',
    handler: async (req) => {
      if (!requireInternalSecret(req)) {
        return json({ error: 'unauthorized' }, 401)
      }
      const body = ((await req.json?.()) ?? {}) as { system?: string; user?: string }
      if (!body.user) {
        return json({ error: 'user prompt is required' }, 400)
      }
      try {
        const settings = await loadRagSettings(req.payload)
        const content = await proxyCompletion(settings, body.system ?? '', body.user)
        return json({ content })
      } catch (error) {
        req.payload.logger.error({ err: error }, 'chat proxy failed')
        return json({ error: 'The language model is unavailable.' }, 502)
      }
    },
  },
  {
    path: '/internal/knowledge-documents/:id/file',
    method: 'get',
    handler: async (req) => {
      if (!requireInternalSecret(req)) {
        return json({ error: 'unauthorized' }, 401)
      }

      const id = String(req.routeParams?.id ?? '')
      const document = await req.payload
        .findByID({ collection: 'knowledge-documents', id, depth: 1, overrideAccess: true })
        .catch(() => null)

      const file = document?.file
      if (!file || typeof file !== 'object') {
        return json({ error: 'file not found' }, 404)
      }

      const data = await loadKnowledgePdf(file as { filename?: string | null; url?: string | null })
      if (!data) {
        return json({ error: 'file not found' }, 404)
      }

      return new Response(new Uint8Array(data), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(data.byteLength),
        },
      })
    },
  },
  {
    path: '/internal/knowledge-documents/:id/index-status',
    method: 'post',
    handler: async (req) => {
      if (!requireInternalSecret(req)) {
        return json({ error: 'unauthorized' }, 401)
      }

      const id = String(req.routeParams?.id ?? '')
      const body = ((await req.json?.()) ?? {}) as {
        indexStatus?: 'indexed' | 'failed' | 'processing' | 'pending'
        indexError?: string
      }

      if (!body.indexStatus) {
        return json({ error: 'indexStatus is required' }, 400)
      }

      const updated = await req.payload
        .update({
          collection: 'knowledge-documents',
          id,
          overrideAccess: true,
          context: { skipRagSync: true },
          data: {
            indexStatus: body.indexStatus,
            indexError: body.indexError || null,
            indexedAt: body.indexStatus === 'indexed' ? new Date().toISOString() : null,
          },
        })
        .catch(() => null)

      if (!updated) {
        return json({ error: 'document not found' }, 404)
      }
      return json({ id, indexStatus: body.indexStatus })
    },
  },
]
