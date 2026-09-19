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
  createdAt: string
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

export function toPublicClinicReply(doc: {
  id: string | number
  question?: string | null
  status?: string | null
  humanResponse?: string | null
  createdAt?: string | null
  resolvedAt?: string | null
}): PublicClinicReply {
  const status = doc.status === 'resolved' ? 'resolved' : 'new'
  const humanResponse = typeof doc.humanResponse === 'string' ? doc.humanResponse.trim() : ''
  return {
    id: String(doc.id),
    question: String(doc.question ?? '').trim(),
    status,
    humanResponse: status === 'resolved' && humanResponse ? humanResponse : null,
    createdAt: String(doc.createdAt ?? ''),
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
    await payload.update({
      collection: 'unresolved-queries',
      id: open.id,
      data: {
        sessionId: nextSession || null,
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
