import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { admins } from '../../access'
import { normalizeQuestionKey } from '../../lib/unresolvedQueries'

const stampResolution: CollectionBeforeChangeHook = ({ data, req, originalDoc, operation }) => {
  if (!data) return data

  const question = String(data.question ?? originalDoc?.question ?? '')
  if (question) {
    data.questionKey = normalizeQuestionKey(question)
  }

  const nextStatus = String(data.status ?? originalDoc?.status ?? 'new')
  const humanResponse = String(data.humanResponse ?? originalDoc?.humanResponse ?? '').trim()

  if (nextStatus === 'resolved' && !humanResponse) {
    throw new APIError(
      'Add a clinic reply before marking this question resolved. The patient will see it under Clinic replies.',
      400,
      undefined,
      true,
    )
  }

  if (nextStatus === 'resolved' && originalDoc?.status !== 'resolved') {
    const now = new Date().toISOString()
    data.resolvedAt = now
    data.deliveredAt = now
    if (req.user?.id) {
      data.reviewedBy = req.user.id
    }
  }

  if (operation === 'update' && nextStatus === 'new' && originalDoc?.status === 'resolved') {
    data.resolvedAt = null
    data.reviewedBy = null
    data.deliveredAt = null
  }

  return data
}

export const UnresolvedQueries: CollectionConfig = {
  slug: 'unresolved-queries',
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'user', 'status', 'retrievalReason', 'createdAt'],
    listSearchableFields: ['question', 'humanResponse'],
    description:
      'Questions the assistant could not answer from the knowledge base. Type a clinic reply and mark Resolved — the patient sees it on the Clinic replies tab, not in the RAG chat.',
  },
  timestamps: true,
  hooks: { beforeChange: [stampResolution] },
  access: { create: () => false, read: admins, update: admins, delete: admins },
  fields: [
    { name: 'question', type: 'textarea', required: true },
    {
      name: 'questionKey',
      type: 'text',
      index: true,
      admin: { hidden: true },
    },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    {
      name: 'sessionId',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description: 'Chat session that submitted this question (for admin context only).',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: ['new', 'resolved'],
      admin: {
        description: 'Resolved requires a clinic reply. That reply appears on the patient’s Clinic replies tab.',
      },
    },
    {
      name: 'humanResponse',
      type: 'textarea',
      admin: {
        description: 'Required to resolve. Shown on the patient’s Clinic replies tab, not in the assistant chat.',
      },
    },
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
      name: 'deliveredAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'When the clinic reply became visible on the patient’s Clinic replies tab.',
      },
    },
    {
      name: 'reviewedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true },
    },
  ],
}
