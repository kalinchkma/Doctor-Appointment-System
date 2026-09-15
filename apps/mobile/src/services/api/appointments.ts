import type { Appointment } from '../../types'
import { get, post } from './client'

type Paginated<T> = { docs: T[] }

/**
 * Payload's access control scopes this to the authenticated user, so there is no user id
 * in the query. The server derives identity from the token; the client is never trusted
 * to say whose appointments it wants.
 */
export async function listMyAppointments(): Promise<Appointment[]> {
  const response = await get<Paginated<Appointment>>('/api/appointments?sort=-bookedAt&depth=2')
  return response.docs
}

/** Access control rejects this with a 403 unless the appointment belongs to the caller. */
export const getAppointment = (id: string) => get<Appointment>(`/api/appointments/${id}?depth=2`)

export const bookAppointment = (slotId: string) =>
  post<{ id: string; status: string; bookedAt: string }>('/api/appointments/book', { slotId })

export const cancelAppointment = (appointmentId: string) =>
  post<{ id: string; status: string }>(`/api/appointments/${appointmentId}/cancel`)
