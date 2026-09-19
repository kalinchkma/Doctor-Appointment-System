import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { AsyncContent } from '../components/AsyncContent'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor } from '../hooks/useAsync'
import { formatDateTime } from '../lib/datetime'
import { listClinicReplies } from '../services/api/chat'
import type { ClinicReply } from '../types'

type Filter = 'waiting' | 'answered'

export function ClinicReplies() {
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
      waiting: list.filter((item) => item.status === 'new'),
      answered: list.filter((item) => item.status === 'resolved' && Boolean(item.humanResponse)),
    }
  }, [items])

  useEffect(() => {
    if (!items) return
    if (answered.length === 0 && waiting.length > 0) setFilter('waiting')
  }, [items, answered.length, waiting.length])

  const visible = filter === 'waiting' ? waiting : answered

  const refresh = (event: CustomEvent<RefresherEventDetail>) => {
    void load(true).finally(() => event.detail.complete())
  }

  return (
    <IonPage>
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
            When the assistant cannot answer from clinic documents, the question lands here. A
            clinician replies on this tab — not in the healthcare chat.
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
              <ReplyCard key={item.id} item={item} />
            ))}
          </AsyncContent>
        </div>
      </IonContent>
    </IonPage>
  )
}

function ReplyCard({ item }: { item: ClinicReply }) {
  const answered = item.status === 'resolved' && item.humanResponse

  return (
    <IonCard className="appointment-card-v2 clinic-reply-card">
      <IonCardContent>
        <div className="appointment-card-header">
          <IonBadge color={answered ? 'success' : 'warning'} className="status-badge">
            {answered ? 'Answered' : 'Waiting'}
          </IonBadge>
          <span className="clinic-reply-date">
            {answered && item.resolvedAt
              ? formatDateTime(item.resolvedAt)
              : item.createdAt
                ? formatDateTime(item.createdAt)
                : ''}
          </span>
        </div>
        <p className="clinic-reply-question">{item.question}</p>
        {answered ? (
          <div className="clinic-reply-answer">
            <p className="staff-label">Clinic reply</p>
            <p>{item.humanResponse}</p>
          </div>
        ) : (
          <p className="clinic-reply-pending">Submitted for a clinician to review.</p>
        )}
      </IonCardContent>
    </IonCard>
  )
}
