import type { CollectionConfig } from 'payload'
import { admins } from '../../access'

export const UnresolvedQueries: CollectionConfig = {
  slug: 'unresolved-queries', admin: { useAsTitle: 'question' }, timestamps: true,
  access: { create: () => false, read: admins, update: admins, delete: admins },
  fields: [
    { name: 'question', type: 'textarea', required: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    { name: 'status', type: 'select', required: true, defaultValue: 'new', options: ['new', 'resolved'] },
    { name: 'humanResponse', type: 'textarea' },
  ],
}
