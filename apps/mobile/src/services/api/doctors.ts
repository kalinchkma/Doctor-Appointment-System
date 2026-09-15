import type { AppointmentSlot, Doctor } from '../../types'
import { get } from './client'

type Paginated<T> = { docs: T[]; totalDocs: number }

export async function listDoctors(): Promise<Doctor[]> {
  const response = await get<Paginated<Doctor>>(
    '/api/doctors?where[active][equals]=true&sort=name&limit=100&depth=1',
  )
  return response.docs
}

export const getDoctor = (id: string) => get<Doctor>(`/api/doctors/${id}?depth=1`)

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
