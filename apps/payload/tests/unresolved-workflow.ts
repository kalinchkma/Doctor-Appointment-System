import assert from 'node:assert/strict'
import {
  clinicThreadMessage,
  hydrateClinicThread,
  lastStaffBody,
  normalizeQuestionKey,
  parseRetrievalReason,
  shouldRecordUnresolved,
  toPublicClinicReply,
  waitingOn,
} from '../src/lib/unresolvedQueries'

assert.equal(normalizeQuestionKey('  What should I eat?  '), 'what should i eat?')
assert.equal(shouldRecordUnresolved('below_threshold'), true)
assert.equal(shouldRecordUnresolved('greeting'), false)
assert.equal(parseRetrievalReason('low_coverage'), 'low_coverage')

const seeded = hydrateClinicThread({
  question: 'What dose is safe?',
  humanResponse: 'See a clinician if pain continues.',
  createdAt: '2026-09-19T10:00:00.000Z',
  resolvedAt: '2026-09-19T11:00:00.000Z',
  user: 'u1',
})
assert.equal(seeded.length, 2)
assert.equal(seeded[0]?.role, 'patient')
assert.equal(seeded[1]?.role, 'staff')
assert.equal(lastStaffBody(seeded), 'See a clinician if pain continues.')
assert.equal(waitingOn(seeded), 'patient')
assert.equal(waitingOn([clinicThreadMessage('patient', 'Follow up?', 'u1')]), 'staff')

const waiting = toPublicClinicReply({
  id: 'q1',
  question: ' What dose is safe? ',
  status: 'new',
  humanResponse: null,
  createdAt: '2026-09-19T10:00:00.000Z',
  resolvedAt: null,
})
assert.equal(waiting.status, 'new')
assert.equal(waiting.waitingOn, 'staff')
assert.equal(waiting.messages[0]?.body, 'What dose is safe?')

const answered = toPublicClinicReply({
  id: 'q2',
  question: 'What dose is safe?',
  status: 'new',
  humanResponse: '  Take folic acid daily.  ',
  createdAt: '2026-09-19T10:00:00.000Z',
  resolvedAt: '2026-09-19T11:00:00.000Z',
})
assert.equal(answered.status, 'resolved')
assert.equal(answered.waitingOn, 'patient')
assert.equal(answered.humanResponse, 'Take folic acid daily.')

console.log('unresolved-workflow: all assertions passed')
