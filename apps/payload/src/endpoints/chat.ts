import type { Endpoint, PayloadRequest } from 'payload'
import { z } from 'zod'
import { ApiError, ErrorCode, errors, json, toErrorResponse } from '../lib/errors'
import {
  appendChatTurns,
  createChatSession,
  getOrCreateActiveSession,
  historyForRag,
  requireOwnedSession,
  resetChatSession,
} from '../lib/chatSessions'
import { askRag, isRagProviderError, isRagUnavailable } from '../services/rag'

const questionSchema = z.object({
  sessionId: z
    .string({ error: 'A chat session id is required.' })
    .uuid('A valid session id is required.'),
  question: z
    .string({ error: 'A question is required.' })
    .trim()
    .min(1, 'A question is required.')
    .max(1000, 'Questions must be 1000 characters or fewer.'),
})

async function readJsonBody(req: PayloadRequest): Promise<unknown> {
  if (typeof req.json === 'function') {
    try {
      const parsed = await req.json()
      if (parsed !== undefined) return parsed
    } catch {
      // Fall through — some runtimes leave the body on req.data instead.
    }
  }
  if (req.data && typeof req.data === 'object') {
    return req.data
  }
  return {}
}

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

function requireUser(req: PayloadRequest) {
  if (!req.user) {
    throw errors.unauthenticated()
  }
  return req.user
}

function sessionIdFromReq(req: PayloadRequest): string {
  const fromParams = req.routeParams?.id
  if (fromParams != null && String(fromParams).length > 0) {
    return String(fromParams)
  }
  const path = req.pathname || req.url || ''
  const match = path.match(/\/chat\/sessions\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function mapSessionNotFound(error: unknown): never {
  if (error instanceof Error && error.name === 'ChatSessionNotFound') {
    throw new ApiError(ErrorCode.INVALID_INPUT, 404, 'That chat session could not be found.')
  }
  throw error
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

function publicSession(session: Awaited<ReturnType<typeof createChatSession>>) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages.map((message) => ({
      role: message.role,
      content: message.content,
      grounded: message.grounded,
      sources: message.sources ?? [],
      createdAt: message.createdAt,
    })),
  }
}

const createSession: Endpoint = {
  path: '/chat/sessions',
  method: 'post',
  handler: async (req) => {
    try {
      const user = requireUser(req)
      const session = await createChatSession(String(user.id))
      return json(publicSession(session), 201)
    } catch (error) {
      return toErrorResponse(error, req.payload, 'chat.sessions.create')
    }
  },
}

const activeSession: Endpoint = {
  path: '/chat/sessions/active',
  method: 'get',
  handler: async (req) => {
    try {
      const user = requireUser(req)
      const session = await getOrCreateActiveSession(String(user.id))
      return json(publicSession(session))
    } catch (error) {
      return toErrorResponse(error, req.payload, 'chat.sessions.active')
    }
  },
}

const getSession: Endpoint = {
  path: '/chat/sessions/:id',
  method: 'get',
  handler: async (req) => {
    try {
      const user = requireUser(req)
      const sessionId = sessionIdFromReq(req)
      if (!sessionId) {
        throw errors.invalidInput('A session id is required.')
      }
      const session = await requireOwnedSession(sessionId, String(user.id)).catch(mapSessionNotFound)
      return json(publicSession(session))
    } catch (error) {
      return toErrorResponse(error, req.payload, 'chat.sessions.get')
    }
  },
}

const resetSession: Endpoint = {
  path: '/chat/sessions/:id/reset',
  method: 'post',
  handler: async (req) => {
    try {
      const user = requireUser(req)
      const sessionId = sessionIdFromReq(req)
      if (!sessionId) {
        throw errors.invalidInput('A session id is required.')
      }
      const session = await resetChatSession(sessionId, String(user.id)).catch(mapSessionNotFound)
      return json(publicSession(session))
    } catch (error) {
      return toErrorResponse(error, req.payload, 'chat.sessions.reset')
    }
  },
}

export const chatEndpoint: Endpoint = {
  path: '/chat',
  method: 'post',
  handler: async (req) => {
    const payload = req.payload

    try {
      const user = requireUser(req)
      if (rateLimited(String(user.id))) {
        throw new ApiError(ErrorCode.INVALID_INPUT, 429, 'Please wait a moment before asking again.')
      }

      const parsed = questionSchema.safeParse(await readJsonBody(req))
      if (!parsed.success) {
        throw errors.invalidInput(parsed.error.issues[0]?.message ?? 'The request body is invalid.')
      }

      const session = await requireOwnedSession(parsed.data.sessionId, String(user.id)).catch(
        mapSessionNotFound,
      )

      const requestId = req.headers.get('X-Request-Id') ?? `chat-${Date.now()}`
      payload.logger.info(
        {
          requestId,
          userId: String(user.id),
          sessionId: session.id,
          question: parsed.data.question,
          historyTurns: session.messages.length,
        },
        'chat request',
      )

      const history = historyForRag(session)
      const result = await askRag(parsed.data.question, requestId, history)

      payload.logger.info(
        {
          requestId,
          sessionId: session.id,
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

      const now = new Date().toISOString()
      await appendChatTurns(session.id, String(user.id), [
        { role: 'user', content: parsed.data.question, createdAt: now },
        {
          role: 'assistant',
          content: result.answer,
          grounded: Boolean(result.sufficient),
          sources: result.sources ?? [],
          createdAt: now,
        },
      ])

      return json({
        sessionId: session.id,
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
  // Pure greetings / identity are intentional, not missing knowledge coverage.
  return reason !== 'greeting' && reason !== 'identity' && reason !== 'off_topic'
}

export const chatEndpoints: Endpoint[] = [
  createSession,
  activeSession,
  getSession,
  resetSession,
  chatEndpoint,
]
