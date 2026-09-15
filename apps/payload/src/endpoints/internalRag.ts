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

/**
 * Loads a knowledge PDF whether it lives on the local volume or an object store.
 * Cloud adapters expose an absolute `url`; local uploads are read from KNOWLEDGE_FILES_DIR
 * (the public /api/knowledge-files URL is admin-only, so we never rely on it here).
 */
async function loadKnowledgePdf(file: {
  filename?: string | null
  url?: string | null
}): Promise<Buffer | null> {
  const filename = file.filename?.trim()
  if (filename) {
    const fromDisk = await readFile(path.join(knowledgeFilesDir(), filename)).catch(() => null)
    if (fromDisk) return fromDisk
  }

  const url = file.url?.trim()
  if (url?.startsWith('http://') || url?.startsWith('https://')) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
    if (!response?.ok) return null
    return Buffer.from(await response.arrayBuffer())
  }

  return null
}

function documentIdFromReq(req: {
  routeParams?: Record<string, unknown>
  url?: string
  pathname?: string
}): string {
  const fromParams = req.routeParams?.id
  if (fromParams != null && String(fromParams).length > 0) {
    return String(fromParams)
  }

  const path = req.pathname || req.url || ''
  const match = path.match(/\/internal\/knowledge-documents\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
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
        req.payload.logger.info(
          {
            provider: settings.chatProvider,
            model: settings.chatModel,
            userLen: body.user.length,
          },
          'chat proxy request',
        )
        const content = await proxyCompletion(settings, body.system ?? '', body.user)
        req.payload.logger.info(
          { provider: settings.chatProvider, model: settings.chatModel, contentLen: content.length },
          'chat proxy response',
        )
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

      const id = documentIdFromReq(req)
      if (!id) {
        return json({ error: 'file not found' }, 404)
      }

      const document = await req.payload
        .findByID({ collection: 'knowledge-documents', id, depth: 0, overrideAccess: true })
        .catch(() => null)

      const fileRef = document?.file
      const fileId =
        typeof fileRef === 'string' || typeof fileRef === 'number'
          ? String(fileRef)
          : fileRef && typeof fileRef === 'object' && 'id' in fileRef
            ? String((fileRef as { id: string }).id)
            : null

      if (!fileId) {
        return json({ error: 'file not found' }, 404)
      }

      const file = await req.payload
        .findByID({ collection: 'knowledge-files', id: fileId, depth: 0, overrideAccess: true })
        .catch(() => null)

      if (!file) {
        return json({ error: 'file not found' }, 404)
      }

      const data = await loadKnowledgePdf(file as { filename?: string | null; url?: string | null })
      if (!data) {
        req.payload.logger.error(
          { id, fileId, filename: (file as { filename?: string }).filename },
          'knowledge pdf bytes missing on disk/url',
        )
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

      const id = documentIdFromReq(req)
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
