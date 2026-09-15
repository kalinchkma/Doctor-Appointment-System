import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'
import { syncDocument } from '../services/rag'

const knowledgeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/knowledge')

const TERMINAL = new Set(['indexed', 'failed'])

function payloadInternalUrl(): string {
  return (process.env.PAYLOAD_INTERNAL_URL || 'http://cms:3000').replace(/\/$/, '')
}

async function clearKnowledge(payload: Payload) {
  const documents = await payload.find({
    collection: 'knowledge-documents',
    limit: 100,
    overrideAccess: true,
  })
  for (const doc of documents.docs) {
    await payload.delete({
      collection: 'knowledge-documents',
      id: doc.id,
      overrideAccess: true,
    })
  }

  const files = await payload.find({
    collection: 'knowledge-files',
    limit: 100,
    overrideAccess: true,
  })
  for (const file of files.docs) {
    await payload.delete({
      collection: 'knowledge-files',
      id: file.id,
      overrideAccess: true,
    })
  }
}

/** Wait until every knowledge document reaches indexed/failed (or timeout). */
export async function waitForKnowledgeIndex(
  payload: Payload,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 180_000
  const pollMs = options.pollMs ?? 2_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const docs = await payload.find({
      collection: 'knowledge-documents',
      limit: 50,
      overrideAccess: true,
    })
    if (docs.totalDocs === 0) return

    const pending = docs.docs.filter((doc) => !TERMINAL.has(String(doc.indexStatus)))
    if (pending.length === 0) {
      const failed = docs.docs.filter((doc) => doc.indexStatus === 'failed')
      if (failed.length > 0) {
        payload.logger.warn(
          `${failed.length} knowledge document(s) failed indexing — check Ollama models and RAG logs`,
        )
      } else {
        payload.logger.info(`all ${docs.totalDocs} knowledge documents indexed`)
      }
      return
    }

    payload.logger.info(
      `waiting for knowledge index: ${pending.length} still ${pending.map((d) => d.indexStatus).join(',')}`,
    )
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs))
  }

  payload.logger.warn('timed out waiting for knowledge documents to finish indexing')
}

export async function seedKnowledge(payload: Payload) {
  // Always refresh from docs/knowledge so PDF content updates are re-uploaded and re-indexed.
  const existing = await payload.find({ collection: 'knowledge-documents', limit: 20, overrideAccess: true })
  if (existing.totalDocs > 0) {
    payload.logger.info(`clearing ${existing.totalDocs} knowledge document(s) before re-seed`)
    await clearKnowledge(payload)
  }

  const files = (await readdir(knowledgeDir).catch(() => [])).filter((name) => name.endsWith('.pdf'))
  if (files.length === 0) {
    payload.logger.warn(`no PDFs in ${knowledgeDir}`)
    return
  }

  const created: { id: string; title: string; version: number }[] = []

  for (const filename of files) {
    const title = filename
      .replace(/\.pdf$/i, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

    const uploaded = await payload.create({
      collection: 'knowledge-files',
      overrideAccess: true,
      // Seed creates the Knowledge Document below with a curated title.
      context: { skipKnowledgeDocument: true },
      data: {},
      filePath: path.join(knowledgeDir, filename),
    })

    const doc = await payload.create({
      collection: 'knowledge-documents',
      overrideAccess: true,
      // Sync after all creates commit — avoids RAG fetching a not-yet-visible document.
      context: { skipRagSync: true },
      data: {
        title,
        file: uploaded.id,
        version: 1,
        indexStatus: 'processing',
      },
    })

    created.push({ id: String(doc.id), title: String(doc.title), version: Number(doc.version) || 1 })
  }

  const base = payloadInternalUrl()
  for (const doc of created) {
    const fileUrl = `${base}/api/internal/knowledge-documents/${doc.id}/file`
    try {
      payload.logger.info({ id: doc.id, fileUrl }, 'seed triggering RAG document sync')
      await syncDocument({
        documentId: doc.id,
        version: doc.version,
        title: doc.title,
        fileUrl,
      })
    } catch (error) {
      payload.logger.error({ err: error, id: doc.id }, 'seed RAG sync failed')
      await payload.update({
        collection: 'knowledge-documents',
        id: doc.id,
        overrideAccess: true,
        context: { skipRagSync: true },
        data: {
          indexStatus: 'failed',
          indexError: 'The indexing service could not be reached during seed.',
        },
      })
    }
  }

  payload.logger.info(`seeded ${files.length} knowledge documents (indexing in background)`)
}
