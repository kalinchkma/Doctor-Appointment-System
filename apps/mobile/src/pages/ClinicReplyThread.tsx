import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonInput,
  IonPage,
  IonSpinner,
  IonToolbar,
} from '@ionic/react'
import { send } from 'ionicons/icons'
import { useLocation, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor } from '../hooks/useAsync'
import { getClinicReply, sendClinicReplyMessage } from '../services/api/chat'
import type { ClinicReply, ClinicThreadMessage } from '../types'

function threadIdFromPath(pathname: string, param?: string): string {
  if (param?.trim()) return param.trim()
  const match = pathname.match(/\/clinic-replies\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

export function ClinicReplyThread() {
  const { queryId: paramId } = useParams<{ queryId: string }>()
  const { pathname } = useLocation()
  const queryId = useMemo(() => threadIdFromPath(pathname, paramId), [pathname, paramId])
  const [thread, setThread] = useState<ClinicReply | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const load = useCallback(async (silent = false) => {
    if (!queryId) {
      if (!silent) {
        setError('That conversation could not be opened.')
        setLoading(false)
      }
      return
    }
    if (!silent) setLoading(true)
    try {
      const next = await getClinicReply(queryId)
      setThread(next)
      setError(null)
    } catch (reason) {
      if (!silent) setError(messageFor(reason))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [queryId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!queryId) return undefined
    const tick = window.setInterval(() => {
      void load(true)
    }, 8000)
    return () => window.clearInterval(tick)
  }, [queryId, load])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.messages?.length, sending])

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const content = draft.trim()
    if (!content || !queryId || sending) return
    setSending(true)
    setSendError(null)
    try {
      const next = await sendClinicReplyMessage(queryId, content)
      setThread(next)
      setDraft('')
    } catch (reason) {
      setSendError(messageFor(reason))
    } finally {
      setSending(false)
    }
  }

  const messages: ClinicThreadMessage[] = thread?.messages ?? []

  return (
    <IonPage>
      <ScreenHeader title="Clinic conversation" backTo="/clinic-replies" />
      <IonContent className="ion-padding">
        {loading ? (
          <div className="state-block">
            <IonSpinner />
            <p>Loading conversation…</p>
          </div>
        ) : error && !thread ? (
          <div className="state-block">
            <p className="failed">{error}</p>
            <IonButton fill="outline" onClick={() => void load()}>
              Retry
            </IonButton>
          </div>
        ) : (
          <div className="chat-log">
            {thread?.question && (
              <p className="clinic-replies-intro">About: {thread.question}</p>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.createdAt}-${index}`}
                className={`bubble ${message.role === 'patient' ? 'user' : 'assistant staff'}`}
              >
                {message.role === 'staff' && <p className="staff-label">Clinic</p>}
                <p>{message.body}</p>
              </div>
            ))}
            {sending && (
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
          {sendError && <p className="failed clinic-send-error">{sendError}</p>}
          <form onSubmit={(event) => void submit(event)} className="chat-form">
            <IonInput
              value={draft}
              placeholder="Reply to the clinic"
              aria-label="Reply to the clinic"
              disabled={loading || !queryId}
              onIonInput={(event) => setDraft(event.detail.value ?? '')}
            />
            <IonButton
              type="submit"
              disabled={sending || loading || !queryId || !draft.trim()}
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
