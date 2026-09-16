import { useCallback, useMemo, useState } from 'react'
import {
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  type RefresherEventDetail,
} from '@ionic/react'
import { location, star } from 'ionicons/icons'
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
        doctor.specialization.toLowerCase().includes(needle) ||
        (doctor.address ?? '').toLowerCase().includes(needle),
    )
  }, [data, query])

  const refresh = (event: CustomEvent<RefresherEventDetail>) => {
    reload()
    event.detail.complete()
  }

  const getRandomRating = () => {
    // Mock rating for demo purposes
    return (4.2 + Math.random() * 0.7).toFixed(1)
  }

  const getRandomReviews = () => {
    // Mock review count for demo purposes
    return Math.floor(15 + Math.random() * 200)
  }

  return (
    <IonPage>
      <ScreenHeader title="Find a Doctor" backTo="/home" />
      <IonContent>
        <div className="doctors-header">
          <IonSearchbar
            value={query}
            placeholder="Search by name, specialty, or location"
            onIonInput={(event) => setQuery(event.detail.value ?? '')}
            className="doctors-search"
          />
          {data && (
            <p className="results-count">
              {visible.length} doctor{visible.length !== 1 ? 's' : ''} available
            </p>
          )}
        </div>

        <IonRefresher slot="fixed" onIonRefresh={refresh}>
          <IonRefresherContent />
        </IonRefresher>
        
        <div className="doctors-list">
          <AsyncContent
            loading={loading}
            error={error}
            empty={visible.length === 0}
            emptyMessage={
              query ? `No doctors match "${query}".` : 'No doctors are available right now.'
            }
            onRetry={reload}
          >
            {visible.map((doctor) => (
              <IonCard 
                key={doctor.id} 
                button 
                className="doctor-card-v2"
                onClick={() => navigate(`/doctors/${doctor.id}`)}
              >
                <IonCardContent>
                  <div className="doctor-card-content">
                    <DoctorAvatar doctor={doctor} />
                    
                    <div className="doctor-details">
                      <h3 className="doctor-name">{doctor.name}</h3>
                      <p className="doctor-specialty">{doctor.specialization}</p>
                      
                      {doctor.qualifications && (
                        <p className="doctor-qualifications">{doctor.qualifications}</p>
                      )}
                      
                      <div className="doctor-rating">
                        <div className="rating-display">
                          <IonIcon icon={star} className="star-icon" />
                          <span className="rating-value">{getRandomRating()}</span>
                          <span className="rating-count">({getRandomReviews()} reviews)</span>
                        </div>
                      </div>
                      
                      {doctor.address && (
                        <div className="doctor-location">
                          <IonIcon icon={location} className="location-icon" />
                          <span className="address-text">{doctor.address}</span>
                        </div>
                      )}
                      
                      {doctor.bio && (
                        <p className="doctor-bio-preview">{doctor.bio}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="card-actions">
                    <div className="availability-indicator">
                      <span className="availability-dot"></span>
                      <span>Available today</span>
                    </div>
                    <span className="view-profile">View Profile →</span>
                  </div>
                </IonCardContent>
              </IonCard>
            ))}
          </AsyncContent>
        </div>
      </IonContent>
    </IonPage>
  )
}