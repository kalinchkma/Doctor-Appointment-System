import assert from 'node:assert/strict'
import {
  normalizeQuestionKey,
  parseRetrievalReason,
  shouldRecordUnresolved,
  toPublicClinicReply,
} from '../src/lib/unresolvedQueries'

assert.equal(normalizeQuestionKey('  What should I eat?  '), 'what should i eat?')
assert.equal(shouldRecordUnresolved('below_threshold'), true)
assert.equal(shouldRecordUnresolved('greeting'), false)
assert.equal(parseRetrievalReason('low_coverage'), 'low_coverage')

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
assert.equal(waiting.humanResponse, null)
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
assert.equal(answered.messages[1]?.role, 'staff')

console.log('unresolved-workflow: all assertions passed')
