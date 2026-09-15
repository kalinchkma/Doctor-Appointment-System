import type { ChatReply } from '../../types'
import { post } from './client'

/**
 * The mobile app only ever talks to Payload. The RAG service, the vector store, and the
 * LLM credentials stay behind that boundary (ADR-006, ADR-017).
 */
export const askChatbot = (question: string) => post<ChatReply>('/api/chat', { question })
