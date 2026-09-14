import type { CollectionConfig } from 'payload'
import { admins, anyone } from '../../access'

// Add doctor hooks (for example, media cleanup) to this module later.
export const Doctors: CollectionConfig = {
  slug: 'doctors', admin: { useAsTitle: 'name' },
  access: { read: anyone, create: admins, update: admins, delete: admins },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'specialization', type: 'text', required: true },
    { name: 'qualifications', type: 'textarea' },
    { name: 'photoUrl', type: 'text' },
    { name: 'bio', type: 'textarea' },
    { name: 'active', type: 'checkbox', defaultValue: true },
  ],
}
