import { useCallback } from 'react'
import { IonButton, IonContent, IonPage } from '@ionic/react'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { DoctorMap } from '../components/DoctorMap'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAsync } from '../hooks/useAsync'
import { getDoctor } from '../services/api/doctors'

export function DoctorDetails() {
  const { doctorId = '' } = useParams()
  const navigate = useNavigate()
  const {
    data: doctor,
    loading,
    error,
    reload,
  } = useAsync(
    useCallback(() => getDoctor(doctorId), [doctorId]),
    [doctorId],
  )

  return (
    <IonPage>
      <ScreenHeader title="Doctor details" backTo="/doctors" />
      <IonContent className="ion-padding">
        <AsyncContent loading={loading} error={error} onRetry={reload}>
          {doctor && (
            <div className="doctor-detail">
              <section className="profile card-surface">
                <DoctorAvatar doctor={doctor} large />
                <h1>{doctor.name}</h1>
                <p className="specialty">{doctor.specialization}</p>
                {doctor.qualifications && <p>{doctor.qualifications}</p>}
              </section>
              {doctor.bio && (
                <section className="card-surface">
                  <h2>About</h2>
                  <p className="bio">{doctor.bio}</p>
                </section>
              )}
              <DoctorMap doctor={doctor} />
              <IonButton
                expand="block"
                className="submit"
                onClick={() => navigate(`/doctors/${doctor.id}/book`)}
              >
                Book an appointment
              </IonButton>
            </div>
          )}
        </AsyncContent>
      </IonContent>
    </IonPage>
  )
}
