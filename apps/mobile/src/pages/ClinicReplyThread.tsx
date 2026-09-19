import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IonButton, IonContent, IonPage, IonSpinner } from '@ionic/react'
import { useLocation, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { ViewEnterReload } from '../components/ViewEnterReload'
import { messageFor } from '../hooks/useAsync'
import { getClinicReply } from '../services/api/chat'
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
  }, [thread?.messages?.length])

  const messages: ClinicThreadMessage[] = thread?.messages ?? []
  const waiting = !thread?.humanResponse

  return (
    <IonPage>
      <ViewEnterReload onEnter={() => void load(true)} />
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
            {waiting && (
              <p className="clinic-replies-intro">
                Waiting for a clinic reply. Only clinic staff can answer this question.
              </p>
            )}
            <div ref={bottom} />
          </div>
        )}
      </IonContent>
    </IonPage>
  )
}
