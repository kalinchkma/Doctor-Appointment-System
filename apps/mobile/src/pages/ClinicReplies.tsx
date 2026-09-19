import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IonBadge,
  IonCard,
  IonCardContent,
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  type RefresherEventDetail,
} from '@ionic/react'
import { useNavigate } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { ScreenHeader } from '../components/ScreenHeader'
import { ViewEnterReload } from '../components/ViewEnterReload'
import { messageFor } from '../hooks/useAsync'
import { formatDateTime } from '../lib/datetime'
import { listClinicReplies } from '../services/api/chat'
import type { ClinicReply } from '../types'

type Filter = 'waiting' | 'answered'

function isWaiting(item: ClinicReply): boolean {
  if (item.waitingOn) return item.waitingOn === 'staff'
  return !item.humanResponse
}

export function ClinicReplies() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('answered')
  const [items, setItems] = useState<ClinicReply[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const docs = await listClinicReplies()
      setItems(docs)
      setError(null)
    } catch (reason) {
      if (!silent) setError(messageFor(reason))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const tick = window.setInterval(() => {
      void load(true)
    }, 15_000)
    return () => window.clearInterval(tick)
  }, [load])

  const { waiting, answered } = useMemo(() => {
    const list = items ?? []
    return {
      waiting: list.filter(isWaiting),
      answered: list.filter((item) => !isWaiting(item)),
    }
  }, [items])

  const prevAnsweredCount = useRef(0)
  const didInitFilter = useRef(false)
  useEffect(() => {
    if (!items) return
    if (!didInitFilter.current) {
      didInitFilter.current = true
      setFilter(answered.length > 0 ? 'answered' : 'waiting')
    } else if (answered.length > prevAnsweredCount.current) {
      setFilter('answered')
    }
    prevAnsweredCount.current = answered.length
  }, [items, answered.length])

  const visible = filter === 'waiting' ? waiting : answered

  const refresh = (event: CustomEvent<RefresherEventDetail>) => {
    void load(true).finally(() => event.detail.complete())
  }

  return (
    <IonPage>
      <ViewEnterReload onEnter={() => void load(true)} />
      <ScreenHeader title="Clinic replies" />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={refresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="appointments-header">
          <IonSegment
            value={filter}
            onIonChange={(event) => setFilter(event.detail.value as Filter)}
            className="appointments-tabs"
          >
            <IonSegmentButton value="waiting">
              <div className="tab-content">
                <span>Waiting</span>
                {waiting.length > 0 && <IonBadge color="warning">{waiting.length}</IonBadge>}
              </div>
            </IonSegmentButton>
            <IonSegmentButton value="answered">
              <div className="tab-content">
                <span>Answered</span>
                {answered.length > 0 && <IonBadge color="success">{answered.length}</IonBadge>}
              </div>
            </IonSegmentButton>
          </IonSegment>
        </div>

        <div className="appointments-content">
          <p className="clinic-replies-intro">
            Questions the assistant could not answer. Clinic staff reply here — this is separate
            from the healthcare assistant.
          </p>
          <AsyncContent
            loading={loading}
            error={error}
            empty={visible.length === 0}
            emptyMessage={
              filter === 'waiting'
                ? 'No questions are waiting for a clinician.'
                : 'No clinic answers yet. Unanswered questions stay on the Waiting tab.'
            }
            onRetry={() => void load()}
          >
            {visible.map((item) => (
              <IonCard
                key={item.id}
                button
                className="appointment-card-v2 clinic-reply-card"
                onClick={() => navigate(`/clinic-replies/${item.id}`)}
              >
                <IonCardContent>
                  <div className="appointment-card-header">
                    <IonBadge color={isWaiting(item) ? 'warning' : 'success'} className="status-badge">
                      {isWaiting(item) ? 'Waiting' : 'Clinic replied'}
                    </IonBadge>
                    <span className="clinic-reply-date">
                      {item.updatedAt || item.resolvedAt || item.createdAt
                        ? formatDateTime(item.updatedAt || item.resolvedAt || item.createdAt)
                        : ''}
                    </span>
                  </div>
                  <p className="clinic-reply-question">{item.question}</p>
                  <p className="clinic-reply-pending">
                    {item.lastBody
                      ? `${item.lastRole === 'staff' ? 'Clinic' : 'You'}: ${item.lastBody}`
                      : 'Waiting for a clinic reply.'}
                  </p>
                </IonCardContent>
              </IonCard>
            ))}
          </AsyncContent>
        </div>
      </IonContent>
    </IonPage>
  )
}
