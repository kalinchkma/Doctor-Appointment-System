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
 * Available slots from now onward. The status filter is a display convenience only —
 * the booking endpoint re-checks availability atomically, so a slot shown here may still
 * be taken by the time the user taps it.
 */
export async function listAvailableSlots(doctorID: string): Promise<AppointmentSlot[]> {
  const query = new URLSearchParams({
    'where[doctor][equals]': doctorID,
    'where[status][equals]': 'available',
    'where[startsAt][greater_than]': new Date().toISOString(),
    sort: 'startsAt',
    limit: '200',
    depth: '0',
  })
  const response = await get<Paginated<AppointmentSlot>>(`/api/appointment-slots?${query}`)
  return response.docs
}
