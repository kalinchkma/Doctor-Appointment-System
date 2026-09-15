import type { Appointment, BookingContact } from '../../types'
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

export const bookAppointment = (
  slotId: string,
  contact: BookingContact,
  patientNote?: string,
) =>
  post<{
    id: string
    status: string
    bookedAt: string
    contactName: string
    contactPhone: string
    contactEmail: string
    patientNote?: string | null
  }>('/api/appointments/book', {
    slotId,
    contactName: contact.contactName.trim(),
    contactPhone: contact.contactPhone.trim(),
    contactEmail: contact.contactEmail.trim(),
    ...(patientNote?.trim() ? { patientNote: patientNote.trim() } : {}),
  })

export const cancelAppointment = (appointmentId: string) =>
  post<{ id: string; status: string }>(`/api/appointments/${appointmentId}/cancel`)

export const updateAppointmentNote = (appointmentId: string, patientNote: string) =>
  post<{ id: string; patientNote: string }>(`/api/appointments/${appointmentId}/note`, {
    patientNote,
  })
