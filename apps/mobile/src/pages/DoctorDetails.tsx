import { useCallback, useMemo, useState } from 'react'
import {
  IonButton,
  IonContent,
  IonIcon,
  IonLoading,
  IonPage,
  IonTextarea,
  IonToast,
} from '@ionic/react'
import { star, starOutline } from 'ionicons/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncContent } from '../components/AsyncContent'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { DoctorMap } from '../components/DoctorMap'
import { ScreenHeader } from '../components/ScreenHeader'
import { messageFor, useAsync } from '../hooks/useAsync'
import { useAuth } from '../hooks/useAuth'
import { listMyAppointments } from '../services/api/appointments'
import {
  getDoctor,
  listDoctorReviews,
  listDoctorSlots,
  submitDoctorReview,
} from '../services/api/doctors'
import { ApiError } from '../services/api/client'
import type { Appointment, DoctorReview } from '../types'

const COMMENT_LIMIT = 1000

function relationId(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id)
  }
  return String(value)
}

function startsAt(appointment: Appointment): string {
  return typeof appointment.slot === 'object' ? appointment.slot.startsAt : appointment.bookedAt
}

function patientLabel(review: DoctorReview): string {
  if (review.patientName?.trim()) return review.patientName.trim()
  if (typeof review.patient === 'object' && review.patient !== null) {
    return review.patient.name || 'Patient'
  }
  return 'Patient'
}

export function DoctorDetails() {
  const { doctorId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  const {
    data,
    loading,
    error,
    reload,
  } = useAsync(
    useCallback(async () => {
      const [doctor, reviews, slots, appointments] = await Promise.all([
        getDoctor(doctorId),
        listDoctorReviews(doctorId),
        listDoctorSlots(doctorId),
        listMyAppointments().catch(() => [] as Appointment[]),
      ])
      return { doctor, reviews, slots, appointments }
    }, [doctorId]),
    [doctorId],
  )

  const doctor = data?.doctor
  const reviews = data?.reviews ?? []
  const hasFutureOpenSlot = (data?.slots ?? []).some((slot) => slot.status === 'available')
  const myReview = useMemo(
    () => reviews.find((review) => relationId(review.patient) === user?.id) ?? null,
    [reviews, user?.id],
  )

  const eligibleAppointment = useMemo(() => {
    const now = Date.now()
    return (
      (data?.appointments ?? []).find((appointment) => {
        if (relationId(appointment.doctor) !== doctorId) return false
        if (appointment.status !== 'booked') return false
        return new Date(startsAt(appointment)).getTime() < now
      }) ?? null
    )
  }, [data?.appointments, doctorId])

  const canReview = Boolean(user && eligibleAppointment && !myReview)

  const onSubmitReview = async () => {
    if (!doctor || !canReview) return
    setSubmitting(true)
    try {
      await submitDoctorReview(
        doctor.id,
        rating,
        comment,
        eligibleAppointment?.id,
      )
      setComment('')
      setNotice('Thank you — your review was submitted.')
      reload()
    } catch (reason) {
      setNotice(messageFor(reason))
      if (reason instanceof ApiError && reason.code === 'ALREADY_REVIEWED') {
        reload()
      }
    } finally {
      setSubmitting(false)
    }
  }

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
                {doctor.experienceYears != null && (
                  <p className="experience-line">
                    {doctor.experienceYears} year{doctor.experienceYears === 1 ? '' : 's'}{' '}
                    experience
                  </p>
                )}
                {doctor.qualifications && <p>{doctor.qualifications}</p>}
                <div className="detail-rating-row">
                  <IonIcon icon={star} color="warning" />
                  <span>
                    {(doctor.reviewCount ?? 0) > 0
                      ? `${(doctor.ratingAverage ?? 0).toFixed(1)} · ${doctor.reviewCount} review${
                          doctor.reviewCount === 1 ? '' : 's'
                        }`
                      : 'No reviews yet'}
                  </span>
                </div>
                <p
                  className={`availability-pill${doctor.availableToday ? '' : ' is-unavailable'}`}
                >
                  {doctor.availableToday ? 'Available today' : 'Unavailable today'}
                </p>
              </section>

              {doctor.bio && (
                <section className="card-surface">
                  <h2>About</h2>
                  <p className="bio">{doctor.bio}</p>
                </section>
              )}

              <DoctorMap doctor={doctor} />

              <section className="card-surface reviews-section">
                <h2>Patient reviews</h2>
                {reviews.length === 0 ? (
                  <p className="reviews-empty">No reviews yet for this doctor.</p>
                ) : (
                  <ul className="review-list">
                    {reviews.map((review) => (
                      <li key={review.id} className="review-item">
                        <div className="review-head">
                          <strong>{patientLabel(review)}</strong>
                          <span className="review-stars">
                            {Array.from({ length: 5 }, (_, index) => (
                              <IonIcon
                                key={index}
                                icon={index < review.rating ? star : starOutline}
                              />
                            ))}
                          </span>
                        </div>
                        {review.comment && <p>{review.comment}</p>}
                      </li>
                    ))}
                  </ul>
                )}

                {canReview && (
                  <div className="review-form">
                    <h3>Leave a review</h3>
                    <p className="step-description">
                      Share how your visit went. You can review each doctor once.
                    </p>
                    <div className="rating-picker">
                      {Array.from({ length: 5 }, (_, index) => {
                        const value = index + 1
                        return (
                          <button
                            key={value}
                            type="button"
                            className="rating-star-btn"
                            aria-label={`${value} star${value === 1 ? '' : 's'}`}
                            onClick={() => setRating(value)}
                          >
                            <IonIcon icon={value <= rating ? star : starOutline} />
                          </button>
                        )
                      })}
                    </div>
                    <IonTextarea
                      value={comment}
                      maxlength={COMMENT_LIMIT}
                      autoGrow
                      rows={3}
                      placeholder="Optional comment for other patients…"
                      onIonInput={(event) => setComment(event.detail.value ?? '')}
                    />
                    <p className="char-count">
                      {comment.length}/{COMMENT_LIMIT}
                    </p>
                    <IonButton expand="block" disabled={submitting} onClick={onSubmitReview}>
                      Submit review
                    </IonButton>
                  </div>
                )}

                {myReview && (
                  <p className="review-thanks">You already reviewed this doctor. Thank you.</p>
                )}
              </section>

              <IonButton
                expand="block"
                className="submit"
                disabled={!hasFutureOpenSlot}
                onClick={() => navigate(`/doctors/${doctor.id}/book`)}
              >
                {hasFutureOpenSlot ? 'Book an appointment' : 'No open times right now'}
              </IonButton>
            </div>
          )}
        </AsyncContent>
      </IonContent>
      <IonLoading isOpen={submitting} message="Submitting review…" />
      <IonToast
        isOpen={Boolean(notice)}
        message={notice}
        duration={4500}
        onDidDismiss={() => setNotice('')}
      />
    </IonPage>
  )
}
