import type { GlobalConfig } from 'payload'
import { admins } from '../../access'
import { applyProviderExamples, CHAT_MODEL_HELP, EMBED_MODEL_HELP } from '../../lib/llm/examples'

const notOllama =
  (field: 'chatProvider' | 'embedProvider') =>
  (_: unknown, sibling: { [key: string]: unknown }) =>
    sibling?.[field] !== 'ollama'

export const RagSettings: GlobalConfig = {
  slug: 'rag-settings',
  label: 'RAG Settings',
  admin: {
    description:
      'Choose the chat and embedding providers the knowledge assistant uses. Keys stay in Payload. The Go service only calls this CMS. Answers come from documents uploaded under Knowledge Files / Knowledge Documents.',
    group: 'RAG',
  },
  access: { read: admins, update: admins },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (!data) return data
        return applyProviderExamples(
          data as Record<string, unknown>,
          originalDoc as Record<string, unknown> | undefined,
        )
      },
    ],
  },
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
            description: CHAT_MODEL_HELP,
          },
        },
        {
          name: 'chatBaseUrl',
          type: 'text',
          admin: {
            description:
              'Leave blank for the provider default. For Ollama use http://host.docker.internal:11434/v1 (Docker) or http://127.0.0.1:11434/v1 (host). Do not paste a full .../generateContent URL here.',
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
            description: EMBED_MODEL_HELP,
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
        {
          name: 'minScore',
          type: 'number',
          required: true,
          defaultValue: 0.5,
          min: 0,
          max: 1,
          admin: {
            description:
              'Atlas cosine is (1+cos)/2, so ~0.50 is unrelated. Drop chunks below this floor.',
          },
        },
        {
          name: 'strongScore',
          type: 'number',
          required: true,
          defaultValue: 0.58,
          min: 0,
          max: 1,
          admin: {
            description:
              'A hit at or above this is a strong vector match. Seeded document questions typically land here after nomic prefixes.',
          },
        },
        {
          name: 'minChunks',
          type: 'number',
          required: true,
          defaultValue: 1,
          min: 1,
          admin: {
            description: 'Minimum chunks above the score floor before the LLM is asked.',
          },
        },
        {
          name: 'minCoverage',
          type: 'number',
          required: true,
          defaultValue: 0.25,
          min: 0,
          max: 1,
          admin: {
            description:
              'Fraction of question content-words that must appear in retrieved text. High similarity + low coverage is "related topic, wrong question".',
          },
        },
        { name: 'maxConcurrency', type: 'number', required: true, defaultValue: 4, min: 1 },
      ],
    },
  ],
}
