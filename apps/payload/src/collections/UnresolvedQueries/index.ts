import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { admins } from '../../access'
import {
  clinicThreadMessage,
  hydrateClinicThread,
  lastStaffBody,
  lastThreadMessage,
  normalizeQuestionKey,
} from '../../lib/unresolvedQueries'

const stampResolution: CollectionBeforeChangeHook = ({ data, req, originalDoc, context }) => {
  if (!data) return data
  if (context.skipThreadStamp) return data

  const question = String(data.question ?? originalDoc?.question ?? '')
  if (question) {
    data.questionKey = normalizeQuestionKey(question)
  }

  const merged = {
    question,
    humanResponse: data.humanResponse ?? originalDoc?.humanResponse,
    thread: data.thread ?? originalDoc?.thread,
    createdAt: originalDoc?.createdAt,
    resolvedAt: data.resolvedAt ?? originalDoc?.resolvedAt,
    user: data.user ?? originalDoc?.user,
  }

  let thread = hydrateClinicThread(merged)
  const typedReply = String(data.humanResponse ?? '').trim()
  const lastStaff = lastStaffBody(thread)
  if (typedReply && typedReply !== lastStaff) {
    thread = [
      ...thread,
      clinicThreadMessage('staff', typedReply, req.user?.id ? String(req.user.id) : null),
    ]
  }

  data.thread = thread

  const last = lastThreadMessage(thread)
  const staffBody = lastStaffBody(thread)
  if (staffBody) {
    data.humanResponse = staffBody
  }

  let nextStatus = String(data.status ?? originalDoc?.status ?? 'new')
  if (last?.role === 'staff') {
    data.status = 'resolved'
    nextStatus = 'resolved'
  } else if (last?.role === 'patient') {
    data.status = 'new'
    nextStatus = 'new'
  }

  if (nextStatus === 'resolved' && !staffBody) {
    throw new APIError(
      'Send a clinic reply in the thread before marking this resolved.',
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

  if (nextStatus === 'new' && originalDoc?.status === 'resolved') {
    data.resolvedAt = null
  }

  return data
}

export const UnresolvedQueries: CollectionConfig = {
  slug: 'unresolved-queries',
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'user', 'status', 'updatedAt'],
    listSearchableFields: ['question', 'humanResponse'],
    description:
      'Questions the assistant could not answer. Chat with the patient in the thread — they reply on the Clinic replies tab.',
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
        description: 'RAG chat session that submitted this question.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: [
        { label: 'Waiting for clinic', value: 'new' },
        { label: 'Clinic replied', value: 'resolved' },
      ],
      admin: {
        description: 'Follows the last thread message. A patient reply opens it again.',
      },
    },
    {
      name: 'thread',
      type: 'array',
      admin: {
        description: 'Conversation with the patient. Send a message here; they see it under Clinic replies.',
        components: {
          Field: '/components/ClinicThreadField#ClinicThreadField',
        },
      },
      fields: [
        {
          name: 'role',
          type: 'select',
          required: true,
          options: [
            { label: 'Patient', value: 'patient' },
            { label: 'Clinic', value: 'staff' },
          ],
        },
        { name: 'body', type: 'textarea', required: true },
        { name: 'author', type: 'relationship', relationTo: 'users' },
        { name: 'createdAt', type: 'date' },
      ],
    },
    {
      name: 'humanResponse',
      type: 'textarea',
      admin: {
        hidden: true,
        description: 'Latest clinic message. Kept for list preview and older mobile clients.',
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
      admin: { hidden: true },
    },
    {
      name: 'reviewedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true },
    },
  ],
}
