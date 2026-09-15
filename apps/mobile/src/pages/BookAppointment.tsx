import { useCallback, useState } from 'react'
import {
  IonButton,
  IonChip,
  IonContent,
  IonFooter,
  IonLoading,
  IonPage,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor, useAsync } from '../hooks/useAsync'
import { bookAppointment } from '../services/api/appointments'
import { getDoctor, listAvailableSlots } from '../services/api/doctors'
import { ApiError } from '../services/api/client'
import { formatTime, groupByDay } from '../lib/datetime'

export function BookAppointment() {
  const { doctorId = '' } = useParams()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [booking, setBooking] = useState(false)
  const [notice, setNotice] = useState('')

  const { data, loading, error, reload } = useAsync(
    useCallback(
      async () => ({
        doctor: await getDoctor(doctorId),
        slots: await listAvailableSlots(doctorId),
      }),
      [doctorId],
    ),
    [doctorId],
  )

  const confirm = async () => {
    if (!selected) return
    setBooking(true)
    try {
      const appointment = await bookAppointment(selected)
      navigate(`/appointments/${appointment.id}/confirmed`, { replace: true })
    } catch (reason) {
      // A conflict is expected under concurrency: another patient won the same slot
      // between this screen loading and the tap. Re-fetch so the list reflects reality.
      const conflicted =
        reason instanceof ApiError &&
        ['SLOT_UNAVAILABLE', 'SLOT_EXPIRED', 'SLOT_NOT_FOUND'].includes(reason.code)

      setNotice(messageFor(reason))
      if (conflicted) {
        setSelected(null)
        reload()
      }
    } finally {
      setBooking(false)
    }
  }

  const days = groupByDay(data?.slots ?? [])

  return (
    <IonPage>
      <ScreenHeader title="Choose a time" backTo={`/doctors/${doctorId}`} />
      <IonContent className="ion-padding">
        <AsyncContent
          loading={loading}
          error={error}
          empty={days.length === 0}
          emptyMessage="This doctor has no open times right now. Please check back later."
          onRetry={reload}
        >
          <p className="intro">
            Booking with <strong>{data?.doctor.name}</strong>
          </p>
          {days.map(([day, slots]) => (
            <section key={day} className="day-group">
              <h2>{day}</h2>
              <div className="slot-grid">
                {slots.map((slot) => (
                  <IonChip
                    key={slot.id}
                    outline={selected !== slot.id}
                    color={selected === slot.id ? 'primary' : 'medium'}
                    onClick={() => setSelected(slot.id)}
                  >
                    {formatTime(slot.startsAt)}
                  </IonChip>
                ))}
              </div>
            </section>
          ))}
        </AsyncContent>
      </IonContent>
      {days.length > 0 && (
        <IonFooter>
          <IonToolbar className="ion-padding-horizontal">
            <IonButton expand="block" disabled={!selected || booking} onClick={confirm}>
              {selected ? 'Confirm booking' : 'Select a time'}
            </IonButton>
          </IonToolbar>
        </IonFooter>
      )}
      <IonLoading isOpen={booking} message="Reserving your slot…" />
      <IonToast
        isOpen={Boolean(notice)}
        message={notice}
        duration={4000}
        color="warning"
        onDidDismiss={() => setNotice('')}
      />
    </IonPage>
  )
}
