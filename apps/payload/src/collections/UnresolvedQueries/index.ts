import type { CollectionBeforeChangeHook, CollectionConfig, Endpoint } from 'payload'
import { APIError } from 'payload'
import { z } from 'zod'
import { admins } from '../../access'
import { errors, json, toErrorResponse } from '../../lib/errors'
import {
  appendClinicThreadMessage,
  clinicThreadMessage,
  hydrateClinicThread,
  lastStaffBody,
  lastThreadMessage,
  normalizeQuestionKey,
} from '../../lib/unresolvedQueries'

const stampResolution: CollectionBeforeChangeHook = ({ data, req, originalDoc }) => {
  if (!data) return data

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

const messageSchema = z.object({
  content: z
    .string({ error: 'A message is required.' })
    .trim()
    .min(1, 'A message is required.')
    .max(2000, 'Messages must be 2000 characters or fewer.'),
})

function queryIdFromReq(req: { routeParams?: { id?: unknown }; pathname?: string; url?: string }) {
  const fromParams = req.routeParams?.id
  if (fromParams != null && String(fromParams).length > 0) return String(fromParams)
  const path = req.pathname || req.url || ''
  const match = path.match(/\/unresolved-queries\/([^/?#]+)\/messages/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

const adminReply: Endpoint = {
  path: '/:id/messages',
  method: 'post',
  handler: async (req) => {
    try {
      if (req.user?.role !== 'admin') {
        throw errors.forbidden()
      }
      const id = queryIdFromReq(req)
      if (!id) throw errors.invalidInput('A query id is required.')

      let body: unknown = req.data
      if (typeof req.json === 'function') {
        try {
          const parsed = await req.json()
          if (parsed !== undefined) body = parsed
        } catch {
          /* use req.data */
        }
      }
      const parsed = messageSchema.safeParse(body)
      if (!parsed.success) {
        throw errors.invalidInput(parsed.error.issues[0]?.message ?? 'The request body is invalid.')
      }

      const next = await appendClinicThreadMessage(req.payload, {
        queryId: id,
        role: 'staff',
        body: parsed.data.content,
        authorId: String(req.user.id),
      })
      return json(next)
    } catch (error) {
      return toErrorResponse(error, req.payload, 'unresolved.adminReply')
    }
  },
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
  endpoints: [adminReply],
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
