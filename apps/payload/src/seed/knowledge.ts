import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'

const knowledgeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/knowledge')

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

  payload.logger.info(`seeded ${files.length} knowledge documents`)
}
