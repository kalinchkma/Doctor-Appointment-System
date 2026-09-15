import type { Payload } from 'payload'

const WEEKDAYS_AHEAD = 5
const CLINIC_START_HOUR = 9
const CLINIC_END_HOUR = 12
const SLOT_MINUTES = 30

/** The next N weekdays, starting tomorrow. Slots in the past are not bookable. */
function upcomingWeekdays(count: number): Date[] {
  const days: Date[] = []
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  while (days.length < count) {
    cursor.setDate(cursor.getDate() + 1)
    const weekday = cursor.getDay()
    if (weekday !== 0 && weekday !== 6) {
      days.push(new Date(cursor))
    }
  }
  return days
}

function slotTimesFor(day: Date): Date[] {
  const times: Date[] = []

  for (let hour = CLINIC_START_HOUR; hour < CLINIC_END_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      const slot = new Date(day)
      slot.setHours(hour, minute, 0, 0)
      times.push(slot)
    }
  }
  return times
}

export async function seedSlots(payload: Payload): Promise<void> {
  const doctors = await payload.find({ collection: 'doctors', limit: 100, overrideAccess: true })

  let created = 0
  let skipped = 0

  for (const doctor of doctors.docs) {
    for (const day of upcomingWeekdays(WEEKDAYS_AHEAD)) {
      for (const startsAt of slotTimesFor(day)) {
        // uniq_doctor_startsAt makes this idempotent: a re-run collides rather than
        // creating duplicates, so the script can be run repeatedly without cleanup.
        const existing = await payload.find({
          collection: 'appointment-slots',
          where: {
            and: [
              { doctor: { equals: doctor.id } },
              { startsAt: { equals: startsAt.toISOString() } },
            ],
          },
          limit: 1,
          overrideAccess: true,
        })

        if (existing.totalDocs > 0) {
          skipped++
          continue
        }

        await payload.create({
          collection: 'appointment-slots',
          overrideAccess: true,
          data: {
            doctor: doctor.id,
            startsAt: startsAt.toISOString(),
            durationMinutes: SLOT_MINUTES,
            status: 'available',
          },
        })
        created++
      }
    }
  }

  payload.logger.info(`seeded appointment slots: ${created} created, ${skipped} already present`)
}
