import type { ChatReply, ChatSuggestedQuestion } from '../../types'
import { get, post } from './client'

/**
 * The mobile app only ever talks to Payload. The RAG service, the vector store, and the
 * LLM credentials stay behind that boundary (ADR-006, ADR-017).
 */
/** Chat can wait on retrieval + LLM; abort before the UI spinner hangs forever. */
export const askChatbot = (question: string) =>
  post<ChatReply>('/api/chat', { question }, { timeoutMs: 90_000 })

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
