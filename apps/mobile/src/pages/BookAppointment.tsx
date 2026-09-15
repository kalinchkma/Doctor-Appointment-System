import { useCallback, useMemo, useState } from 'react'
import {
  IonButton,
  IonContent,
  IonFooter,
  IonLoading,
  IonPage,
  IonTextarea,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { DoctorMap } from '../components/DoctorMap'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor, useAsync } from '../hooks/useAsync'
import { bookAppointment } from '../services/api/appointments'
import { getDoctor, listDoctorSlots } from '../services/api/doctors'
import { ApiError } from '../services/api/client'
import { formatDay, formatTime, groupByDay } from '../lib/datetime'
import type { AppointmentSlot } from '../types'

const NOTE_LIMIT = 500

export function BookAppointment() {
  const { doctorId = '' } = useParams()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [patientNote, setPatientNote] = useState('')
  const [booking, setBooking] = useState(false)
  const [notice, setNotice] = useState('')

  const { data, loading, error, reload } = useAsync(
    useCallback(
      async () => ({
        doctor: await getDoctor(doctorId),
        slots: await listDoctorSlots(doctorId),
      }),
      [doctorId],
    ),
    [doctorId],
  )

  const confirm = async () => {
    if (!selected) return
    setBooking(true)
    try {
      const appointment = await bookAppointment(selected, patientNote)
      navigate(`/appointments/${appointment.id}/confirmed`, { replace: true })
    } catch (reason) {
      const conflicted =
        reason instanceof ApiError &&
        [
          'SLOT_UNAVAILABLE',
          'SLOT_EXPIRED',
          'SLOT_NOT_FOUND',
          'SLOT_DUPLICATE',
          'BOOKING_LIMIT',
          'ALREADY_BOOKED_WITH_DOCTOR',
        ].includes(reason.code)

      setNotice(messageFor(reason))
      if (conflicted) {
        setSelected(null)
        reload()
      }
    } finally {
      setBooking(false)
    }
  }

  const onSlotClick = (slot: AppointmentSlot) => {
    if (slot.status !== 'available') {
      setNotice('That time is already booked. Please choose an available slot.')
      return
    }
    setSelected(slot.id)
  }

  const days = groupByDay(data?.slots ?? [])
  const hasOpenSlot = (data?.slots ?? []).some((slot) => slot.status === 'available')
  const selectedSlot = useMemo(
    () => (data?.slots ?? []).find((slot) => slot.id === selected) ?? null,
    [data?.slots, selected],
  )

  return (
    <IonPage>
      <ScreenHeader title="Book appointment" backTo={`/doctors/${doctorId}`} />
      <IonContent className="ion-padding">
        <AsyncContent
          loading={loading}
          error={error}
          empty={days.length === 0}
          emptyMessage="This doctor has no upcoming times right now. Please check back later."
          onRetry={reload}
        >
          {data?.doctor && (
            <div className="booking-doctor card-surface">
              <DoctorAvatar doctor={data.doctor} />
              <div>
                <h1>{data.doctor.name}</h1>
                <p className="specialty">{data.doctor.specialization}</p>
              </div>
            </div>
          )}

          <p className="booking-hint">
            Choose one available time. You can keep up to 2 upcoming appointments, and only one
            with the same doctor.
          </p>

          <p className="slot-legend">
            <span className="legend available">Available</span>
            <span className="legend booked">Booked</span>
            <span className="legend selected">Selected</span>
          </p>

          {days.map(([day, slots]) => (
            <section key={day} className="day-group">
              <h2>{day}</h2>
              <div className="slot-grid">
                {slots.map((slot) => {
                  const booked = slot.status === 'booked'
                  const isSelected = selected === slot.id
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={[
                        'slot-pill',
                        booked ? 'booked' : '',
                        isSelected ? 'selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={booked}
                      onClick={() => onSlotClick(slot)}
                    >
                      {formatTime(slot.startsAt)}
                      {booked ? ' · taken' : ''}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}

          <section className="card-surface note-editor">
            <h2>Special request</h2>
            <p className="booking-hint">
              Optional — tell the clinic about symptoms, accessibility needs, or anything they
              should know before your visit.
            </p>
            <IonTextarea
              value={patientNote}
              maxlength={NOTE_LIMIT}
              autoGrow
              rows={3}
              placeholder="e.g. Prefer a ground-floor room, bringing my child, …"
              onIonInput={(event) => setPatientNote(event.detail.value ?? '')}
            />
            <p className="char-count">
              {patientNote.length}/{NOTE_LIMIT}
            </p>
          </section>

          {data?.doctor && <DoctorMap doctor={data.doctor} compact />}
        </AsyncContent>
      </IonContent>
      {days.length > 0 && (
        <IonFooter>
          <IonToolbar className="booking-footer">
            <div className="booking-summary">
              {selectedSlot ? (
                <>
                  <span className="summary-label">Selected</span>
                  <strong>
                    {formatDay(selectedSlot.startsAt)} · {formatTime(selectedSlot.startsAt)}
                  </strong>
                </>
              ) : (
                <span className="summary-label">Pick a green time above</span>
              )}
            </div>
            <IonButton
              expand="block"
              disabled={!selected || booking || !hasOpenSlot}
              onClick={confirm}
            >
              {selected ? 'Confirm booking' : 'Select a time'}
            </IonButton>
          </IonToolbar>
        </IonFooter>
      )}
      <IonLoading isOpen={booking} message="Reserving your slot…" />
      <IonToast
        isOpen={Boolean(notice)}
        message={notice}
        duration={4500}
        color="warning"
        onDidDismiss={() => setNotice('')}
      />
    </IonPage>
  )
}
