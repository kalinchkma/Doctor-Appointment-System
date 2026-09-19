import { randomUUID } from 'node:crypto'
import { getRedis } from './redis'

export const SESSION_TTL_SECONDS = 24 * 60 * 60
export const MAX_STORED_MESSAGES = 20

export type ChatRole = 'user' | 'assistant'

export type ChatSessionSource = {
  title: string
  page?: number
  score?: number
}

export type ChatSessionMessage = {
  role: ChatRole
  content: string
  grounded?: boolean
  /** Clinic staff reply written from Unresolved Queries, not the RAG model. */
  fromStaff?: boolean
  sources?: ChatSessionSource[]
  createdAt: string
}

export type ChatSession = {
  id: string
  userId: string
  createdAt: string
  updatedAt: string
  messages: ChatSessionMessage[]
}

const sessionKey = (id: string) => `chat:sess:${id}`
const userIndexKey = (userId: string) => `chat:user:${userId}:sessions`

function trimMessages(messages: ChatSessionMessage[]): ChatSessionMessage[] {
  if (messages.length <= MAX_STORED_MESSAGES) return messages
  return messages.slice(messages.length - MAX_STORED_MESSAGES)
}

async function writeSession(session: ChatSession): Promise<ChatSession> {
  const redis = getRedis()
  const next: ChatSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    messages: trimMessages(session.messages),
  }
  const payload = JSON.stringify(next)
  const pipeline = redis.pipeline()
  pipeline.set(sessionKey(next.id), payload, 'EX', SESSION_TTL_SECONDS)
  pipeline.zadd(userIndexKey(next.userId), Date.now(), next.id)
  pipeline.expire(userIndexKey(next.userId), SESSION_TTL_SECONDS)
  await pipeline.exec()
  return next
}

export async function createChatSession(userId: string): Promise<ChatSession> {
  const now = new Date().toISOString()
  const session: ChatSession = {
    id: randomUUID(),
    userId,
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
  return writeSession(session)
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const raw = await getRedis().get(sessionKey(sessionId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as ChatSession
  } catch {
    return null
  }
}

export async function requireOwnedSession(
  sessionId: string,
  userId: string,
): Promise<ChatSession> {
  const session = await getChatSession(sessionId)
  if (!session || session.userId !== userId) {
    const error = new Error('CHAT_SESSION_NOT_FOUND')
    error.name = 'ChatSessionNotFound'
    throw error
  }
  return session
}

/** Resume the user's newest session, or create one if none exists. */
export async function getOrCreateActiveSession(userId: string): Promise<ChatSession> {
  const redis = getRedis()
  const ids = await redis.zrevrange(userIndexKey(userId), 0, 9)
  for (const id of ids) {
    const session = await getChatSession(id)
    if (session && session.userId === userId) {
      // Touch TTL so an active conversation stays alive.
      await writeSession(session)
      return session
    }
    await redis.zrem(userIndexKey(userId), id)
  }
  return createChatSession(userId)
}

export async function appendChatTurns(
  sessionId: string,
  userId: string,
  turns: ChatSessionMessage[],
): Promise<ChatSession> {
  const session = await requireOwnedSession(sessionId, userId)
  session.messages = trimMessages([...session.messages, ...turns])
  return writeSession(session)
}

/** Clear messages but keep the same session id (mobile "New chat"). */
export async function resetChatSession(sessionId: string, userId: string): Promise<ChatSession> {
  const session = await requireOwnedSession(sessionId, userId)
  session.messages = []
  return writeSession(session)
}

/** History shape forwarded to the Go RAG service (no sources metadata). */
export function historyForRag(
  session: ChatSession,
): { role: ChatRole; content: string }[] {
  return session.messages
    .filter((message) => !message.fromStaff)
    .map(({ role, content }) => ({ role, content }))
}
