import type { AppointmentSlot, Doctor, DoctorReview } from '../../types'
import { get, post } from './client'

type Paginated<T> = { docs: T[]; totalDocs: number }

function relationId(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id)
  }
  return String(value)
}

function todayBounds(): { start: string; end: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Active doctors with `availableToday` derived from open slots for the local calendar day. */
export async function listDoctors(): Promise<Doctor[]> {
  const { start, end } = todayBounds()
  const slotQuery = new URLSearchParams({
    'where[and][0][status][equals]': 'available',
    'where[and][1][startsAt][greater_than_equal]': start,
    'where[and][2][startsAt][less_than_equal]': end,
    limit: '500',
    depth: '0',
  })

  const [doctorsResponse, slotsResponse] = await Promise.all([
    get<Paginated<Doctor>>('/api/doctors?where[active][equals]=true&sort=name&limit=100&depth=1'),
    get<Paginated<Pick<AppointmentSlot, 'id' | 'doctor'>>>(`/api/appointment-slots?${slotQuery}`),
  ])

  const availableToday = new Set(
    slotsResponse.docs.map((slot) => relationId(slot.doctor)).filter(Boolean),
  )

  return doctorsResponse.docs.map((doctor) => ({
    ...doctor,
    availableToday: availableToday.has(doctor.id),
  }))
}

export const getDoctor = async (id: string): Promise<Doctor> => {
  const { start, end } = todayBounds()
  const slotQuery = new URLSearchParams({
    'where[and][0][doctor][equals]': id,
    'where[and][1][status][equals]': 'available',
    'where[and][2][startsAt][greater_than_equal]': start,
    'where[and][3][startsAt][less_than_equal]': end,
    limit: '1',
    depth: '0',
  })

  const [doctor, slots] = await Promise.all([
    get<Doctor>(`/api/doctors/${id}?depth=1`),
    get<Paginated<AppointmentSlot>>(`/api/appointment-slots?${slotQuery}`),
  ])

  return { ...doctor, availableToday: slots.totalDocs > 0 || slots.docs.length > 0 }
}

/**
 * Future slots for a doctor (available and booked). Booked times are shown in the UI
 * but cannot be selected; the booking endpoint still enforces availability atomically.
 */
export async function listDoctorSlots(doctorID: string): Promise<AppointmentSlot[]> {
  const query = new URLSearchParams({
    'where[doctor][equals]': doctorID,
    'where[startsAt][greater_than]': new Date().toISOString(),
    sort: 'startsAt',
    limit: '200',
    depth: '0',
  })
  const response = await get<Paginated<AppointmentSlot>>(`/api/appointment-slots?${query}`)
  return response.docs
}

/** @deprecated Prefer listDoctorSlots — kept for any older callers. */
export async function listAvailableSlots(doctorID: string): Promise<AppointmentSlot[]> {
  const slots = await listDoctorSlots(doctorID)
  return slots.filter((slot) => slot.status === 'available')
}

export async function listDoctorReviews(doctorId: string): Promise<DoctorReview[]> {
  const query = new URLSearchParams({
    'where[doctor][equals]': doctorId,
    sort: '-createdAt',
    limit: '50',
    depth: '0',
  })
  const response = await get<Paginated<DoctorReview>>(`/api/doctor-reviews?${query}`)
  return response.docs
}

export const submitDoctorReview = (
  doctorId: string,
  rating: number,
  comment?: string,
  appointmentId?: string,
) =>
  post<{
    id: string
    doctorId: string
    rating: number
    comment: string
    ratingAverage: number
    reviewCount: number
  }>('/api/doctor-reviews/submit', {
    doctorId,
    rating,
    ...(comment?.trim() ? { comment: comment.trim() } : {}),
    ...(appointmentId ? { appointmentId } : {}),
  })
