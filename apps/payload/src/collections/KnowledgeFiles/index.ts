import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CollectionConfig } from 'payload'
import { admins } from '../../access'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Source PDFs for the RAG knowledge base. Admin-only at every level: these files are
// fetched by the Go ingestion pipeline over the internal network, never by patients.
export const KnowledgeFiles: CollectionConfig = {
  slug: 'knowledge-files',
  admin: { useAsTitle: 'filename' },
  access: { read: admins, create: admins, update: admins, delete: admins },
  upload: {
    staticDir: path.resolve(dirname, '../../../knowledge-files'),
    mimeTypes: ['application/pdf'],
  },
  fields: [],
}
