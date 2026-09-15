import type { Endpoint, PayloadRequest } from 'payload'
import { z } from 'zod'
import { ApiError, ErrorCode, errors, json, toErrorResponse } from '../lib/errors'
import { askRag, isRagProviderError, isRagUnavailable } from '../services/rag'

const questionSchema = z.object({
  question: z.string().trim().min(1, 'A question is required.').max(1000, 'Questions must be 1000 characters or fewer.'),
})

const windowMs = 60_000
const maxPerWindow = 20
const hits = new Map<string, { count: number; reset: number }>()

function rateLimited(userId: string): boolean {
  const now = Date.now()
  const current = hits.get(userId)
  if (!current || current.reset < now) {
    hits.set(userId, { count: 1, reset: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > maxPerWindow
}

const unavailable = () =>
  new ApiError(
    ErrorCode.ASSISTANT_UNAVAILABLE,
    503,
    'The assistant is temporarily unavailable. Please try again.',
  )

const providerFailed = () =>
  new ApiError(
    ErrorCode.ASSISTANT_UNAVAILABLE,
    502,
    'The assistant is temporarily unavailable. Please try again.',
  )

export const chatEndpoint: Endpoint = {
  path: '/chat',
  method: 'post',
  handler: async (req) => {
    const payload = req.payload

    try {
      if (!req.user) {
        throw errors.unauthenticated()
      }
      if (rateLimited(String(req.user.id))) {
        throw new ApiError(ErrorCode.INVALID_INPUT, 429, 'Please wait a moment before asking again.')
      }

      const parsed = questionSchema.safeParse(await req.json?.())
      if (!parsed.success) {
        throw errors.invalidInput(parsed.error.issues[0]?.message ?? 'The request body is invalid.')
      }

      const requestId = req.headers.get('X-Request-Id') ?? `chat-${Date.now()}`
      payload.logger.info(
        { requestId, userId: String(req.user.id), question: parsed.data.question },
        'chat request',
      )

      const result = await askRag(parsed.data.question, requestId)

      payload.logger.info(
        {
          requestId,
          sufficient: result.sufficient,
          reason: result.reason,
          topScore: result.topScore,
          confidence: result.confidence,
          sources: result.sources?.length ?? 0,
        },
        'chat response from RAG',
      )

      if (!result.sufficient && shouldRecordUnresolved(result.reason)) {
        await recordUnresolved(req, parsed.data.question, result.reason, result.topScore)
      }

      return json({
        answer: result.answer,
        sources: result.sources ?? [],
        grounded: Boolean(result.sufficient),
        topScore: typeof result.topScore === 'number' ? result.topScore : 0,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
        reason: result.reason ?? '',
      })
    } catch (error) {
      if (isRagProviderError(error)) {
        return toErrorResponse(providerFailed(), payload, 'chat')
      }
      if (isRagUnavailable(error)) {
        return toErrorResponse(unavailable(), payload, 'chat')
      }
      return toErrorResponse(error, payload, 'chat')
    }
  },
}

async function recordUnresolved(
  req: PayloadRequest,
  question: string,
  reason?: string,
  topScore?: number,
) {
  try {
    await req.payload.create({
      collection: 'unresolved-queries',
      overrideAccess: true,
      data: {
        question,
        user: req.user!.id,
        status: 'new',
        retrievalReason: (reason as
          | 'no_results'
          | 'below_threshold'
          | 'low_coverage'
          | 'llm_declined'
          | undefined) || null,
        topScore: typeof topScore === 'number' ? topScore : null,
      },
    })
  } catch (error) {
    req.payload.logger.error({ err: error }, 'failed to record unresolved query')
  }
}

function shouldRecordUnresolved(reason?: string): boolean {
  // Chitchat / off-topic redirects are intentional, not missing medical coverage.
  return reason !== 'greeting' && reason !== 'identity' && reason !== 'off_topic'
}

export const chatEndpoints: Endpoint[] = [chatEndpoint]
