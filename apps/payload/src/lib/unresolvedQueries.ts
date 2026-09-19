import type { Payload } from 'payload'

export type RetrievalReason = 'no_results' | 'below_threshold' | 'low_coverage' | 'llm_declined'

export const RETRIEVAL_REASONS: readonly RetrievalReason[] = [
  'no_results',
  'below_threshold',
  'low_coverage',
  'llm_declined',
]

export type PublicClinicReply = {
  id: string
  question: string
  status: 'new' | 'resolved'
  humanResponse: string | null
  lastBody: string | null
  lastRole: 'patient' | 'staff' | null
  waitingOn: 'staff' | 'patient'
  messageCount: number
  messages: { role: 'patient' | 'staff'; body: string; createdAt: string }[]
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

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

export function toPublicClinicReply(doc: {
  id: string | number
  question?: string | null
  status?: string | null
  humanResponse?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  resolvedAt?: string | null
}): PublicClinicReply {
  const question = String(doc.question ?? '').trim()
  const humanResponse = typeof doc.humanResponse === 'string' ? doc.humanResponse.trim() : ''
  const createdAt = String(doc.createdAt ?? '')
  const status = humanResponse || doc.status === 'resolved' ? 'resolved' : 'new'
  const messages: PublicClinicReply['messages'] = []
  if (question) {
    messages.push({ role: 'patient', body: question, createdAt })
  }
  if (humanResponse) {
    messages.push({
      role: 'staff',
      body: humanResponse,
      createdAt: doc.resolvedAt ? String(doc.resolvedAt) : createdAt,
    })
  }
  const last = messages[messages.length - 1]
  return {
    id: String(doc.id),
    question,
    status,
    humanResponse: humanResponse || null,
    lastBody: last?.body ?? null,
    lastRole: last?.role ?? null,
    waitingOn: humanResponse ? 'patient' : 'staff',
    messageCount: messages.length,
    messages,
    createdAt,
    updatedAt: String(doc.updatedAt ?? createdAt),
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
    await payload.update({
      collection: 'unresolved-queries',
      id: open.id,
      data: {
        sessionId: input.sessionId || open.sessionId || null,
        retrievalReason: parseRetrievalReason(input.reason),
        topScore: typeof input.topScore === 'number' ? input.topScore : open.topScore,
      },
      overrideAccess: true,
    })
    return
  }

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
