import assert from 'node:assert/strict'
import { __test } from '../src/lib/llm/providers'

const { resolveGoogleEmbedModel, resolveGoogleChatModel, l2Normalize } = __test

assert.equal(resolveGoogleEmbedModel('text-embedding-004'), 'gemini-embedding-001')
assert.equal(resolveGoogleEmbedModel('gemini-2.0-flash'), 'gemini-embedding-001')
assert.equal(resolveGoogleEmbedModel('models/gemini-embedding-001'), 'gemini-embedding-001')
assert.equal(resolveGoogleEmbedModel('gemini-embedding-001'), 'gemini-embedding-001')

assert.equal(resolveGoogleChatModel('models/gemini-2.0-flash'), 'gemini-2.0-flash')
assert.equal(resolveGoogleChatModel('gemini-embedding-001'), 'gemini-2.0-flash')

const unit = l2Normalize([3, 4])
assert.ok(Math.abs(unit[0]! - 0.6) < 1e-9)
assert.ok(Math.abs(unit[1]! - 0.8) < 1e-9)

console.log('llm provider helpers ok')
