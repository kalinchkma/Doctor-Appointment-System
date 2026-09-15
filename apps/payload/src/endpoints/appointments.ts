import type { Endpoint, PayloadRequest } from 'payload'
import { z } from 'zod'
import {
  errors,
  isDuplicateKeyError,
  isWriteConflictError,
  json,
  toErrorResponse,
} from '../lib/errors'
import { begin, commit, rollback } from '../lib/transaction'

const bookSchema = z.object({
  slotId: z.string().min(1, 'A slot must be selected.'),
})

function requireUser(req: PayloadRequest) {
  if (!req.user) {
    throw errors.unauthenticated()
  }
  return req.user
}

async function parseBookBody(req: PayloadRequest) {
  const parsed = bookSchema.safeParse(await req.json?.())

  if (!parsed.success) {
    throw errors.invalidInput(parsed.error.issues[0]?.message ?? 'The request body is invalid.')
  }
  return parsed.data
}

// The mongoose model rather than the raw driver collection: it casts the incoming string
// id to an ObjectId using the schema, which the native driver would not do.
const slotModel = (req: PayloadRequest) => req.payload.db.collections['appointment-slots']!

// Payload's mongoose models are untyped, so the fields this endpoint reads are declared
// here rather than asserted inline at each use.
type SlotDocument = { doctor: unknown; startsAt: string; status: string }

const asSlot = (document: unknown) => document as SlotDocument | null

/**
 * POST /api/appointments/book
 *
 * Registered as a collection endpoint, not a root config endpoint: Payload mounts
 * collection routes at /api/appointments/* and they shadow root endpoints sharing that
 * prefix, so a root-level '/appointments/book' is never reached.
 *
 * Double booking is prevented on the server, in three independent layers:
 *
 *  1. An atomic compare-and-swap flips the slot from `available` to `booked` in one
 *     MongoDB update. Single-document updates are atomic, so concurrent callers cannot
 *     interleave a read and a write — exactly one observes `available` and the rest get
 *     back null. This is the load-bearing check, and it needs no transaction.
 *  2. The uniq_active_slot partial unique index rejects a second active appointment for
 *     the same slot with E11000, so the invariant holds even against a code path that
 *     bypasses layer 1.
 *  3. Both writes join one transaction where the deployment supports it, so a failure
 *     after the claim rolls the slot back automatically. Where it does not, the handler
 *     compensates by releasing the slot itself.
 *
 * The patient always comes from the authenticated session, so a client cannot book on
 * another user's behalf by putting a different id in the body.
 */
const book: Endpoint = {
  path: '/book',
  method: 'post',
  handler: async (req) => {
    const payload = req.payload

    try {
      const user = requireUser(req)
      const { slotId } = await parseBookBody(req)

      const transaction = await begin(req)
      const slots = slotModel(req)
      let claimed = false

      try {
        // Read first, only to tell "no such slot" apart from "already taken". The
        // decision itself is still made by the conditional update below.
        const existing = asSlot(
          await slots.findOne({ _id: slotId }, null, { session: transaction.session }).lean(),
        )
        if (!existing) {
          throw errors.slotNotFound()
        }
        if (new Date(existing.startsAt).getTime() <= Date.now()) {
          throw errors.slotExpired()
        }

        // Layer 1. The filter is the guard, applied by the database at write time.
        const result = asSlot(
          await slots
            .findOneAndUpdate(
              { _id: slotId, status: 'available' },
              { $set: { status: 'booked' } },
              { session: transaction.session, new: true },
            )
            .lean(),
        )
        if (!result) {
          throw errors.slotUnavailable()
        }
        claimed = true

        const appointment = await payload.create({
          collection: 'appointments',
          req,
          overrideAccess: true,
          data: {
            patient: user.id,
            doctor: String(result.doctor),
            slot: slotId,
            status: 'booked',
            bookedAt: new Date().toISOString(),
          },
        })

        await commit(req, transaction)

        return json(
          {
            id: appointment.id,
            doctor: appointment.doctor,
            slot: appointment.slot,
            status: appointment.status,
            bookedAt: appointment.bookedAt,
          },
          201,
        )
      } catch (error) {
        await rollback(req, transaction)

        // Without a transaction the claim has already been written, so release it here
        // or the slot would be stranded as `booked` with no appointment behind it.
        if (claimed && !transaction.active) {
          await slots
            .updateOne({ _id: slotId, status: 'booked' }, { $set: { status: 'available' } })
            .catch((releaseError: unknown) => {
              payload.logger.error(
                { err: releaseError, slotId },
                'failed to release slot after a booking error',
              )
            })
        }

        // Every way of losing the race maps to the same answer for the caller:
        //   - layer 1 outside a transaction: findOneAndUpdate returned null (above)
        //   - layer 1 inside a transaction:  write conflict, because snapshot isolation
        //     aborts the second writer rather than matching zero documents
        //   - layer 2:                       the uniq_active_slot index rejected the insert
        if (isWriteConflictError(error) || isDuplicateKeyError(error)) {
          throw errors.slotUnavailable()
        }
        throw error
      }
    } catch (error) {
      return toErrorResponse(error, payload, 'appointments.book')
    }
  },
}

/**
 * POST /api/appointments/:id/cancel
 *
 * Releases the slot alongside cancelling the appointment. This is why uniq_active_slot is
 * a *partial* index: once the appointment is `cancelled` it no longer occupies the slot,
 * so the slot becomes bookable again.
 */
const cancel: Endpoint = {
  path: '/:id/cancel',
  method: 'post',
  handler: async (req) => {
    const payload = req.payload

    try {
      const user = requireUser(req)
      const appointmentId = String(req.routeParams?.id ?? '')

      if (!appointmentId) {
        throw errors.invalidInput('An appointment id is required.')
      }

      // Access control is applied rather than overridden, so a patient can only ever
      // reach their own appointment.
      const appointment = await payload
        .findByID({ collection: 'appointments', id: appointmentId, req, depth: 0 })
        .catch(() => null)

      if (!appointment || String(appointment.patient) !== String(user.id)) {
        throw errors.appointmentNotFound()
      }
      if (appointment.status === 'cancelled') {
        throw errors.alreadyCancelled()
      }

      const transaction = await begin(req)

      try {
        await payload.update({
          collection: 'appointments',
          id: appointmentId,
          req,
          overrideAccess: true,
          data: { status: 'cancelled', cancelledAt: new Date().toISOString() },
        })

        await slotModel(req).updateOne(
          { _id: String(appointment.slot) },
          { $set: { status: 'available' } },
          { session: transaction.session },
        )

        await commit(req, transaction)

        return json({ id: appointmentId, status: 'cancelled' })
      } catch (error) {
        await rollback(req, transaction)
        throw error
      }
    } catch (error) {
      return toErrorResponse(error, payload, 'appointments.cancel')
    }
  },
}

export const appointmentEndpoints: Endpoint[] = [book, cancel]
