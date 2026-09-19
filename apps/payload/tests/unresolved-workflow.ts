import assert from 'node:assert/strict'
import {
  normalizeQuestionKey,
  parseRetrievalReason,
  shouldRecordUnresolved,
  toPublicClinicReply,
} from '../src/lib/unresolvedQueries'

assert.equal(normalizeQuestionKey('  What should I eat?  '), 'what should i eat?')
assert.equal(normalizeQuestionKey('What   should\nI eat?'), 'what should i eat?')
assert.equal(normalizeQuestionKey('গর্ভাবস্থায় কী খাওয়া উচিত?'), 'গর্ভাবস্থায় কী খাওয়া উচিত?')

assert.equal(shouldRecordUnresolved('below_threshold'), true)
assert.equal(shouldRecordUnresolved('no_results'), true)
assert.equal(shouldRecordUnresolved('greeting'), false)
assert.equal(shouldRecordUnresolved('identity'), false)
assert.equal(shouldRecordUnresolved('off_topic'), false)

assert.equal(parseRetrievalReason('low_coverage'), 'low_coverage')
assert.equal(parseRetrievalReason('greeting'), null)
assert.equal(parseRetrievalReason(undefined), null)

const waiting = toPublicClinicReply({
  id: 'q1',
  question: ' What dose is safe? ',
  status: 'new',
  humanResponse: null,
  createdAt: '2026-09-19T10:00:00.000Z',
  resolvedAt: null,
})
assert.equal(waiting.status, 'new')
assert.equal(waiting.humanResponse, null)
assert.equal(waiting.question, 'What dose is safe?')

const answered = toPublicClinicReply({
  id: 'q2',
  question: 'What dose is safe?',
  status: 'resolved',
  humanResponse: '  Take folic acid daily.  ',
  createdAt: '2026-09-19T10:00:00.000Z',
  resolvedAt: '2026-09-19T11:00:00.000Z',
})
assert.equal(answered.status, 'resolved')
assert.equal(answered.humanResponse, 'Take folic acid daily.')
assert.equal(answered.resolvedAt, '2026-09-19T11:00:00.000Z')

console.log('unresolved-workflow: all assertions passed')
