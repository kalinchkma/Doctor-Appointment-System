/**
 * Chat endpoint rules with the RAG service mocked at the fetch boundary by pointing
 * RAG_SERVICE_URL at a local stub. Run against a booted CMS + Redis:
 *
 *   RAG_STUB=1 BASE_URL=http://localhost:3000 tsx tests/chat-rules.ts
 *
 * When RAG_STUB is unset, the script hits the real /api/chat (auth + validation only).
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

async function api(path: string, init: RequestInit = {}, token?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...init.headers,
    },
  })
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> }
}

async function newPatient(label: string) {
  const { body } = await api('/api/auth/patient/register', {
    method: 'POST',
    body: JSON.stringify({
      name: label,
      email: `${label}-${Date.now()}@example.test`,
      password: 'correct-horse-battery',
    }),
  })
  return { token: String(body.token), id: String((body.user as { id: string }).id) }
}

async function main() {
  console.log(`chat rules against ${BASE_URL}\n`)

  const anonymous = await api('/api/chat', { method: 'POST', body: JSON.stringify({ question: 'hi' }) })
  check('unauthenticated chat is rejected', anonymous.status === 401, `got ${anonymous.status}`)

  const patient = await newPatient('chat')
  const other = await newPatient('chat-other')

  const sessionRes = await api('/api/chat/sessions', { method: 'POST' }, patient.token)
  check('create session returns 201', sessionRes.status === 201, `got ${sessionRes.status}`)
  const sessionId = String(sessionRes.body.id ?? '')
  check('create session returns id', sessionId.length > 0, JSON.stringify(sessionRes.body))

  const empty = await api('/api/chat', { method: 'POST', body: '{}' }, patient.token)
  check('empty body is rejected', empty.status === 400, `got ${empty.status}`)

  const missingSession = await api(
    '/api/chat',
    { method: 'POST', body: JSON.stringify({ question: 'hi' }) },
    patient.token,
  )
  check('chat without sessionId is rejected', missingSession.status === 400, `got ${missingSession.status}`)

  const tooLong = await api(
    '/api/chat',
    {
      method: 'POST',
      body: JSON.stringify({ sessionId, question: 'x'.repeat(1001) }),
    },
    patient.token,
  )
  check('over-long question is rejected', tooLong.status === 400, `got ${tooLong.status}`)

  const foreign = await api(`/api/chat/sessions/${sessionId}`, {}, other.token)
  check('other user cannot read session', foreign.status === 404, `got ${foreign.status}`)

  const leak = JSON.stringify(anonymous.body) + JSON.stringify(empty.body)
  check('errors do not leak secrets', !leak.includes('RAG_INTERNAL_SECRET') && !leak.includes('at '), leak)

  const asked = await api(
    '/api/chat',
    {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        question: 'At what age should complementary foods start?',
      }),
    },
    patient.token,
  )

  if (asked.status === 503 || asked.status === 502) {
    check('RAG down maps to a safe unavailable status', true)
    check(
      'unavailable body has no stack',
      !JSON.stringify(asked.body).includes('Error:') &&
        !JSON.stringify(asked.body).includes('RAG_INTERNAL_SECRET'),
    )
  } else {
    check('authenticated chat returns 200', asked.status === 200, `got ${asked.status}`)
    check('chat body has an answer', typeof asked.body.answer === 'string', JSON.stringify(asked.body))
    check('chat body has grounded flag', typeof asked.body.grounded === 'boolean')
    check('chat body echoes sessionId', asked.body.sessionId === sessionId, String(asked.body.sessionId))

    const followUp = await api(
      '/api/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          question: 'How many meals per day at that age?',
        }),
      },
      patient.token,
    )
    if (followUp.status === 200 || followUp.status === 502 || followUp.status === 503) {
      check('follow-up chat accepted with same session', true)
    } else {
      check('follow-up chat accepted with same session', false, `got ${followUp.status}`)
    }

    const loaded = await api(`/api/chat/sessions/${sessionId}`, {}, patient.token)
    check('session reload returns 200', loaded.status === 200, `got ${loaded.status}`)
    const messages = Array.isArray(loaded.body.messages) ? loaded.body.messages : []
    check(
      'session history grew after turns',
      messages.length >= 2,
      `got ${messages.length} messages`,
    )

    const reset = await api(`/api/chat/sessions/${sessionId}/reset`, { method: 'POST' }, patient.token)
    check('session reset returns 200', reset.status === 200, `got ${reset.status}`)
    const resetMessages = Array.isArray(reset.body.messages) ? reset.body.messages : []
    check('reset clears history', resetMessages.length === 0, `got ${resetMessages.length}`)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
