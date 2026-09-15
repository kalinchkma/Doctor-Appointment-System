import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
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

type IndexStatus = 'pending' | 'processing' | 'indexed' | 'failed'

async function markStatus(
  req: PayloadRequest,
  id: string,
  data: { indexStatus: IndexStatus; indexError?: string | null },
) {
  // Pass `req` so this update shares the create/update transaction. Calling
  // update() without it opens a new transaction that cannot see an uncommitted
  // insert and fails with NotFound (the seed failure mode).
  await req.payload.update({
    collection: 'knowledge-documents',
    id,
    data,
    req,
    overrideAccess: true,
    context: { skipRagSync: true },
  })
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

  const id = String(doc.id)

  try {
    await markStatus(req, id, { indexStatus: 'processing', indexError: null })
  } catch (error) {
    req.payload.logger.error({ err: error, id }, 'failed to mark knowledge document processing')
  }

  // afterChange runs before the surrounding transaction commits. Defer the HTTP
  // call to RAG until after commit so the document (and its upload) are visible
  // when the Go service fetches the PDF and posts index status back.
  const syncPayload = {
    documentId: id,
    version: Number(doc.version) || 1,
    title: String(doc.title),
    fileUrl: `${reachableFromRag()}/api/internal/knowledge-documents/${id}/file`,
  }
  const logger = req.payload.logger
  const payload = req.payload

  setTimeout(() => {
    void (async () => {
      try {
        logger.info({ id, version: syncPayload.version, fileUrl: syncPayload.fileUrl }, 'scheduling RAG document sync')
        await syncDocument(syncPayload)
        logger.info({ id }, 'RAG sync accepted')
      } catch (error) {
        logger.error({ err: error, id }, 'RAG sync request failed')
        try {
          await payload.update({
            collection: 'knowledge-documents',
            id,
            data: {
              indexStatus: 'failed',
              indexError:
                'The indexing service could not be reached. Try saving the document again.',
            },
            overrideAccess: true,
            context: { skipRagSync: true },
          })
        } catch (updateError) {
          logger.error({ err: updateError, id }, 'failed to mark knowledge document failed')
        }
      }
    })()
  }, 500)

  return doc
}
