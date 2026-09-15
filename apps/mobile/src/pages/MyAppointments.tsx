import { useCallback, useMemo, useState } from 'react'
import {
  IonAlert,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonLoading,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonToast,
  type RefresherEventDetail,
} from '@ionic/react'
import { AsyncContent } from '../components/AsyncContent'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor, useAsync } from '../hooks/useAsync'
import { cancelAppointment, listMyAppointments } from '../services/api/appointments'
import { formatDateTime } from '../lib/datetime'
import type { Appointment } from '../types'

type Filter = 'upcoming' | 'past'

const startsAt = (appointment: Appointment): string =>
  typeof appointment.slot === 'object' ? appointment.slot.startsAt : appointment.bookedAt

export function MyAppointments() {
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [pendingCancel, setPendingCancel] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')

  // The reference time is captured with the data rather than read during render, so the
  // upcoming/past split stays stable across re-renders and refreshes on every reload.
  const { data, loading, error, reload } = useAsync(
    useCallback(async () => ({ items: await listMyAppointments(), now: Date.now() }), []),
  )

  const now = data?.now ?? 0

  const visible = useMemo(() => {
    const items = data?.items ?? []

    return items
      .filter((appointment) => {
        const upcoming =
          new Date(startsAt(appointment)).getTime() > now && appointment.status === 'booked'
        return filter === 'upcoming' ? upcoming : !upcoming
      })
      .sort((a, b) => {
        const left = new Date(startsAt(a)).getTime()
        const right = new Date(startsAt(b)).getTime()
        return filter === 'upcoming' ? left - right : right - left
      })
  }, [data, filter, now])

  const refresh = (event: CustomEvent<RefresherEventDetail>) => {
    reload()
    event.detail.complete()
  }

  const confirmCancel = async () => {
    if (!pendingCancel) return
    setWorking(true)
    try {
      await cancelAppointment(pendingCancel)
      setNotice('Your appointment was cancelled and the time was released.')
      reload()
    } catch (reason) {
      setNotice(messageFor(reason))
    } finally {
      setWorking(false)
      setPendingCancel(null)
    }
  }

  return (
    <IonPage>
      <ScreenHeader title="My appointments" backTo="/home" />
      <IonContent className="ion-padding">
        <IonRefresher slot="fixed" onIonRefresh={refresh}>
          <IonRefresherContent />
        </IonRefresher>
        <IonSegment value={filter} onIonChange={(event) => setFilter(event.detail.value as Filter)}>
          <IonSegmentButton value="upcoming">Upcoming</IonSegmentButton>
          <IonSegmentButton value="past">Past</IonSegmentButton>
        </IonSegment>
        <AsyncContent
          loading={loading}
          error={error}
          empty={visible.length === 0}
          emptyMessage={
            filter === 'upcoming'
              ? 'You have no upcoming appointments.'
              : 'Nothing here yet. Past and cancelled appointments will show up on this tab.'
          }
          onRetry={reload}
        >
          {visible.map((appointment) => {
            const doctor = typeof appointment.doctor === 'object' ? appointment.doctor : null
            const cancellable =
              appointment.status === 'booked' && new Date(startsAt(appointment)).getTime() > now

            return (
              <IonCard key={appointment.id}>
                <IonCardContent>
                  <div className="appointment-head">
                    <strong>{doctor?.name ?? 'Your doctor'}</strong>
                    <IonBadge color={appointment.status === 'booked' ? 'primary' : 'medium'}>
                      {appointment.status}
                    </IonBadge>
                  </div>
                  {doctor && <p className="specialty">{doctor.specialization}</p>}
                  <p>{formatDateTime(startsAt(appointment))}</p>
                  {cancellable && (
                    <IonButton
                      fill="outline"
                      color="danger"
                      size="small"
                      onClick={() => setPendingCancel(appointment.id)}
                    >
                      Cancel appointment
                    </IonButton>
                  )}
                </IonCardContent>
              </IonCard>
            )
          })}
        </AsyncContent>
      </IonContent>
      <IonAlert
        isOpen={Boolean(pendingCancel)}
        header="Cancel this appointment?"
        message="The time will be released so another patient can book it."
        buttons={[
          { text: 'Keep it', role: 'cancel' },
          { text: 'Cancel appointment', role: 'destructive', handler: confirmCancel },
        ]}
        onDidDismiss={() => setPendingCancel(null)}
      />
      <IonLoading isOpen={working} message="Cancelling…" />
      <IonToast
        isOpen={Boolean(notice)}
        message={notice}
        duration={4000}
        onDidDismiss={() => setNotice('')}
      />
    </IonPage>
  )
}
