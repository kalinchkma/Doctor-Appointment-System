/**
 * Slot conflict rules: exact duplicate start + time-range overlap.
 * Requires a running CMS with at least one doctor (pnpm seed).
 *
 *   BASE_URL=http://localhost:3000 tsx --env-file-if-exists=../../.env tests/slot-overlap.ts
 */

import { getPayload } from 'payload'
import config from '../src/payload.config'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  console.log(`slot overlap rules against local Payload + ${BASE_URL}\n`)

  const payload = await getPayload({ config })
  const doctors = await payload.find({ collection: 'doctors', limit: 1, overrideAccess: true })
  const doctor = doctors.docs[0]
  if (!doctor) {
    console.error('need a seeded doctor — run pnpm seed')
    process.exit(1)
  }

  const day = new Date()
  day.setUTCDate(day.getUTCDate() + 14)
  day.setUTCHours(10, 0, 0, 0)
  const startA = day.toISOString()

  const dayB = new Date(day)
  dayB.setUTCMinutes(30)
  const startB = dayB.toISOString()

  const dayC = new Date(day)
  dayC.setUTCHours(11, 0, 0, 0)
  const startC = dayC.toISOString()

  // Clean any leftovers from a previous run of this test.
  const leftovers = await payload.find({
    collection: 'appointment-slots',
    where: {
      and: [
        { doctor: { equals: doctor.id } },
        { startsAt: { greater_than_equal: startA } },
        { startsAt: { less_than_equal: startC } },
      ],
    },
    limit: 20,
    overrideAccess: true,
  })
  for (const slot of leftovers.docs) {
    await payload.delete({ collection: 'appointment-slots', id: slot.id, overrideAccess: true })
  }

  const base = await payload.create({
    collection: 'appointment-slots',
    overrideAccess: true,
    data: {
      doctor: doctor.id,
      startsAt: startA,
      endsAt: new Date(new Date(startA).getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      status: 'available',
    },
  })
  check('creates a 60-minute base slot', Boolean(base.id) && Boolean(base.endsAt))

  let duplicateMessage = ''
  try {
    await payload.create({
      collection: 'appointment-slots',
      overrideAccess: true,
      data: {
        doctor: doctor.id,
        startsAt: startA,
        endsAt: new Date(new Date(startA).getTime() + 30 * 60_000).toISOString(),
        durationMinutes: 30,
        status: 'available',
      },
    })
  } catch (error) {
    duplicateMessage = error instanceof Error ? error.message : String(error)
  }
  check(
    'rejects exact duplicate start time with a clear message',
    /exact time already exists/i.test(duplicateMessage),
    duplicateMessage,
  )

  let overlapMessage = ''
  try {
    await payload.create({
      collection: 'appointment-slots',
      overrideAccess: true,
      data: {
        doctor: doctor.id,
        startsAt: startB,
        endsAt: new Date(new Date(startB).getTime() + 30 * 60_000).toISOString(),
        durationMinutes: 30,
        status: 'available',
      },
    })
  } catch (error) {
    overlapMessage = error instanceof Error ? error.message : String(error)
  }
  check(
    'rejects overlapping slot with a clear message',
    /overlaps an existing slot/i.test(overlapMessage),
    overlapMessage,
  )

  const adjacent = await payload.create({
    collection: 'appointment-slots',
    overrideAccess: true,
    data: {
      doctor: doctor.id,
      startsAt: startC,
      endsAt: new Date(new Date(startC).getTime() + 30 * 60_000).toISOString(),
      durationMinutes: 30,
      status: 'available',
    },
  })
  check('allows a non-overlapping adjacent slot', Boolean(adjacent.id))

  // Cleanup test slots
  await payload.delete({ collection: 'appointment-slots', id: base.id, overrideAccess: true })
  await payload.delete({ collection: 'appointment-slots', id: adjacent.id, overrideAccess: true })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
