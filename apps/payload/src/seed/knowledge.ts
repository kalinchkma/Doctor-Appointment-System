import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'

const knowledgeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/knowledge')

const TERMINAL = new Set(['indexed', 'failed'])

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

  // Let deferred afterChange setImmediate callbacks flush first.
  await new Promise<void>((resolve) => setImmediate(resolve))

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
  const existing = await payload.find({ collection: 'knowledge-documents', limit: 20, overrideAccess: true })
  const incomplete = existing.docs.some((doc) => doc.indexStatus !== 'indexed')

  if (existing.totalDocs > 0 && !incomplete) {
    payload.logger.info(`knowledge documents already present (${existing.totalDocs}), skipping`)
    return
  }

  // A previous seed can leave metadata without files on the CMS volume (or stuck in
  // pending/failed). Wipe and recreate so uploads land on the shared volume and sync again.
  if (existing.totalDocs > 0) {
    payload.logger.info('clearing incomplete knowledge documents before re-seed')
    await clearKnowledge(payload)
  }

  const files = (await readdir(knowledgeDir).catch(() => [])).filter((name) => name.endsWith('.pdf'))
  if (files.length === 0) {
    payload.logger.warn(`no PDFs in ${knowledgeDir}`)
    return
  }

  for (const filename of files) {
    const title = filename
      .replace(/\.pdf$/i, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

    const uploaded = await payload.create({
      collection: 'knowledge-files',
      overrideAccess: true,
      context: { skipRagSync: true },
      data: {},
      filePath: path.join(knowledgeDir, filename),
    })

    await payload.create({
      collection: 'knowledge-documents',
      overrideAccess: true,
      data: {
        title,
        file: uploaded.id,
        version: 1,
        indexStatus: 'pending',
      },
    })
  }

  payload.logger.info(`seeded ${files.length} knowledge documents (indexing in background)`)
}
