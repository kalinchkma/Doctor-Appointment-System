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
import { send } from 'ionicons/icons'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor } from '../hooks/useAsync'
import { askChatbot, listSuggestedQuestions } from '../services/api/chat'
import type { ChatSource, ChatSuggestedQuestion } from '../types'

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

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([greeting])
  const [question, setQuestion] = useState('')
  const [thinking, setThinking] = useState(false)
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
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || thinking) return

      setMessages((current) => [
        ...current,
        { id: `q-${Date.now()}`, author: 'user', text: trimmed },
      ])
      setQuestion('')
      setSelectedSuggestion('')
      setThinking(true)

      try {
        const reply = await askChatbot(trimmed)
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
    [thinking],
  )

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
      <ScreenHeader title="Healthcare assistant" backTo="/home" />
      <IonContent className="ion-padding">
        <div className="chat-log">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`bubble ${message.author}${message.fallback ? ' fallback' : ''}`}
            >
              <p className={message.failed ? 'failed' : undefined}>{message.text}</p>
              {message.author === 'assistant' && (message.topScore ?? 0) > 0 && (
                <p className="chat-meta">
                  {(message.confidence ?? 0) > 0
                    ? `Confidence ${Math.round((message.confidence ?? 0) * 100)}%`
                    : null}
                  {(message.confidence ?? 0) > 0 ? ' · ' : null}
                  {`Similarity ${Math.round((message.topScore ?? 0) * 100)}%`}
                </p>
              )}
              {message.sources && message.sources.length > 0 && (
                <ul className="sources">
                  {message.sources.map((source, index) => (
                    <li key={`${message.id}-${index}`}>
                      {source.title}
                      {source.page ? `, page ${source.page}` : ''}
                      {typeof source.score === 'number' && source.score > 0
                        ? ` · ${Math.round(source.score * 100)}%`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {thinking && (
            <div className="bubble assistant">
              <IonSpinner name="dots" />
            </div>
          )}
          <div ref={bottom} />
        </div>
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
                disabled={thinking}
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
              onIonInput={(event) => setQuestion(event.detail.value ?? '')}
            />
            <IonButton type="submit" disabled={thinking || !question.trim()} aria-label="Send">
              <IonIcon slot="icon-only" icon={send} />
            </IonButton>
          </form>
        </IonToolbar>
      </IonFooter>
    </IonPage>
  )
}
