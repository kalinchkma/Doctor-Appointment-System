import { useCallback } from 'react'
import { IonButton, IonContent, IonPage } from '@ionic/react'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
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
            <>
              <section className="profile">
                <DoctorAvatar doctor={doctor} large />
                <h1>{doctor.name}</h1>
                <p className="specialty">{doctor.specialization}</p>
                {doctor.qualifications && <p>{doctor.qualifications}</p>}
              </section>
              {doctor.bio && (
                <section>
                  <h2>About</h2>
                  <p className="bio">{doctor.bio}</p>
                </section>
              )}
              <IonButton
                expand="block"
                className="submit"
                onClick={() => navigate(`/doctors/${doctor.id}/book`)}
              >
                See available times
              </IonButton>
            </>
          )}
        </AsyncContent>
      </IonContent>
    </IonPage>
  )
}
