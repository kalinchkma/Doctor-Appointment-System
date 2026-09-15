import type { CollectionAfterChangeHook, CollectionConfig } from 'payload'
import { admins } from '../../access'
import { knowledgeFilesDir } from '../../lib/paths'

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Uploading a PDF under Knowledge Files should become a searchable knowledge document.
 * If no document references this file yet, create one so the RAG sync hook runs.
 */
const ensureKnowledgeDocument: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
  context,
}) => {
  if (context.skipKnowledgeDocument) return doc
  if (operation !== 'create' && operation !== 'update') return doc

  const fileID = String(doc.id)
  const filename = typeof doc.filename === 'string' ? doc.filename : 'Document.pdf'

  const existing = await req.payload.find({
    collection: 'knowledge-documents',
    where: { file: { equals: fileID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.totalDocs > 0) {
    // Replacing the binary on an existing file: bump version so afterChange re-indexes.
    if (operation === 'update') {
      const linked = existing.docs[0]
      try {
        await req.payload.update({
          collection: 'knowledge-documents',
          id: linked.id,
          data: { version: Number(linked.version || 1) + 1 },
          overrideAccess: true,
          req,
        })
        req.payload.logger.info(
          { fileId: fileID, documentId: linked.id },
          'knowledge file updated; bumped document version for re-index',
        )
      } catch (error) {
        req.payload.logger.error(
          { err: error, fileId: fileID },
          'failed to bump knowledge document version after file update',
        )
      }
    }
    return doc
  }

  try {
    const created = await req.payload.create({
      collection: 'knowledge-documents',
      overrideAccess: true,
      req,
      data: {
        title: titleFromFilename(filename),
        file: fileID,
        version: 1,
        indexStatus: 'pending',
      },
    })
    req.payload.logger.info(
      { fileId: fileID, documentId: created.id, title: created.title },
      'created knowledge document from uploaded file; RAG sync scheduled',
    )
  } catch (error) {
    req.payload.logger.error(
      { err: error, fileId: fileID },
      'failed to create knowledge document for uploaded file',
    )
  }

  return doc
}

// Source PDFs for the RAG knowledge base. Admin-only at every level: these files are
// fetched by the Go ingestion pipeline over the internal network, never by patients.
export const KnowledgeFiles: CollectionConfig = {
  slug: 'knowledge-files',
  admin: {
    useAsTitle: 'filename',
    description:
      'Upload a PDF here to index it for the healthcare assistant. A Knowledge Document is created automatically and embedded asynchronously.',
  },
  access: { read: admins, create: admins, update: admins, delete: admins },
  hooks: {
    afterChange: [ensureKnowledgeDocument],
  },
  upload: {
    staticDir: knowledgeFilesDir(),
    mimeTypes: ['application/pdf'],
  },
  fields: [],
}
