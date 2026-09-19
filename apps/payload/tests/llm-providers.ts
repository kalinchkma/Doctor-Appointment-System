import assert from 'node:assert/strict'
import { applyProviderExamples } from '../src/lib/llm/examples'
import { __test } from '../src/lib/llm/providers'

const { resolveGoogleEmbedModel, resolveGoogleChatModel, l2Normalize, applyEmbedPrefix, parseOpenAIEmbeddingData } =
  __test

assert.equal(resolveGoogleEmbedModel('text-embedding-004'), 'gemini-embedding-001')
assert.equal(resolveGoogleEmbedModel('gemini-2.0-flash'), 'gemini-embedding-001')
assert.equal(resolveGoogleEmbedModel('models/gemini-embedding-001'), 'gemini-embedding-001')
assert.equal(resolveGoogleEmbedModel('gemini-embedding-001'), 'gemini-embedding-001')

assert.equal(resolveGoogleChatModel('models/gemini-2.0-flash'), 'gemini-2.0-flash')
assert.equal(resolveGoogleChatModel('gemini-embedding-001'), 'gemini-2.0-flash')

const unit = l2Normalize([3, 4])
assert.ok(Math.abs(unit[0]! - 0.6) < 1e-9)
assert.ok(Math.abs(unit[1]! - 0.8) < 1e-9)

assert.deepEqual(applyEmbedPrefix('nomic-embed-text', ['energy needs'], 'query'), ['search_query: energy needs'])
assert.deepEqual(applyEmbedPrefix('nomic-embed-text', ['chunk text'], 'document'), ['search_document: chunk text'])
assert.deepEqual(applyEmbedPrefix('nomic-embed-text', ['search_query: already'], 'query'), ['search_query: already'])
assert.deepEqual(applyEmbedPrefix('text-embedding-3-small', ['hello'], 'query'), ['hello'])

const ordered = parseOpenAIEmbeddingData(
  [
    { embedding: [1, 0] },
    { embedding: [0, 1] },
  ],
  2,
)
assert.deepEqual(ordered, [
  [1, 0],
  [0, 1],
])

const indexed = parseOpenAIEmbeddingData(
  [
    { index: 1, embedding: [0, 1] },
    { index: 0, embedding: [1, 0] },
  ],
  2,
)
assert.deepEqual(indexed, [
  [1, 0],
  [0, 1],
])

const switched = applyProviderExamples(
  { chatProvider: 'google', embedProvider: 'openai' },
  { chatProvider: 'ollama', chatModel: 'llama3.2', embedProvider: 'ollama', embedModel: 'nomic-embed-text' },
)
assert.equal(switched.chatModel, 'gemini-2.0-flash')
assert.equal(switched.embedModel, 'text-embedding-3-small')
assert.equal(switched.embedDimensions, 1536)

const openrouter = applyProviderExamples(
  { chatProvider: 'openrouter', embedProvider: 'openrouter' },
  { chatProvider: 'ollama', chatModel: 'llama3.2', embedProvider: 'ollama', embedModel: 'nomic-embed-text' },
)
assert.equal(openrouter.chatModel, 'openai/gpt-4o-mini')
assert.equal(openrouter.embedModel, 'openai/text-embedding-3-small')
assert.equal(openrouter.embedDimensions, 1536)

const deepseek = applyProviderExamples(
  { chatProvider: 'deepseek', embedProvider: 'ollama' },
  { chatProvider: 'ollama', chatModel: 'llama3.2', embedProvider: 'ollama', embedModel: 'nomic-embed-text' },
)
assert.equal(deepseek.chatModel, 'deepseek-chat')
assert.equal(deepseek.embedModel ?? 'nomic-embed-text', 'nomic-embed-text')
assert.equal(deepseek.embedDimensions ?? 768, 768)

console.log('llm provider helpers ok')
