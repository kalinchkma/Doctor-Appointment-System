import type { GlobalConfig } from 'payload'
import { admins } from '../../access'

const notOllama =
  (field: 'chatProvider' | 'embedProvider') =>
  (_: unknown, sibling: { [key: string]: unknown }) =>
    sibling?.[field] !== 'ollama'

export const RagSettings: GlobalConfig = {
  slug: 'rag-settings',
  label: 'RAG Settings',
  admin: {
    description:
      'Choose the chat and embedding providers the healthcare assistant uses. Keys stay in Payload. The Go service only calls this CMS.',
    group: 'RAG',
  },
  access: { read: admins, update: admins },
  fields: [
    {
      type: 'collapsible',
      label: 'Chat model',
      admin: { initCollapsed: false },
      fields: [
        {
          name: 'chatProvider',
          type: 'select',
          required: true,
          defaultValue: 'ollama',
          options: [
            { label: 'Ollama (local)', value: 'ollama' },
            { label: 'OpenAI', value: 'openai' },
            { label: 'Anthropic Claude', value: 'anthropic' },
            { label: 'Google Gemini', value: 'google' },
          ],
        },
        {
          name: 'chatModel',
          type: 'text',
          required: true,
          defaultValue: 'llama3.2',
          admin: {
            description:
              'Examples: llama3.2 (Ollama), gpt-4o-mini (OpenAI), claude-sonnet-4-5 (Anthropic), gemini-2.0-flash (Google).',
          },
        },
        {
          name: 'chatBaseUrl',
          type: 'text',
          admin: {
            description:
              'Leave blank for the provider default. For Ollama in Docker use http://host.docker.internal:11434/v1; on the host use http://127.0.0.1:11434/v1.',
          },
        },
        {
          name: 'chatApiKey',
          type: 'text',
          admin: {
            condition: notOllama('chatProvider'),
            description: 'Stored only in Payload. Never sent to the mobile app or committed to git.',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Embedding model',
      admin: { initCollapsed: false },
      fields: [
        {
          name: 'embedProvider',
          type: 'select',
          required: true,
          defaultValue: 'ollama',
          options: [
            { label: 'Ollama (local)', value: 'ollama' },
            { label: 'OpenAI', value: 'openai' },
            { label: 'Google Gemini', value: 'google' },
          ],
          admin: {
            description:
              'Anthropic has no embeddings API. Chat can still be Claude while embeddings stay on Ollama, OpenAI, or Google.',
          },
        },
        {
          name: 'embedModel',
          type: 'text',
          required: true,
          defaultValue: 'nomic-embed-text',
          admin: {
            description:
              'Examples: nomic-embed-text (768), text-embedding-3-small (1536), text-embedding-004 (768).',
          },
        },
        {
          name: 'embedBaseUrl',
          type: 'text',
          admin: {
            description: 'Leave blank for the provider default. Same Ollama URL rules as chat.',
          },
        },
        {
          name: 'embedApiKey',
          type: 'text',
          admin: {
            condition: notOllama('embedProvider'),
            description: 'Stored only in Payload.',
          },
        },
        {
          name: 'embedDimensions',
          type: 'number',
          required: true,
          defaultValue: 768,
          min: 8,
          admin: {
            description:
              'Must match the model output and the Atlas vector index. Changing this requires dropping the index and re-ingesting every document.',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Retrieval gates',
      admin: { initCollapsed: true },
      fields: [
        { name: 'minScore', type: 'number', required: true, defaultValue: 0.62, min: 0, max: 1 },
        { name: 'strongScore', type: 'number', required: true, defaultValue: 0.74, min: 0, max: 1 },
        { name: 'minChunks', type: 'number', required: true, defaultValue: 2, min: 1 },
        { name: 'minCoverage', type: 'number', required: true, defaultValue: 0.25, min: 0, max: 1 },
        { name: 'maxConcurrency', type: 'number', required: true, defaultValue: 4, min: 1 },
      ],
    },
  ],
}
