import type { Payload } from 'payload'
import { ApiError, ErrorCode, errors } from './errors'

export type RetrievalReason = 'no_results' | 'below_threshold' | 'low_coverage' | 'llm_declined'

export const RETRIEVAL_REASONS: readonly RetrievalReason[] = [
  'no_results',
  'below_threshold',
  'low_coverage',
  'llm_declined',
]

export type ClinicThreadRole = 'patient' | 'staff'

export type ClinicThreadMessage = {
  role: ClinicThreadRole
  body: string
  author?: string | null
  createdAt: string
}

export type PublicClinicReply = {
  id: string
  question: string
  status: 'new' | 'resolved'
  humanResponse: string | null
  lastBody: string | null
  lastRole: ClinicThreadRole | null
  waitingOn: 'staff' | 'patient'
  messageCount: number
  messages: ClinicThreadMessage[]
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export const MAX_THREAD_MESSAGES = 40

export function normalizeQuestionKey(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function parseRetrievalReason(reason?: string): RetrievalReason | null {
  if (!reason) return null
  return RETRIEVAL_REASONS.includes(reason as RetrievalReason) ? (reason as RetrievalReason) : null
}

/** Greetings and identity turns are intentional, not missing knowledge. */
export function shouldRecordUnresolved(reason?: string): boolean {
  return reason !== 'greeting' && reason !== 'identity' && reason !== 'off_topic'
}

export function relationId(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id)
  }
  return ''
}

export function clinicThreadMessage(
  role: ClinicThreadRole,
  body: string,
  author?: string | null,
  createdAt = new Date().toISOString(),
): ClinicThreadMessage {
  return {
    role,
    body: body.trim(),
    author: author || null,
    createdAt,
  }
}

function persistThread(thread: ClinicThreadMessage[]) {
  return trimThread(thread).map((message) => ({
    role: message.role,
    body: message.body,
    createdAt: message.createdAt,
    ...(message.author ? { author: message.author } : {}),
  }))
}

export function parseThread(value: unknown): ClinicThreadMessage[] {
  if (!Array.isArray(value)) return []
  const out: ClinicThreadMessage[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const role = item.role === 'staff' ? 'staff' : item.role === 'patient' ? 'patient' : null
    const body = typeof item.body === 'string' ? item.body.trim() : ''
    if (!role || !body) continue
    out.push({
      role,
      body,
      author: relationId(item.author) || null,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    })
  }
  return out
}

export function trimThread(messages: ClinicThreadMessage[]): ClinicThreadMessage[] {
  if (messages.length <= MAX_THREAD_MESSAGES) return messages
  const first = messages[0]
  const rest = messages.slice(messages.length - (MAX_THREAD_MESSAGES - 1))
  if (first && rest[0] !== first) return [first, ...rest]
  return rest
}

export function hydrateClinicThread(doc: {
  question?: string | null
  humanResponse?: string | null
  thread?: unknown
  createdAt?: string | null
  resolvedAt?: string | null
  user?: unknown
}): ClinicThreadMessage[] {
  const existing = parseThread(doc.thread)
  if (existing.length > 0) return trimThread(existing)

  const question = String(doc.question ?? '').trim()
  const seeded: ClinicThreadMessage[] = []
  if (question) {
    seeded.push(
      clinicThreadMessage('patient', question, relationId(doc.user) || null, doc.createdAt || undefined),
    )
  }
  const humanResponse = typeof doc.humanResponse === 'string' ? doc.humanResponse.trim() : ''
  if (humanResponse) {
    seeded.push(
      clinicThreadMessage('staff', humanResponse, null, doc.resolvedAt || undefined),
    )
  }
  return seeded
}

export function lastThreadMessage(thread: ClinicThreadMessage[]): ClinicThreadMessage | null {
  return thread.length > 0 ? thread[thread.length - 1]! : null
}

export function lastStaffBody(thread: ClinicThreadMessage[]): string | null {
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    if (thread[i]?.role === 'staff') return thread[i]!.body
  }
  return null
}

export function waitingOn(thread: ClinicThreadMessage[]): 'staff' | 'patient' {
  const last = lastThreadMessage(thread)
  return last?.role === 'staff' ? 'patient' : 'staff'
}

export function toPublicClinicReply(doc: {
  id: string | number
  question?: string | null
  status?: string | null
  humanResponse?: string | null
  thread?: unknown
  createdAt?: string | null
  updatedAt?: string | null
  resolvedAt?: string | null
  user?: unknown
}): PublicClinicReply {
  const messages = hydrateClinicThread(doc)
  const last = lastThreadMessage(messages)
  const staffBody = lastStaffBody(messages)
  const humanResponse =
    staffBody || (typeof doc.humanResponse === 'string' ? doc.humanResponse.trim() : '')
  const status = last?.role === 'staff' || doc.status === 'resolved' ? 'resolved' : 'new'
  return {
    id: String(doc.id),
    question: String(doc.question ?? '').trim(),
    status,
    humanResponse: humanResponse || null,
    lastBody: last?.body ?? null,
    lastRole: last?.role ?? null,
    waitingOn: waitingOn(messages),
    messageCount: messages.length,
    messages,
    createdAt: String(doc.createdAt ?? ''),
    updatedAt: String(doc.updatedAt ?? doc.createdAt ?? ''),
    resolvedAt: doc.resolvedAt ? String(doc.resolvedAt) : null,
  }
}

export async function recordUnresolvedQuery(
  payload: Payload,
  input: {
    userId: string
    question: string
    sessionId?: string
    reason?: string
    topScore?: number
  },
): Promise<void> {
  const question = input.question.trim()
  const questionKey = normalizeQuestionKey(question)
  if (!questionKey) return

  const existing = await payload.find({
    collection: 'unresolved-queries',
    where: {
      and: [
        { user: { equals: input.userId } },
        { questionKey: { equals: questionKey } },
        { status: { equals: 'new' } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.totalDocs > 0) {
    const open = existing.docs[0]
    const nextSession = input.sessionId || open.sessionId
    const thread = hydrateClinicThread(open)
    await payload.update({
      collection: 'unresolved-queries',
      id: open.id,
      data: {
        sessionId: nextSession || null,
        retrievalReason: parseRetrievalReason(input.reason),
        topScore: typeof input.topScore === 'number' ? input.topScore : open.topScore,
        thread,
      },
      overrideAccess: true,
    })
    return
  }

  const now = new Date().toISOString()
  await payload.create({
    collection: 'unresolved-queries',
    overrideAccess: true,
    data: {
      question,
      questionKey,
      user: input.userId,
      sessionId: input.sessionId || null,
      status: 'new',
      retrievalReason: parseRetrievalReason(input.reason),
      topScore: typeof input.topScore === 'number' ? input.topScore : null,
      thread: [clinicThreadMessage('patient', question, input.userId, now)],
    },
  })
}

export async function findOwnedClinicQuery(
  payload: Payload,
  queryId: string,
  userId: string,
) {
  const doc = await payload
    .findByID({
      collection: 'unresolved-queries',
      id: queryId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!doc || relationId(doc.user) !== userId) return null
  return doc
}

export async function appendClinicThreadMessage(
  payload: Payload,
  input: {
    queryId: string
    role: ClinicThreadRole
    body: string
    authorId: string
  },
) {
  const body = input.body.trim()
  if (!body) {
    throw errors.invalidInput('A message is required.')
  }

  const doc = await payload
    .findByID({
      collection: 'unresolved-queries',
      id: input.queryId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!doc) {
    throw new ApiError(ErrorCode.INVALID_INPUT, 404, 'That clinic conversation could not be found.')
  }

  const thread = persistThread([
    ...hydrateClinicThread(doc),
    clinicThreadMessage(input.role, body, input.authorId),
  ])
  const staffBody = lastStaffBody(thread)
  const last = lastThreadMessage(thread)
  const now = new Date().toISOString()

  const updated = await payload.update({
    collection: 'unresolved-queries',
    id: input.queryId,
    depth: 0,
    overrideAccess: true,
    context: { skipThreadStamp: true },
    data: {
      thread,
      humanResponse: staffBody,
      status: last?.role === 'staff' ? 'resolved' : 'new',
      ...(last?.role === 'staff'
        ? {
            resolvedAt: now,
            deliveredAt: now,
            reviewedBy: input.role === 'staff' ? input.authorId : undefined,
          }
        : { resolvedAt: null }),
    },
  })

  return toPublicClinicReply(updated)
}

export async function listClinicRepliesForUser(
  payload: Payload,
  userId: string,
): Promise<PublicClinicReply[]> {
  const found = await payload.find({
    collection: 'unresolved-queries',
    where: { user: { equals: userId } },
    sort: '-updatedAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs.map(toPublicClinicReply)
}
