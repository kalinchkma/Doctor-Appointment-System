import type { Endpoint, PayloadRequest } from 'payload'
import { z } from 'zod'
import { errors, isDuplicateKeyError, json, toErrorResponse } from '../lib/errors'

const submitSchema = z.object({
  doctorId: z.string().min(1, 'A doctor is required.'),
  rating: z
    .number()
    .int('Rating must be a whole number.')
    .min(1, 'Rating must be at least 1.')
    .max(5, 'Rating must be at most 5.'),
  comment: z
    .string()
    .trim()
    .max(1000, 'Review must be 1000 characters or fewer.')
    .optional(),
  appointmentId: z.string().min(1).optional(),
})

function requireUser(req: PayloadRequest) {
  if (!req.user) {
    throw errors.unauthenticated()
  }
  return req.user
}

function relationId(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id)
  }
  return String(value)
}

async function parseSubmitBody(req: PayloadRequest) {
  const parsed = submitSchema.safeParse(await req.json?.())
  if (!parsed.success) {
    throw errors.invalidInput(parsed.error.issues[0]?.message ?? 'The request body is invalid.')
  }
  return parsed.data
}

/**
 * True when the patient has a past booked appointment with this doctor
 * (slot start is in the past). That is our stand-in for "attended a visit"
 * until a dedicated completed status exists.
 */
async function findEligiblePastAppointment(
  req: PayloadRequest,
  patientId: string,
  doctorId: string,
  preferredAppointmentId?: string,
) {
  const payload = req.payload
  const now = new Date().toISOString()

  if (preferredAppointmentId) {
    const appointment = await payload
      .findByID({
        collection: 'appointments',
        id: preferredAppointmentId,
        overrideAccess: true,
        depth: 1,
      })
      .catch(() => null)

    if (
      appointment &&
      relationId(appointment.patient) === patientId &&
      relationId(appointment.doctor) === doctorId &&
      appointment.status === 'booked' &&
      typeof appointment.slot === 'object' &&
      appointment.slot !== null &&
      'startsAt' in appointment.slot &&
      String((appointment.slot as { startsAt: string }).startsAt) < now
    ) {
      return appointment
    }
  }

  const candidates = await payload.find({
    collection: 'appointments',
    where: {
      and: [
        { patient: { equals: patientId } },
        { doctor: { equals: doctorId } },
        { status: { equals: 'booked' } },
      ],
    },
    limit: 50,
    depth: 1,
    overrideAccess: true,
    sort: '-bookedAt',
  })

  return (
    candidates.docs.find((appointment) => {
      if (typeof appointment.slot !== 'object' || appointment.slot === null) return false
      if (!('startsAt' in appointment.slot)) return false
      return String((appointment.slot as { startsAt: string }).startsAt) < now
    }) ?? null
  )
}

/**
 * POST /api/doctor-reviews/submit
 *
 * Patients leave one review per doctor after a past visit. Generic REST create
 * stays closed; this endpoint is the write path.
 */
const submit: Endpoint = {
  path: '/submit',
  method: 'post',
  handler: async (req) => {
    const payload = req.payload

    try {
      const user = requireUser(req)
      const body = await parseSubmitBody(req)
      const patientId = String(user.id)

      const doctor = await payload
        .findByID({
          collection: 'doctors',
          id: body.doctorId,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null)

      if (!doctor || doctor.active === false) {
        throw errors.invalidInput('That doctor could not be found.')
      }

      const existing = await payload.find({
        collection: 'doctor-reviews',
        where: {
          and: [
            { patient: { equals: patientId } },
            { doctor: { equals: body.doctorId } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (existing.totalDocs > 0) {
        throw errors.alreadyReviewed()
      }

      const appointment = await findEligiblePastAppointment(
        req,
        patientId,
        body.doctorId,
        body.appointmentId,
      )

      if (!appointment) {
        throw errors.reviewNotEligible()
      }

      const review = await payload.create({
        collection: 'doctor-reviews',
        overrideAccess: true,
        data: {
          patient: patientId,
          patientName: user.name || 'Patient',
          doctor: body.doctorId,
          appointment: appointment.id,
          rating: body.rating,
          ...(body.comment ? { comment: body.comment } : {}),
        },
      })

      const refreshed = await payload.findByID({
        collection: 'doctors',
        id: body.doctorId,
        overrideAccess: true,
        depth: 0,
      })

      return json({
        id: review.id,
        doctorId: body.doctorId,
        rating: review.rating,
        comment: review.comment ?? '',
        ratingAverage: refreshed.ratingAverage ?? 0,
        reviewCount: refreshed.reviewCount ?? 0,
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return toErrorResponse(errors.alreadyReviewed(), payload, 'doctor-reviews.submit')
      }
      return toErrorResponse(error, payload, 'doctor-reviews.submit')
    }
  },
}

export const doctorReviewEndpoints: Endpoint[] = [submit]
