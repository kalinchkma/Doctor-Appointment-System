import { useCallback, useMemo, useState } from 'react'
import {
  IonCard,
  IonCardContent,
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  type RefresherEventDetail,
} from '@ionic/react'
import { useNavigate } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAsync } from '../hooks/useAsync'
import { listDoctors } from '../services/api/doctors'

export function Doctors() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { data, loading, error, reload } = useAsync(useCallback(() => listDoctors(), []))

  // The list is small enough to filter on the device, which keeps search instant.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return data ?? []

    return (data ?? []).filter(
      (doctor) =>
        doctor.name.toLowerCase().includes(needle) ||
        doctor.specialization.toLowerCase().includes(needle),
    )
  }, [data, query])

  const refresh = (event: CustomEvent<RefresherEventDetail>) => {
    reload()
    event.detail.complete()
  }

  return (
    <IonPage>
      <ScreenHeader title="Doctors" backTo="/home" />
      <IonContent className="ion-padding">
        <IonRefresher slot="fixed" onIonRefresh={refresh}>
          <IonRefresherContent />
        </IonRefresher>
        <IonSearchbar
          value={query}
          placeholder="Search name or specialty"
          onIonInput={(event) => setQuery(event.detail.value ?? '')}
        />
        <AsyncContent
          loading={loading}
          error={error}
          empty={visible.length === 0}
          emptyMessage={
            query ? `No doctors match “${query}”.` : 'No doctors are available right now.'
          }
          onRetry={reload}
        >
          {visible.map((doctor) => (
            <IonCard button key={doctor.id} onClick={() => navigate(`/doctors/${doctor.id}`)}>
              <IonCardContent>
                <div className="doctor-row">
                  <DoctorAvatar doctor={doctor} />
                  <div>
                    <strong>{doctor.name}</strong>
                    <p>{doctor.specialization}</p>
                  </div>
                </div>
              </IonCardContent>
            </IonCard>
          ))}
        </AsyncContent>
      </IonContent>
    </IonPage>
  )
}
