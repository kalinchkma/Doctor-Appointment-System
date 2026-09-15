import { useCallback } from 'react'
import { IonButton, IonContent, IonIcon, IonPage } from '@ionic/react'
import { checkmarkCircle } from 'ionicons/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { ScreenHeader } from '../components/ScreenHeader'
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
      <ScreenHeader title="Booking confirmed" backTo="/home" />
      <IonContent className="ion-padding">
        <AsyncContent loading={loading} error={error} onRetry={reload}>
          <div className="confirmation">
            <IonIcon icon={checkmarkCircle} color="primary" className="confirmation-icon" />
            <h1>You are booked</h1>
            {doctor && <p className="specialty">{doctor.name}</p>}
            {slot && <p className="confirmation-time">{formatDateTime(slot.startsAt)}</p>}
            <p className="intro">
              We have reserved this time for you. You can cancel from My appointments if your plans
              change.
            </p>
          </div>
          <IonButton
            expand="block"
            className="submit"
            onClick={() => navigate('/appointments', { replace: true })}
          >
            View my appointments
          </IonButton>
          <IonButton
            expand="block"
            fill="clear"
            onClick={() => navigate('/home', { replace: true })}
          >
            Back to home
          </IonButton>
        </AsyncContent>
      </IonContent>
    </IonPage>
  )
}
