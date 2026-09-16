import { useCallback, useMemo, useState } from 'react'
import {
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonLoading,
  IonPage,
  IonProgressBar,
  IonTextarea,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { arrowBack, arrowForward, checkmarkCircle, time, person, clipboard } from 'ionicons/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { messageFor, useAsync } from '../hooks/useAsync'
import { useAuth } from '../hooks/useAuth'
import { bookAppointment } from '../services/api/appointments'
import { getDoctor, listDoctorSlots } from '../services/api/doctors'
import { ApiError } from '../services/api/client'
import { formatDay, formatTime, groupByDay } from '../lib/datetime'
import type { AppointmentSlot } from '../types'

const NOTE_LIMIT = 500
const STEPS = ['Select Time', 'Contact Info', 'Add Notes', 'Confirm'] as const
type Step = 0 | 1 | 2 | 3

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && /^[\d+\-\s().]+$/.test(value.trim())
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function BookAppointment() {
  const { doctorId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [currentStep, setCurrentStep] = useState<Step>(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [contactName, setContactName] = useState(user?.name ?? '')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState(user?.email ?? '')
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

  const contactReady =
    contactName.trim().length > 0 &&
    looksLikePhone(contactPhone) &&
    looksLikeEmail(contactEmail)

  const selectedSlot = useMemo(
    () => (data?.slots ?? []).find((slot) => slot.id === selected) ?? null,
    [data?.slots, selected],
  )

  const days = groupByDay(data?.slots ?? [])
  const hasOpenSlot = (data?.slots ?? []).some((slot) => slot.status === 'available')

  const canProceed = () => {
    switch (currentStep) {
      case 0: return selected !== null
      case 1: return contactReady
      case 2: return true // Notes are optional
      case 3: return true
      default: return false
    }
  }

  const nextStep = () => {
    if (currentStep < 3 && canProceed()) {
      setCurrentStep((prev) => (prev + 1) as Step)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => (prev - 1) as Step)
    }
  }

  const confirm = async () => {
    if (!selected || !contactReady) return
    
    setBooking(true)
    try {
      const appointment = await bookAppointment(
        selected,
        {
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim(),
        },
        patientNote,
      )
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
        setCurrentStep(0)
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

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="step-content">
            <div className="step-header">
              <IonIcon icon={time} className="step-icon" />
              <h2>Choose your preferred time</h2>
              <p className="step-description">
                Select any available time slot. You can keep up to 2 upcoming appointments.
              </p>
            </div>

            <div className="slot-legend">
              <span className="legend available">Available</span>
              <span className="legend booked">Booked</span>
              <span className="legend selected">Selected</span>
            </div>

            <div className="slots-container">
              {days.map(([day, slots]) => (
                <div key={day} className="day-section">
                  <h3 className="day-header">{day}</h3>
                  <div className="slot-grid">
                    {slots.map((slot) => {
                      const booked = slot.status === 'booked'
                      const isSelected = selected === slot.id
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          className={[
                            'slot-pill-v2',
                            booked ? 'booked' : 'available',
                            isSelected ? 'selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          disabled={booked}
                          onClick={() => onSlotClick(slot)}
                        >
                          <span className="slot-time">{formatTime(slot.startsAt)}</span>
                          {booked && <span className="slot-status">Taken</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selectedSlot && (
              <div className="selection-summary">
                <IonIcon icon={checkmarkCircle} color="success" />
                <div>
                  <div className="summary-time">
                    {formatDay(selectedSlot.startsAt)} at {formatTime(selectedSlot.startsAt)}
                  </div>
                  <div className="summary-doctor">{data?.doctor?.name}</div>
                </div>
              </div>
            )}
          </div>
        )

      case 1:
        return (
          <div className="step-content">
            <div className="step-header">
              <IonIcon icon={person} className="step-icon" />
              <h2>Contact information</h2>
              <p className="step-description">
                The clinic needs these details to confirm your appointment and send reminders.
              </p>
            </div>

            <IonList className="contact-form">
              <IonItem>
                <IonInput
                  fill="outline"
                  label="Full name"
                  labelPlacement="stacked"
                  autocomplete="name"
                  required
                  value={contactName}
                  onIonInput={(event) => setContactName(event.detail.value ?? '')}
                  className={contactName.trim() ? 'valid' : ''}
                />
              </IonItem>
              
              <IonItem>
                <IonInput
                  fill="outline"
                  label="Phone number"
                  labelPlacement="stacked"
                  type="tel"
                  autocomplete="tel"
                  inputmode="tel"
                  required
                  value={contactPhone}
                  placeholder="+880 1712 345678"
                  onIonInput={(event) => setContactPhone(event.detail.value ?? '')}
                  className={looksLikePhone(contactPhone) ? 'valid' : ''}
                />
              </IonItem>
              
              <IonItem>
                <IonInput
                  fill="outline"
                  label="Email address"
                  labelPlacement="stacked"
                  type="email"
                  autocomplete="email"
                  required
                  value={contactEmail}
                  onIonInput={(event) => setContactEmail(event.detail.value ?? '')}
                  className={looksLikeEmail(contactEmail) ? 'valid' : ''}
                />
              </IonItem>
            </IonList>

            {selectedSlot && (
              <div className="appointment-summary">
                <h3>Appointment details</h3>
                <div className="summary-row">
                  <span>Time:</span>
                  <span>{formatDay(selectedSlot.startsAt)} at {formatTime(selectedSlot.startsAt)}</span>
                </div>
                <div className="summary-row">
                  <span>Doctor:</span>
                  <span>{data?.doctor?.name}</span>
                </div>
              </div>
            )}
          </div>
        )

      case 2:
        return (
          <div className="step-content">
            <div className="step-header">
              <IonIcon icon={clipboard} className="step-icon" />
              <h2>Special requests (Optional)</h2>
              <p className="step-description">
                Let the clinic know about any symptoms, accessibility needs, or special requirements.
              </p>
            </div>

            <div className="note-editor-v2">
              <IonTextarea
                fill="outline"
                label="Your message to the clinic"
                labelPlacement="stacked"
                value={patientNote}
                maxlength={NOTE_LIMIT}
                autoGrow
                rows={4}
                placeholder="e.g., I need wheelchair access, bringing my child, experiencing chest pain..."
                onIonInput={(event) => setPatientNote(event.detail.value ?? '')}
              />
              <p className="char-count">
                {patientNote.length}/{NOTE_LIMIT} characters
              </p>
            </div>

            {selectedSlot && (
              <div className="appointment-summary">
                <h3>Appointment details</h3>
                <div className="summary-row">
                  <span>Time:</span>
                  <span>{formatDay(selectedSlot.startsAt)} at {formatTime(selectedSlot.startsAt)}</span>
                </div>
                <div className="summary-row">
                  <span>Doctor:</span>
                  <span>{data?.doctor?.name}</span>
                </div>
                <div className="summary-row">
                  <span>Contact:</span>
                  <span>{contactName} • {contactPhone}</span>
                </div>
              </div>
            )}
          </div>
        )

      case 3:
        return (
          <div className="step-content">
            <div className="step-header">
              <IonIcon icon={checkmarkCircle} className="step-icon" color="success" />
              <h2>Confirm your appointment</h2>
              <p className="step-description">
                Please review all details before confirming your booking.
              </p>
            </div>

            <div className="confirmation-card">
              <div className="confirmation-header">
                <h3>Appointment Summary</h3>
              </div>
              
              {selectedSlot && (
                <div className="confirmation-details">
                  <div className="detail-group">
                    <span className="detail-label">Date & Time</span>
                    <span className="detail-value highlight">
                      {formatDay(selectedSlot.startsAt)} at {formatTime(selectedSlot.startsAt)}
                    </span>
                  </div>
                  
                  <div className="detail-group">
                    <span className="detail-label">Doctor</span>
                    <span className="detail-value">{data?.doctor?.name}</span>
                  </div>
                  
                  <div className="detail-group">
                    <span className="detail-label">Specialization</span>
                    <span className="detail-value">{data?.doctor?.specialization}</span>
                  </div>
                  
                  <div className="detail-group">
                    <span className="detail-label">Contact Name</span>
                    <span className="detail-value">{contactName}</span>
                  </div>
                  
                  <div className="detail-group">
                    <span className="detail-label">Phone</span>
                    <span className="detail-value">{contactPhone}</span>
                  </div>
                  
                  <div className="detail-group">
                    <span className="detail-label">Email</span>
                    <span className="detail-value">{contactEmail}</span>
                  </div>
                  
                  {patientNote.trim() && (
                    <div className="detail-group">
                      <span className="detail-label">Special Request</span>
                      <span className="detail-value note-preview">"{patientNote.trim()}"</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="policy-notice">
              <p>
                <strong>Cancellation Policy:</strong> You can cancel up to 1 hour before your appointment. 
                After booking, you'll receive confirmation details and clinic location.
              </p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const getStepProgress = () => ((currentStep + 1) / STEPS.length) * 100

  const getButtonText = () => {
    switch (currentStep) {
      case 0: return selected ? 'Continue to Contact Info' : 'Select a Time First'
      case 1: return contactReady ? 'Continue to Notes' : 'Complete Contact Info'
      case 2: return 'Review Appointment'
      case 3: return 'Confirm Booking'
      default: return 'Continue'
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButton
            fill="clear"
            slot="start"
            onClick={() => (currentStep === 0 ? navigate(`/doctors/${doctorId}`) : prevStep())}
          >
            <IonIcon icon={arrowBack} />
          </IonButton>
          <IonTitle>Book Appointment</IonTitle>
        </IonToolbar>
        <IonProgressBar value={getStepProgress() / 100} />
      </IonHeader>

      <IonContent>
        <AsyncContent
          loading={loading}
          error={error}
          empty={days.length === 0}
          emptyMessage="This doctor has no available times right now. Please check back later."
          onRetry={reload}
        >
          {data?.doctor && (
            <div className="booking-header">
              <div className="doctor-card-mini">
                <DoctorAvatar doctor={data.doctor} />
                <div>
                  <h1>{data.doctor.name}</h1>
                  <p className="specialty">{data.doctor.specialization}</p>
                </div>
              </div>
              <div className="step-indicator">
                Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep]}
              </div>
            </div>
          )}

          {renderStepContent()}
        </AsyncContent>
      </IonContent>

      {days.length > 0 && (
        <IonFooter className="booking-footer-v2">
          <IonToolbar>
            <div className="footer-content">
              {currentStep > 0 && (
                <IonButton
                  fill="outline"
                  onClick={prevStep}
                  className="back-button"
                >
                  Back
                </IonButton>
              )}
              
              <IonButton
                expand="block"
                disabled={!canProceed() || booking || !hasOpenSlot}
                onClick={currentStep === 3 ? confirm : nextStep}
                className="primary-button"
              >
                {currentStep === 3 ? (
                  <>
                    <IonIcon icon={checkmarkCircle} slot="start" />
                    {getButtonText()}
                  </>
                ) : (
                  <>
                    {getButtonText()}
                    <IonIcon icon={arrowForward} slot="end" />
                  </>
                )}
              </IonButton>
            </div>
          </IonToolbar>
        </IonFooter>
      )}

      <IonLoading isOpen={booking} message="Confirming your appointment..." />
      <IonToast
        isOpen={Boolean(notice)}
        message={notice}
        duration={4500}
        onDidDismiss={() => setNotice('')}
      />
    </IonPage>
  )
}