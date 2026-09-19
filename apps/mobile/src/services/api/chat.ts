import type { ChatReply, ChatSession, ChatSuggestedQuestion, ClinicReply } from '../../types'
import { ApiError, get, post } from './client'

/**
 * The mobile app only ever talks to Payload. The RAG service, the vector store, and the
 * LLM credentials stay behind that boundary (ADR-006, ADR-017).
 */
/** Chat waits on retrieval + LLM; keep above Payload's askRag budget (~200s). */
export const askChatbot = (sessionId: string, question: string) => {
  if (!sessionId?.trim()) {
    return Promise.reject(
      new ApiError(
        'INVALID_INPUT',
        400,
        'Chat session is not ready yet. Close and reopen Chat, then try again.',
      ),
    )
  }
  return post<ChatReply>('/api/chat', { sessionId, question }, { timeoutMs: 210_000 })
}

export const createChatSession = () => post<ChatSession>('/api/chat/sessions')

export const getActiveChatSession = () => get<ChatSession>('/api/chat/sessions/active')

export const resetChatSession = (sessionId: string) =>
  post<ChatSession>(`/api/chat/sessions/${sessionId}/reset`)

export async function listClinicReplies(): Promise<ClinicReply[]> {
  const result = await get<{ docs: ClinicReply[] }>('/api/chat/clinic-replies')
  return result.docs ?? []
}

export const getClinicReply = (id: string) => get<ClinicReply>(`/api/chat/clinic-replies/${id}`)

type SuggestedList = {
  docs: ChatSuggestedQuestion[]
}

export async function listSuggestedQuestions(): Promise<ChatSuggestedQuestion[]> {
  const query = new URLSearchParams({
    'where[active][equals]': 'true',
    sort: 'order',
    limit: '20',
    depth: '0',
  })
  const result = await get<SuggestedList>(`/api/chat-suggested-questions?${query}`)
  return result.docs ?? []
}
