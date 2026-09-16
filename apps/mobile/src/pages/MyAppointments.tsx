import { useCallback, useMemo, useState } from 'react'
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  type RefresherEventDetail,
} from '@ionic/react'
import { calendar, time, location, chatbubble, add } from 'ionicons/icons'
import { useNavigate } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAsync } from '../hooks/useAsync'
import { listMyAppointments } from '../services/api/appointments'
import { formatDateTime } from '../lib/datetime'
import type { Appointment } from '../types'

type Filter = 'upcoming' | 'past'

const startsAt = (appointment: Appointment): string =>
  typeof appointment.slot === 'object' ? appointment.slot.startsAt : appointment.bookedAt

export function MyAppointments() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('upcoming')

  // The reference time is captured with the data rather than read during render, so the
  // upcoming/past split stays stable across re-renders and refreshes on every reload.
  const { data, loading, error, reload } = useAsync(
    useCallback(async () => ({ items: await listMyAppointments(), now: Date.now() }), []),
  )

  const now = data?.now ?? 0

  const { upcoming, past } = useMemo(() => {
    const items = data?.items ?? []
    const upcoming: Appointment[] = []
    const past: Appointment[] = []

    for (const appointment of items) {
      const isUpcoming =
        new Date(startsAt(appointment)).getTime() > now && appointment.status === 'booked'
      if (isUpcoming) {
        upcoming.push(appointment)
      } else {
        past.push(appointment)
      }
    }

    upcoming.sort((a, b) => new Date(startsAt(a)).getTime() - new Date(startsAt(b)).getTime())
    past.sort((a, b) => new Date(startsAt(b)).getTime() - new Date(startsAt(a)).getTime())

    return { upcoming, past }
  }, [data, now])

  const visible = filter === 'upcoming' ? upcoming : past

  const refresh = (event: CustomEvent<RefresherEventDetail>) => {
    reload()
    event.detail.complete()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'booked': return 'success'
      case 'cancelled': return 'medium'
      default: return 'medium'
    }
  }

  const getTimeUntil = (appointment: Appointment) => {
    const start = new Date(startsAt(appointment)).getTime()
    const diffMs = start - now
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays <= 7) return `In ${diffDays} days`
    return null
  }

  return (
    <IonPage>
      <ScreenHeader title="My Appointments" backTo="/home" />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={refresh}>
          <IonRefresherContent />
        </IonRefresher>
        
        <div className="appointments-header">
          <IonSegment 
            value={filter} 
            onIonChange={(event) => setFilter(event.detail.value as Filter)}
            className="appointments-tabs"
          >
            <IonSegmentButton value="upcoming">
              <div className="tab-content">
                <span>Upcoming</span>
                {upcoming.length > 0 && <IonBadge color="primary">{upcoming.length}</IonBadge>}
              </div>
            </IonSegmentButton>
            <IonSegmentButton value="past">
              <div className="tab-content">
                <span>Past</span>
                {past.length > 0 && <IonBadge color="medium">{past.length}</IonBadge>}
              </div>
            </IonSegmentButton>
          </IonSegment>

          {filter === 'upcoming' && (
            <IonButton 
              fill="clear" 
              size="small" 
              onClick={() => navigate('/doctors')}
              className="book-new-button"
            >
              <IonIcon icon={add} slot="start" />
              Book New
            </IonButton>
          )}
        </div>

        <div className="appointments-content">
          <AsyncContent
            loading={loading}
            error={error}
            empty={visible.length === 0}
            emptyMessage={
              filter === 'upcoming'
                ? "No upcoming appointments. Ready to book your next visit?"
                : 'Your appointment history will appear here.'
            }
            onRetry={reload}
          >
            {visible.map((appointment) => {
              const doctor = typeof appointment.doctor === 'object' ? appointment.doctor : null
              const timeUntil = filter === 'upcoming' ? getTimeUntil(appointment) : null

              return (
                <IonCard
                  key={appointment.id}
                  button
                  className="appointment-card-v2"
                  onClick={() => navigate(`/appointments/${appointment.id}`)}
                >
                  <IonCardContent>
                    <div className="appointment-card-header">
                      <div className="appointment-status-section">
                        <IonBadge color={getStatusColor(appointment.status)} className="status-badge">
                          {appointment.status}
                        </IonBadge>
                        {timeUntil && <span className="time-until">{timeUntil}</span>}
                      </div>
                      {doctor && <DoctorAvatar doctor={doctor} />}
                    </div>

                    <div className="appointment-main-info">
                      <h3 className="doctor-name">{doctor?.name ?? 'Your Doctor'}</h3>
                      {doctor && <p className="specialization">{doctor.specialization}</p>}
                      
                      <div className="appointment-details">
                        <div className="detail-row">
                          <IonIcon icon={calendar} className="detail-icon" />
                          <span className="appointment-time">{formatDateTime(startsAt(appointment))}</span>
                        </div>
                        
                        {doctor?.address && (
                          <div className="detail-row">
                            <IonIcon icon={location} className="detail-icon" />
                            <span className="appointment-location">{doctor.address}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="appointment-footer">
                      {appointment.doctorComment && (
                        <div className="has-message">
                          <IonIcon icon={chatbubble} className="message-icon" />
                          <span>Clinic message</span>
                        </div>
                      )}
                      
                      <div className="view-details">
                        <span>View Details</span>
                        <IonIcon icon={time} />
                      </div>
                    </div>
                  </IonCardContent>
                </IonCard>
              )
            })}

            {filter === 'upcoming' && visible.length === 0 && (
              <div className="empty-state-actions">
                <IonButton 
                  expand="block" 
                  onClick={() => navigate('/doctors')}
                  className="book-first-button"
                >
                  <IonIcon icon={add} slot="start" />
                  Book Your First Appointment
                </IonButton>
              </div>
            )}
          </AsyncContent>
        </div>
      </IonContent>
    </IonPage>
  )
}
