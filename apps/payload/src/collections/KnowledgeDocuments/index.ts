import type { CollectionConfig } from 'payload'
import { admins } from '../../access'
import { syncKnowledgeDocument } from '../../hooks/documents/afterChange'
import { deleteKnowledgeVectors } from '../../hooks/documents/afterDelete'

// Payload owns knowledge-document metadata and indexing state; the Go service owns the
// vectors derived from it (ADR-009). Bumping `version` is what triggers a re-index, so
// replacing a file cannot leave stale vectors behind (ADR-010).
export const KnowledgeDocuments: CollectionConfig = {
  slug: 'knowledge-documents',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'version', 'indexStatus', 'indexedAt'],
    description:
      'Indexed PDFs for the healthcare assistant. Uploading under Knowledge Files also creates a document here automatically.',
  },
  timestamps: true,
  hooks: {
    afterChange: [syncKnowledgeDocument],
    afterDelete: [deleteKnowledgeVectors],
  },
  access: { read: admins, create: admins, update: admins, delete: admins },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'file',
      type: 'upload',
      relationTo: 'knowledge-files',
      required: true,
      admin: { description: 'The source PDF. Replacing it should also bump the version.' },
    },
    { name: 'version', type: 'number', required: true, defaultValue: 1, min: 1 },
    {
      name: 'indexStatus',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: ['pending', 'processing', 'indexed', 'failed'],
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Maintained by the RAG ingestion pipeline.',
      },
    },
    { name: 'indexedAt', type: 'date', admin: { readOnly: true } },
    { name: 'indexError', type: 'textarea', admin: { readOnly: true } },
  ],
}
