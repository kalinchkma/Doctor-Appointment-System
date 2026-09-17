import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToolbar,
} from '@ionic/react'
import { createOutline, send } from 'ionicons/icons'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor } from '../hooks/useAsync'
import {
  askChatbot,
  createChatSession,
  getActiveChatSession,
  listSuggestedQuestions,
  resetChatSession,
} from '../services/api/chat'
import type { ChatSessionMessage, ChatSource, ChatSuggestedQuestion } from '../types'

type Message = {
  id: string
  author: 'user' | 'assistant'
  text: string
  sources?: ChatSource[]
  failed?: boolean
  fallback?: boolean
  topScore?: number
  confidence?: number
}

const greeting: Message = {
  id: 'greeting',
  author: 'assistant',
  text: 'Hello. Ask me about the clinic’s healthcare guidance and I will answer from our published documents. If something is not covered there, I will say so rather than guess.',
}

function fromSessionMessages(messages: ChatSessionMessage[]): Message[] {
  if (messages.length === 0) return [greeting]
  return messages.map((message, index) => ({
    id: `s-${index}-${message.createdAt}`,
    author: message.role === 'user' ? 'user' : 'assistant',
    text: message.content,
    sources: message.grounded ? message.sources : [],
    fallback: message.role === 'assistant' ? message.grounded === false : undefined,
  }))
}

export function Chat() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([greeting])
  const [question, setQuestion] = useState('')
  const [thinking, setThinking] = useState(false)
  const [loadingSession, setLoadingSession] = useState(true)
  const [suggestions, setSuggestions] = useState<ChatSuggestedQuestion[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    listSuggestedQuestions()
      .then((docs) => {
        if (!cancelled) setSuggestions(docs)
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingSession(true)
    ;(async () => {
      try {
        let session = await getActiveChatSession().catch(() => null)
        if (!session) {
          session = await createChatSession()
        }
        if (cancelled) return
        setSessionId(session.id)
        setMessages(fromSessionMessages(session.messages))
      } catch {
        if (cancelled) return
        setSessionId(null)
        setMessages([greeting])
      } finally {
        if (!cancelled) setLoadingSession(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || thinking || !sessionId) return

      setMessages((current) => [
        ...current,
        { id: `q-${Date.now()}`, author: 'user', text: trimmed },
      ])
      setQuestion('')
      setSelectedSuggestion('')
      setThinking(true)

      try {
        const reply = await askChatbot(sessionId, trimmed)
        setSessionId(reply.sessionId)
        setMessages((current) => [
          ...current,
          {
            id: `a-${Date.now()}`,
            author: 'assistant',
            text: reply.answer,
            sources: reply.grounded ? reply.sources : [],
            fallback: !reply.grounded,
            topScore: reply.topScore,
            confidence: reply.confidence,
          },
        ])
      } catch (reason) {
        setMessages((current) => [
          ...current,
          { id: `e-${Date.now()}`, author: 'assistant', text: messageFor(reason), failed: true },
        ])
      } finally {
        setThinking(false)
      }
    },
    [thinking, sessionId],
  )

  const onNewChat = async () => {
    if (!sessionId || thinking) return
    setThinking(true)
    try {
      const session = await resetChatSession(sessionId)
      setSessionId(session.id)
      setMessages([greeting])
      setSelectedSuggestion('')
      setQuestion('')
    } catch (reason) {
      setMessages((current) => [
        ...current,
        { id: `e-${Date.now()}`, author: 'assistant', text: messageFor(reason), failed: true },
      ])
    } finally {
      setThinking(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await ask(question)
  }

  const onSuggestionChange = (value: string | undefined | null) => {
    const next = value ?? ''
    setSelectedSuggestion(next)
    if (next) void ask(next)
  }

  return (
    <IonPage>
      <ScreenHeader
        title="Healthcare assistant"
        actions={
          <IonButton
            onClick={onNewChat}
            disabled={!sessionId || thinking || loadingSession}
            aria-label="Start a new chat"
          >
            <IonIcon slot="icon-only" icon={createOutline} />
          </IonButton>
        }
      />
      <IonContent className="ion-padding">
        {loadingSession ? (
          <div className="state-block">
            <IonSpinner />
            <p>Restoring your chat…</p>
          </div>
        ) : (
          <div className="chat-log">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`bubble ${message.author}${message.fallback ? ' fallback' : ''}`}
              >
                <p className={message.failed ? 'failed' : undefined}>{message.text}</p>
              </div>
            ))}
            {thinking && (
              <div className="bubble assistant">
                <IonSpinner name="dots" />
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}
      </IonContent>
      <IonFooter>
        <IonToolbar className="ion-padding-horizontal chat-toolbar">
          {suggestions.length > 0 && (
            <IonItem lines="none" className="suggested-select" detail={false}>
              <IonLabel position="stacked">Suggested questions</IonLabel>
              <IonSelect
                interface="action-sheet"
                placeholder="Choose a pre-built question"
                value={selectedSuggestion || undefined}
                disabled={thinking || loadingSession || !sessionId}
                aria-label="Suggested questions"
                onIonChange={(event) => onSuggestionChange(event.detail.value)}
              >
                {suggestions.map((item) => (
                  <IonSelectOption key={item.id} value={item.question}>
                    {item.question}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
          )}
          <form onSubmit={submit} className="chat-form">
            <IonInput
              value={question}
              placeholder="Or type your own question"
              aria-label="Ask a health question"
              disabled={loadingSession || !sessionId}
              onIonInput={(event) => setQuestion(event.detail.value ?? '')}
            />
            <IonButton
              type="submit"
              disabled={thinking || loadingSession || !sessionId || !question.trim()}
              aria-label="Send"
            >
              <IonIcon slot="icon-only" icon={send} />
            </IonButton>
          </form>
        </IonToolbar>
      </IonFooter>
    </IonPage>
  )
}
