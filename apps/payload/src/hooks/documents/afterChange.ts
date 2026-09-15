import type { CollectionAfterChangeHook } from 'payload'
import { syncDocument } from '../../services/rag'

function reachableFromRag(): string {
  return (
    process.env.PAYLOAD_INTERNAL_URL ||
    process.env.PAYLOAD_PUBLIC_URL ||
    'http://127.0.0.1:3000'
  ).replace(/\/$/, '')
}

function fileId(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id)
  }
  return null
}

export const syncKnowledgeDocument: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
  context,
}) => {
  if (context.skipRagSync) return doc

  const fileChanged = fileId(doc.file) !== fileId(previousDoc?.file)
  const versionChanged = doc.version !== previousDoc?.version
  if (operation !== 'create' && !fileChanged && !versionChanged) {
    return doc
  }

  try {
    await req.payload.update({
      collection: 'knowledge-documents',
      id: String(doc.id),
      data: { indexStatus: 'processing', indexError: null },
      overrideAccess: true,
      context: { skipRagSync: true },
    })
  } catch (error) {
    req.payload.logger.error({ err: error, id: doc.id }, 'failed to mark knowledge document processing')
  }

  try {
    await syncDocument({
      documentId: String(doc.id),
      version: Number(doc.version) || 1,
      title: String(doc.title),
      fileUrl: `${reachableFromRag()}/api/internal/knowledge-documents/${doc.id}/file`,
    })
  } catch (error) {
    req.payload.logger.error({ err: error, id: doc.id }, 'RAG sync request failed')
    try {
      await req.payload.update({
        collection: 'knowledge-documents',
        id: String(doc.id),
        data: {
          indexStatus: 'failed',
          indexError: 'The indexing service could not be reached. Try saving the document again.',
        },
        overrideAccess: true,
        context: { skipRagSync: true },
      })
    } catch (updateError) {
      req.payload.logger.error({ err: updateError, id: doc.id }, 'failed to mark knowledge document failed')
    }
  }

  return doc
}
