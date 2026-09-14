import type { CollectionConfig } from 'payload'
import { admins } from '../../access'

export const KnowledgeDocuments: CollectionConfig = {
  slug: 'knowledge-documents', admin: { useAsTitle: 'title' }, timestamps: true,
  access: { read: admins, create: admins, update: admins, delete: admins },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'sourceUrl', type: 'text', required: true },
    { name: 'version', type: 'number', defaultValue: 1, min: 1 },
    { name: 'indexStatus', type: 'select', defaultValue: 'pending', options: ['pending', 'processing', 'indexed', 'failed'] },
    { name: 'indexError', type: 'textarea' }, { name: 'indexedAt', type: 'date' },
  ],
}
