import type { Payload } from 'payload'

/**
 * Declares the database constraints that Payload's field-level `index: true` cannot
 * express. Runs on every boot and is idempotent: createIndex on an identical spec is a
 * no-op, so this is safe to re-run.
 *
 * uniq_active_slot is the backstop for double booking. The booking endpoint already
 * claims slots with an atomic compare-and-swap, but this index means the invariant
 * "one active appointment per slot" is enforced by the database itself, even against a
 * buggy code path, a migration, or a direct write from the admin panel.
 *
 * The filter is partial on purpose. Cancelled appointments are excluded, so releasing a
 * slot and rebooking it stays possible while duplicates remain impossible.
 */
export async function ensureIndexes(payload: Payload): Promise<void> {
  const appointments = payload.db.collections['appointments']?.collection
  const slots = payload.db.collections['appointment-slots']?.collection

  if (!appointments || !slots) {
    payload.logger.error('ensureIndexes: expected collections are not registered')
    return
  }

  await appointments.createIndex(
    { slot: 1 },
    {
      name: 'uniq_active_slot',
      unique: true,
      partialFilterExpression: { status: 'booked' },
    },
  )

  // Prevents an administrator from accidentally creating two slots for the same doctor
  // at the same instant, which would present as duplicate rows in the mobile app.
  await slots.createIndex(
    { doctor: 1, startsAt: 1 },
    { name: 'uniq_doctor_startsAt', unique: true },
  )

  payload.logger.info('database indexes ensured')
}
