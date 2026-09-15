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
 *
 * uniq_doctor_startsAt is the backstop for exact duplicate slot starts. Time-range
 * overlaps are enforced in application hooks (beforeValidate); MongoDB cannot express
 * arbitrary interval uniqueness as a single unique index.
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

  await slots.createIndex(
    { doctor: 1, startsAt: 1 },
    { name: 'uniq_doctor_startsAt', unique: true },
  )

  await slots.createIndex({ doctor: 1, endsAt: 1 }, { name: 'doctor_endsAt' })

  // Backfill endsAt for slots created before the overlap field existed.
  const missingEndsAt = await slots
    .find({
      $or: [{ endsAt: { $exists: false } }, { endsAt: null }],
      startsAt: { $exists: true },
      durationMinutes: { $exists: true },
    })
    .toArray()

  for (const doc of missingEndsAt) {
    const start = new Date(doc.startsAt as Date | string).getTime()
    const duration = Number(doc.durationMinutes) || 30
    if (Number.isNaN(start)) continue
    await slots.updateOne(
      { _id: doc._id },
      { $set: { endsAt: new Date(start + duration * 60_000) } },
    )
  }

  if (missingEndsAt.length > 0) {
    payload.logger.info(`backfilled endsAt on ${missingEndsAt.length} appointment slots`)
  }

  payload.logger.info('database indexes ensured')
}
