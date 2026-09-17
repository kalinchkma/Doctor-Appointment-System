import type { Payload } from 'payload'
import { DOCTORS } from './doctors'

const WEEKDAYS_AHEAD = 6
const SLOT_MINUTES = 30

type ClinicHours = { startHour: number; endHour: number }

const DEFAULT_HOURS: ClinicHours = { startHour: 9, endHour: 13 }
const AFTERNOON_HOURS: ClinicHours = { startHour: 15, endHour: 18 }

/** The next N weekdays, starting tomorrow. */
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

function slotTimesFor(day: Date, hours: ClinicHours, notBefore?: Date): Date[] {
  const times: Date[] = []

  for (let hour = hours.startHour; hour < hours.endHour; hour++) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      const slot = new Date(day)
      slot.setHours(hour, minute, 0, 0)
      if (notBefore && slot.getTime() <= notBefore.getTime()) continue
      times.push(slot)
    }
  }
  return times
}

function todayIfWeekday(): Date | null {
  const today = new Date()
  const weekday = today.getDay()
  if (weekday === 0 || weekday === 6) return null
  const day = new Date(today)
  day.setHours(0, 0, 0, 0)
  return day
}

function hoursForDoctor(name: string): ClinicHours {
  if (name.includes('Farhan') || name.includes('Sabina')) return AFTERNOON_HOURS
  return DEFAULT_HOURS
}

export async function seedSlots(payload: Payload): Promise<void> {
  const doctors = await payload.find({ collection: 'doctors', limit: 100, overrideAccess: true })
  const unavailableToday = new Set(
    DOCTORS.filter((doctor) => doctor.unavailableToday).map((doctor) => doctor.name),
  )

  let created = 0
  let skipped = 0
  const today = todayIfWeekday()
  const soon = new Date(Date.now() + 60 * 60 * 1000)

  for (const doctor of doctors.docs) {
    const hours = hoursForDoctor(doctor.name)
    const days = upcomingWeekdays(WEEKDAYS_AHEAD)

    // Most doctors get remaining slots today so the list shows "Available today".
    if (today && !unavailableToday.has(doctor.name)) {
      days.unshift(today)
    }

    for (const day of days) {
      const isToday = today != null && day.getTime() === today.getTime()
      const times = slotTimesFor(day, hours, isToday ? soon : undefined)

      for (const startsAt of times) {
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
            endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000).toISOString(),
            durationMinutes: SLOT_MINUTES,
            status: 'available',
            scheduleType: 'once',
          },
        })
        created++
      }
    }
  }

  payload.logger.info(`seeded appointment slots: ${created} created, ${skipped} already present`)
}
