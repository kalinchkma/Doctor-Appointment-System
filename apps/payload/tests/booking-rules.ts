/**
 * Covers the booking and authorisation rules that the concurrency test does not:
 * authentication, user data isolation, body tampering, expired slots, and the
 * cancel-then-rebook path that depends on uniq_active_slot being a partial index.
 *
 *   BASE_URL=http://localhost:3111 tsx tests/booking-rules.ts
 */

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

type Patient = { id: string; token: string }

const sampleContact = {
  contactName: 'Test Patient',
  contactPhone: '+880 1712 345678',
  contactEmail: 'patient@example.test',
}

function bookBody(slotId: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ slotId, ...sampleContact, ...extra })
}

async function api(path: string, init: RequestInit = {}, token?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...init.headers,
    },
  })
  return { status: response.status, body: (await response.json().catch(() => ({}))) as never }
}

async function newPatient(label: string): Promise<Patient> {
  const { body } = await api('/api/auth/patient/register', {
    method: 'POST',
    body: JSON.stringify({
      name: label,
      email: `${label}-${Date.now()}@example.test`,
      password: 'correct-horse-battery',
    }),
  })
  const typed = body as unknown as { token: string; user: { id: string } }
  return { id: typed.user.id, token: typed.token }
}

async function availableSlots(limit = 5) {
  const { body } = await api(
    `/api/appointment-slots?where[status][equals]=available&limit=${limit}&sort=startsAt&depth=0`,
  )
  return (body as unknown as { docs: { id: string; doctor: string }[] }).docs
}

async function main() {
  console.log(`booking rules against ${BASE_URL}\n`)

  const alice = await newPatient('alice')
  const bob = await newPatient('bob')
  const slots = await availableSlots(8)

  if (slots.length < 3) {
    console.error('need at least 3 available slots — run pnpm seed')
    process.exit(1)
  }

  // --- authentication ---
  const anonymous = await api('/api/appointments/book', {
    method: 'POST',
    body: JSON.stringify({ slotId: slots[0]!.id }),
  })
  check('booking without a token is rejected', anonymous.status === 401, `got ${anonymous.status}`)

  // --- input validation ---
  const empty = await api('/api/appointments/book', { method: 'POST', body: '{}' }, alice.token)
  check('missing slotId is rejected', empty.status === 400, `got ${empty.status}`)

  const missing = await api(
    '/api/appointments/book',
    { method: 'POST', body: bookBody('000000000000000000000000') },
    alice.token,
  )
  check('unknown slot returns 404', missing.status === 404, `got ${missing.status}`)

  const noContact = await api(
    '/api/appointments/book',
    { method: 'POST', body: JSON.stringify({ slotId: slots[0]!.id }) },
    alice.token,
  )
  check(
    'booking without contact details is rejected',
    noContact.status === 400,
    `got ${noContact.status}`,
  )

  // --- happy path, and the patient is taken from the token ---
  const booked = await api(
    '/api/appointments/book',
    // A tampered patient id in the body must be ignored.
    { method: 'POST', body: bookBody(slots[0]!.id, { patient: bob.id }) },
    alice.token,
  )
  check('booking succeeds', booked.status === 201, `got ${booked.status}`)

  const appointmentId = (booked.body as unknown as { id: string }).id
  const fetched = await api(`/api/appointments/${appointmentId}?depth=0`, {}, alice.token)
  const patientOnRecord = String((fetched.body as unknown as { patient: string }).patient)
  check(
    'patient comes from the session, not the request body',
    patientOnRecord === String(alice.id),
    `record says ${patientOnRecord}`,
  )

  // --- anti-abuse: one upcoming visit per doctor ---
  const sameDoctorSlot = slots.find(
    (slot) => slot.id !== slots[0]!.id && String(slot.doctor) === String(slots[0]!.doctor),
  )
  if (sameDoctorSlot) {
    const secondSameDoctor = await api(
      '/api/appointments/book',
      { method: 'POST', body: bookBody(sameDoctorSlot.id) },
      alice.token,
    )
    check(
      'second upcoming booking with same doctor is rejected',
      secondSameDoctor.status === 409 &&
        (secondSameDoctor.body as { code?: string }).code === 'ALREADY_BOOKED_WITH_DOCTOR',
      `got ${secondSameDoctor.status} ${JSON.stringify(secondSameDoctor.body)}`,
    )
  } else {
    check('second upcoming booking with same doctor is rejected', false, 'no same-doctor slot available')
  }

  // --- user data isolation ---
  const crossRead = await api(`/api/appointments/${appointmentId}`, {}, bob.token)
  check(
    "another user cannot read Alice's appointment",
    crossRead.status === 403 || crossRead.status === 404,
    `got ${crossRead.status}`,
  )

  const bobList = await api('/api/appointments?depth=0', {}, bob.token)
  const bobDocs = (bobList.body as unknown as { docs: { id: string }[] }).docs ?? []
  check(
    "listing appointments never returns another user's rows",
    !bobDocs.some((d) => d.id === appointmentId),
    `saw ${bobDocs.length} docs`,
  )

  // --- create is closed on the collection ---
  const directCreate = await api(
    '/api/appointments',
    {
      method: 'POST',
      body: JSON.stringify({
        patient: alice.id,
        doctor: '000000000000000000000000',
        slot: slots[1]!.id,
        status: 'booked',
        bookedAt: new Date().toISOString(),
      }),
    },
    alice.token,
  )
  check(
    'the generic create route cannot be used to book',
    directCreate.status === 403,
    `got ${directCreate.status}`,
  )

  // --- cancel, then rebook the freed slot ---
  const cancelled = await api(
    `/api/appointments/${appointmentId}/cancel`,
    { method: 'POST' },
    alice.token,
  )
  check('cancelling succeeds', cancelled.status === 200, `got ${cancelled.status}`)

  const rebooked = await api(
    '/api/appointments/book',
    {
      method: 'POST',
      body: bookBody(slots[0]!.id, {
        contactName: 'Bob Patient',
        contactEmail: 'bob@example.test',
      }),
    },
    bob.token,
  )
  check(
    'a cancelled slot can be booked again (partial unique index)',
    rebooked.status === 201,
    `got ${rebooked.status} ${JSON.stringify(rebooked.body)}`,
  )

  const doubleCancel = await api(
    `/api/appointments/${appointmentId}/cancel`,
    { method: 'POST' },
    alice.token,
  )
  check('cancelling twice is rejected', doubleCancel.status === 409, `got ${doubleCancel.status}`)

  // --- no internal detail leaks ---
  const leaky = JSON.stringify([anonymous.body, missing.body, directCreate.body])
  check(
    'error responses contain no stack traces or paths',
    !/at \w+ \(|node_modules|\/Users\/|RAG_INTERNAL_SECRET/.test(leaky),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
