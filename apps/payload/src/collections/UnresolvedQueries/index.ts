import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { admins } from '../../access'

const stampResolution: CollectionBeforeChangeHook = ({ data, req, originalDoc }) => {
  if (data.status === 'resolved' && originalDoc?.status !== 'resolved') {
    data.resolvedAt = new Date().toISOString()
    if (req.user?.id) {
      data.reviewedBy = req.user.id
    }
  }
  return data
}

export const UnresolvedQueries: CollectionConfig = {
  slug: 'unresolved-queries',
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'user', 'status', 'retrievalReason', 'createdAt'],
    listSearchableFields: ['question', 'humanResponse'],
  },
  timestamps: true,
  hooks: { beforeChange: [stampResolution] },
  access: { create: () => false, read: admins, update: admins, delete: admins },
  fields: [
    { name: 'question', type: 'textarea', required: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: ['new', 'resolved'],
    },
    { name: 'humanResponse', type: 'textarea' },
    {
      name: 'retrievalReason',
      type: 'select',
      options: ['no_results', 'below_threshold', 'low_coverage', 'llm_declined'],
      admin: { readOnly: true, description: 'Why the sufficiency gates declined to answer.' },
    },
    {
      name: 'topScore',
      type: 'number',
      admin: { readOnly: true, description: 'Highest vector-search score for this question.' },
    },
    { name: 'resolvedAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'reviewedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true },
    },
  ],
}
