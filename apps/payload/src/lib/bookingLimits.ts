import type { PayloadRequest } from 'payload'
import { errors } from '../lib/errors'

/** Hard caps so one account cannot monopolize the clinic calendar. */
export const MAX_UPCOMING_APPOINTMENTS = 2
export const MAX_UPCOMING_PER_DOCTOR = 1

type UpcomingAppointment = {
  doctor?: unknown
  slot?: unknown
}

function doctorRef(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id)
  }
  return null
}

function slotStartsAt(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const startsAt = (value as { startsAt?: string }).startsAt
  if (!startsAt) return null
  const ms = new Date(startsAt).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Rejects booking when the patient already has too many upcoming appointments,
 * or already has one upcoming visit with the same doctor.
 */
export async function assertPatientCanBook(
  req: PayloadRequest,
  patientId: string,
  doctorId: string,
): Promise<void> {
  const existing = await req.payload.find({
    collection: 'appointments',
    where: {
      and: [{ patient: { equals: patientId } }, { status: { equals: 'booked' } }],
    },
    depth: 1,
    limit: 50,
    overrideAccess: true,
  })

  const now = Date.now()
  const upcoming = (existing.docs as UpcomingAppointment[]).filter((appointment) => {
    const start = slotStartsAt(appointment.slot)
    return start != null && start > now
  })

  if (upcoming.length >= MAX_UPCOMING_APPOINTMENTS) {
    throw errors.bookingLimit(MAX_UPCOMING_APPOINTMENTS)
  }

  const sameDoctor = upcoming.some((appointment) => doctorRef(appointment.doctor) === doctorId)
  if (sameDoctor) {
    throw errors.alreadyBookedWithDoctor()
  }
}
