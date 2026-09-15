import { useCallback, useMemo, useState } from 'react'
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
import { useAsync } from '../hooks/useAsync'
import { listMyAppointments } from '../services/api/appointments'
import { formatDateTime } from '../lib/datetime'
import type { Appointment } from '../types'

type Filter = 'upcoming' | 'past'

const startsAt = (appointment: Appointment): string =>
  typeof appointment.slot === 'object' ? appointment.slot.startsAt : appointment.bookedAt

export function MyAppointments() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('upcoming')

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

            return (
              <IonCard
                button
                key={appointment.id}
                onClick={() => navigate(`/appointments/${appointment.id}`)}
              >
                <IonCardContent>
                  <div className="appointment-head">
                    <strong>{doctor?.name ?? 'Your doctor'}</strong>
                    <IonBadge color={appointment.status === 'booked' ? 'primary' : 'medium'}>
                      {appointment.status}
                    </IonBadge>
                  </div>
                  {doctor && <p className="specialty">{doctor.specialization}</p>}
                  <p>{formatDateTime(startsAt(appointment))}</p>
                  {doctor?.address && <p className="doctor-list-address">{doctor.address}</p>}
                  {appointment.doctorComment && (
                    <p className="list-note">Clinic message available</p>
                  )}
                  <p className="open-details">View details →</p>
                </IonCardContent>
              </IonCard>
            )
          })}
        </AsyncContent>
      </IonContent>
    </IonPage>
  )
}
