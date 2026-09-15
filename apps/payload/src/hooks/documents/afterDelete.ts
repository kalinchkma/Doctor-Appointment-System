import type { CollectionAfterDeleteHook } from 'payload'
import { deleteDocument } from '../../services/rag'

export const deleteKnowledgeVectors: CollectionAfterDeleteHook = async ({ doc, req }) => {
  try {
    await deleteDocument(String(doc.id))
  } catch (error) {
    req.payload.logger.error({ err: error, id: doc.id }, 'RAG delete request failed')
  }
}
