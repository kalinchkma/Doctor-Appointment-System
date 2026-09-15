import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  IonButton,
  IonChip,
  IonContent,
  IonFooter,
  IonIcon,
  IonInput,
  IonPage,
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
  const bottom = useRef<HTMLDivElement>(null)
  const onlyGreeting = messages.length === 1 && messages[0]?.id === 'greeting'

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

  const ask = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || thinking) return

    setMessages((current) => [...current, { id: `q-${Date.now()}`, author: 'user', text: trimmed }])
    setQuestion('')
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
  }, [thinking])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await ask(question)
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
              {message.sources && message.sources.length > 0 && (
                <ul className="sources">
                  {message.sources.map((source, index) => (
                    <li key={`${message.id}-${index}`}>
                      {source.title}
                      {source.page ? `, page ${source.page}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {onlyGreeting && suggestions.length > 0 && !thinking && (
            <div className="suggested-questions" aria-label="Suggested questions">
              <p className="suggested-label">Try a question</p>
              <div className="suggested-chips">
                {suggestions.map((item) => (
                  <IonChip
                    key={item.id}
                    outline
                    disabled={thinking}
                    onClick={() => void ask(item.question)}
                  >
                    {item.question}
                  </IonChip>
                ))}
              </div>
            </div>
          )}
          {thinking && (
            <div className="bubble assistant">
              <IonSpinner name="dots" />
            </div>
          )}
          <div ref={bottom} />
        </div>
      </IonContent>
      <IonFooter>
        <IonToolbar className="ion-padding-horizontal">
          <form onSubmit={submit} className="chat-form">
            <IonInput
              value={question}
              placeholder="Ask a health question"
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
