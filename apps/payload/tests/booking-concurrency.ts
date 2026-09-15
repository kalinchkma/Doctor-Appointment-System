/**
 * Verifies that concurrent bookings for one slot produce exactly one appointment.
 *
 * This exercises the real HTTP endpoint against a real MongoDB on purpose. The property
 * under test is a database concurrency guarantee, so mocking anything would prove nothing.
 *
 * Run against a booted CMS:
 *   BASE_URL=http://localhost:3111 tsx tests/booking-concurrency.ts
 *
 * Phase 7 will port this to Vitest. It is a standalone script for now so it can be run
 * during development without the test harness.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const CONTENDERS = Number(process.env.CONTENDERS ?? 25)
const ROUNDS = Number(process.env.ROUNDS ?? 5)

type Session = { token: string; email: string }

async function registerPatient(index: number, round: number): Promise<Session> {
  const email = `race-${round}-${index}-${Date.now()}@example.test`

  const response = await fetch(`${BASE_URL}/api/auth/patient/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Racer ${index}`, email, password: 'correct-horse-battery' }),
  })

  if (!response.ok) {
    throw new Error(`register failed (${response.status}): ${await response.text()}`)
  }
  const body = (await response.json()) as { token: string }
  return { token: body.token, email }
}

async function firstAvailableSlot(): Promise<string> {
  const response = await fetch(
    `${BASE_URL}/api/appointment-slots?where[status][equals]=available&limit=1&sort=startsAt&depth=0`,
  )
  const body = (await response.json()) as { docs: { id: string }[] }

  if (!body.docs?.length) {
    throw new Error('no available slots — run pnpm seed first')
  }
  return body.docs[0]!.id
}

async function book(session: Session, slotId: string) {
  const response = await fetch(`${BASE_URL}/api/appointments/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${session.token}` },
    body: JSON.stringify({
      slotId,
      contactName: 'Race Patient',
      contactPhone: '+880 1712 345678',
      contactEmail: session.email,
    }),
  })
  return { status: response.status, body: await response.json() }
}

async function runRound(round: number): Promise<boolean> {
  const slotId = await firstAvailableSlot()
  const sessions = await Promise.all(
    Array.from({ length: CONTENDERS }, (_, i) => registerPatient(i, round)),
  )

  // Build every promise before awaiting any of them. Awaiting inside the loop would
  // serialise the requests and the test would pass without proving anything.
  const results = await Promise.all(sessions.map((session) => book(session, slotId)))

  const created = results.filter((r) => r.status === 201)
  const conflicts = results.filter((r) => r.status === 409)
  const other = results.filter((r) => r.status !== 201 && r.status !== 409)

  const codes = new Set(conflicts.map((r) => (r.body as { code?: string }).code))
  const ok =
    created.length === 1 &&
    conflicts.length === CONTENDERS - 1 &&
    other.length === 0 &&
    codes.size === 1 &&
    codes.has('SLOT_UNAVAILABLE')

  const detail = other.length
    ? ` | unexpected: ${JSON.stringify(other.slice(0, 2).map((r) => ({ s: r.status, b: r.body })))}`
    : ''

  console.log(
    `round ${round}: ${ok ? 'PASS' : 'FAIL'} — ${created.length} booked, ${conflicts.length} conflicts, ${other.length} other${detail}`,
  )
  return ok
}

async function main() {
  console.log(`${CONTENDERS} concurrent bookings per round, ${ROUNDS} rounds, against ${BASE_URL}`)

  let passed = 0
  for (let round = 1; round <= ROUNDS; round++) {
    if (await runRound(round)) passed++
  }

  console.log(`\n${passed}/${ROUNDS} rounds passed`)
  process.exit(passed === ROUNDS ? 0 : 1)
}

void main()
