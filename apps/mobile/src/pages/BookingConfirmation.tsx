import { useCallback } from 'react'
import { IonButton, IonContent, IonIcon, IonPage } from '@ionic/react'
import { 
  checkmarkCircle, 
  calendar, 
  person, 
  location, 
  chatbubble,
  home,
  list
} from 'ionicons/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { ScreenHeader } from '../components/ScreenHeader'
import { ViewEnterReload } from '../components/ViewEnterReload'
import { useAsync } from '../hooks/useAsync'
import { getAppointment } from '../services/api/appointments'
import { formatDateTime } from '../lib/datetime'

export function BookingConfirmation() {
  const { appointmentId = '' } = useParams()
  const navigate = useNavigate()
  const {
    data: appointment,
    loading,
    error,
    reload,
  } = useAsync(
    useCallback(() => getAppointment(appointmentId), [appointmentId]),
    [appointmentId],
  )

  const doctor = typeof appointment?.doctor === 'object' ? appointment.doctor : null
  const slot = typeof appointment?.slot === 'object' ? appointment.slot : null

  return (
    <IonPage>
      <ViewEnterReload onEnter={reload} />
      <ScreenHeader title="Booking Confirmed" backTo="/home" />
      <IonContent>
        <AsyncContent loading={loading} error={error} onRetry={reload}>
          <div className="confirmation-v2">
            <div className="success-animation">
              <IonIcon icon={checkmarkCircle} color="success" className="success-icon" />
            </div>
            
            <div className="success-content">
              <h1>Appointment Confirmed!</h1>
              <p className="success-message">
                Your appointment has been successfully booked. You'll receive a confirmation message shortly.
              </p>
            </div>

            <div className="confirmation-card-v2">
              {doctor && (
                <div className="doctor-section">
                  <DoctorAvatar doctor={doctor} />
                  <div className="doctor-info">
                    <h3>{doctor.name}</h3>
                    <p className="specialty">{doctor.specialization}</p>
                  </div>
                </div>
              )}

              <div className="appointment-info">
                {slot && (
                  <div className="info-row highlight">
                    <div className="info-icon-wrapper primary">
                      <IonIcon icon={calendar} />
                    </div>
                    <div className="info-content">
                      <span className="info-label">Date & Time</span>
                      <span className="info-value">{formatDateTime(slot.startsAt)}</span>
                    </div>
                  </div>
                )}

                <div className="info-row">
                  <div className="info-icon-wrapper">
                    <IonIcon icon={person} />
                  </div>
                  <div className="info-content">
                    <span className="info-label">Patient</span>
                    <span className="info-value">{appointment?.contactName}</span>
                  </div>
                </div>

                {doctor?.address && (
                  <div className="info-row">
                    <div className="info-icon-wrapper">
                      <IonIcon icon={location} />
                    </div>
                    <div className="info-content">
                      <span className="info-label">Location</span>
                      <span className="info-value">{doctor.address}</span>
                    </div>
                  </div>
                )}

                {appointment?.patientNote && (
                  <div className="info-row">
                    <div className="info-icon-wrapper">
                      <IonIcon icon={chatbubble} />
                    </div>
                    <div className="info-content">
                      <span className="info-label">Your Note</span>
                      <span className="info-value note">"{appointment.patientNote}"</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="next-steps">
              <h3>What's Next?</h3>
              <ul className="steps-list">
                <li>Check your email for appointment details</li>
                <li>Arrive 15 minutes early for check-in</li>
                <li>Bring valid ID and insurance cards</li>
                <li>You can cancel up to 1 hour before your appointment</li>
              </ul>
            </div>

            <div className="action-buttons">
              <IonButton
                expand="block"
                onClick={() => navigate(`/appointments/${appointmentId}`, { replace: true })}
                className="primary-action"
              >
                View Full Details
              </IonButton>
              
              <div className="secondary-actions">
                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={() => navigate('/appointments', { replace: true })}
                >
                  <IonIcon icon={list} slot="start" />
                  My Appointments
                </IonButton>
                
                <IonButton
                  expand="block"
                  fill="clear"
                  onClick={() => navigate('/home', { replace: true })}
                >
                  <IonIcon icon={home} slot="start" />
                  Back to Home
                </IonButton>
              </div>
            </div>
          </div>
        </AsyncContent>
      </IonContent>
    </IonPage>
  )
}