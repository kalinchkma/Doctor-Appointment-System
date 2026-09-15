import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'

const knowledgeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/knowledge')

export async function seedKnowledge(payload: Payload) {
  const existing = await payload.find({ collection: 'knowledge-documents', limit: 20, overrideAccess: true })
  if (existing.totalDocs > 0) {
    payload.logger.info(`knowledge documents already present (${existing.totalDocs}), skipping`)
    return
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
