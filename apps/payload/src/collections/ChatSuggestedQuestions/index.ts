import type { CollectionConfig } from 'payload'
import { admins, anyone } from '../../access'

// Pre-built questions shown as tappable chips in the mobile chat. Patients can still
// type a custom question; these only seed the conversation with known-good prompts.
export const ChatSuggestedQuestions: CollectionConfig = {
  slug: 'chat-suggested-questions',
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'order', 'active'],
    description: 'Shown as quick-start chips in the healthcare assistant chat.',
  },
  access: {
    read: anyone,
    create: admins,
    update: admins,
    delete: admins,
  },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Exact text sent to the chatbot when the chip is tapped.' },
    },
    {
      name: 'order',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
      admin: { description: 'Lower numbers appear first.' },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: { description: 'Inactive questions are hidden from the mobile app.' },
    },
  ],
}
