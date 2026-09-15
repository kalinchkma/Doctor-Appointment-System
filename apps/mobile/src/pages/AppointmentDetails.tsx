import { useCallback, useEffect, useState } from 'react'
import {
  IonAlert,
  IonBadge,
  IonButton,
  IonContent,
  IonLoading,
  IonPage,
  IonTextarea,
  IonToast,
} from '@ionic/react'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { DoctorMap } from '../components/DoctorMap'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor, useAsync } from '../hooks/useAsync'
import {
  cancelAppointment,
  getAppointment,
  updateAppointmentNote,
} from '../services/api/appointments'
import { canCancelAppointment } from '../lib/cancelPolicy'
import { formatDateTime } from '../lib/datetime'
import type { Appointment, Doctor } from '../types'

const NOTE_LIMIT = 500

function doctorFrom(appointment: Appointment | null): Doctor | null {
  return appointment && typeof appointment.doctor === 'object' ? appointment.doctor : null
}

function startsAt(appointment: Appointment): string {
  return typeof appointment.slot === 'object' ? appointment.slot.startsAt : appointment.bookedAt
}

export function AppointmentDetails() {
  const { appointmentId = '' } = useParams()
  const navigate = useNavigate()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [working, setWorking] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [draftNote, setDraftNote] = useState('')
  const [notice, setNotice] = useState('')

  const { data: appointment, loading, error, reload } = useAsync(
    useCallback(() => getAppointment(appointmentId), [appointmentId]),
    [appointmentId],
  )

  useEffect(() => {
    setDraftNote(appointment?.patientNote ?? '')
  }, [appointment?.id, appointment?.patientNote])

  const doctor = doctorFrom(appointment)
  const start = appointment ? startsAt(appointment) : ''
  const booked = appointment?.status === 'booked'
  const cancellable = Boolean(booked && start && canCancelAppointment(start))
  const cancelBlocked =
    Boolean(booked && start) && !canCancelAppointment(start) && new Date(start).getTime() > Date.now()
  const noteDirty = draftNote.trim() !== (appointment?.patientNote ?? '').trim()

  const onCancel = async () => {
    if (!appointment) return
    setWorking(true)
    try {
      await cancelAppointment(appointment.id)
      setNotice('Your appointment was cancelled. That time is available for others again.')
      reload()
    } catch (reason) {
      setNotice(messageFor(reason))
    } finally {
      setWorking(false)
      setConfirmCancel(false)
    }
  }

  const onSaveNote = async () => {
    if (!appointment) return
    setSavingNote(true)
    try {
      await updateAppointmentNote(appointment.id, draftNote.trim())
      setNotice('Your comment was saved.')
      reload()
    } catch (reason) {
      setNotice(messageFor(reason))
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <IonPage>
      <ScreenHeader title="Appointment" backTo="/appointments" />
      <IonContent className="ion-padding">
        <AsyncContent loading={loading} error={error} onRetry={reload}>
          {appointment && (
            <div className="appointment-detail">
              <section className="card-surface appointment-status-card">
                <div className="appointment-head">
                  <h1>Visit details</h1>
                  <IonBadge color={appointment.status === 'booked' ? 'primary' : 'medium'}>
                    {appointment.status}
                  </IonBadge>
                </div>
                <p className="appointment-when">{formatDateTime(start)}</p>
              </section>

              {doctor && (
                <section className="card-surface">
                  <div className="booking-doctor">
                    <DoctorAvatar doctor={doctor} />
                    <div>
                      <h2>{doctor.name}</h2>
                      <p className="specialty">{doctor.specialization}</p>
                      {doctor.qualifications && <p>{doctor.qualifications}</p>}
                    </div>
                  </div>
                  {doctor.bio && <p className="bio doctor-bio-snip">{doctor.bio}</p>}
                  <IonButton
                    expand="block"
                    fill="outline"
                    className="detail-secondary"
                    onClick={() => navigate(`/doctors/${doctor.id}`)}
                  >
                    View doctor profile
                  </IonButton>
                </section>
              )}

              <section className="card-surface notes-card">
                <h2>Notes</h2>
                {appointment.doctorComment && (
                  <div className="note-block doctor-note">
                    <span className="note-label">Message from the clinic</span>
                    <p>{appointment.doctorComment}</p>
                  </div>
                )}

                {booked ? (
                  <div className="note-editor detail-note-editor">
                    <span className="note-label">Your comment</span>
                    <IonTextarea
                      value={draftNote}
                      maxlength={NOTE_LIMIT}
                      autoGrow
                      rows={3}
                      placeholder="Add a special request or note for the clinic…"
                      onIonInput={(event) => setDraftNote(event.detail.value ?? '')}
                    />
                    <p className="char-count">
                      {draftNote.length}/{NOTE_LIMIT}
                    </p>
                    <IonButton
                      expand="block"
                      disabled={!noteDirty || savingNote}
                      onClick={onSaveNote}
                    >
                      {appointment.patientNote ? 'Update comment' : 'Save comment'}
                    </IonButton>
                  </div>
                ) : (
                  <div className="note-block">
                    <span className="note-label">Your comment</span>
                    <p>{appointment.patientNote?.trim() || 'No comment was left.'}</p>
                  </div>
                )}
              </section>

              {doctor && <DoctorMap doctor={doctor} />}

              {cancellable && (
                <IonButton
                  expand="block"
                  fill="outline"
                  color="danger"
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel appointment
                </IonButton>
              )}

              {cancelBlocked && (
                <p className="cancel-policy-msg">
                  Cancellations need to be made at least 1 hour before the appointment. Please
                  contact the clinic if you need help.
                </p>
              )}
            </div>
          )}
        </AsyncContent>
      </IonContent>
      <IonAlert
        isOpen={confirmCancel}
        header="Cancel this appointment?"
        message="The time will be released so another patient can book it."
        buttons={[
          { text: 'Keep it', role: 'cancel' },
          { text: 'Cancel appointment', role: 'destructive', handler: onCancel },
        ]}
        onDidDismiss={() => setConfirmCancel(false)}
      />
      <IonLoading isOpen={working || savingNote} message={working ? 'Cancelling…' : 'Saving…'} />
      <IonToast
        isOpen={Boolean(notice)}
        message={notice}
        duration={4500}
        onDidDismiss={() => setNotice('')}
      />
    </IonPage>
  )
}
