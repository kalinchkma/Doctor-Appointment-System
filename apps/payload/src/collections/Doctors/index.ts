import type { CollectionConfig } from 'payload'
import { admins, anyone } from '../../access'

export const Doctors: CollectionConfig = {
  slug: 'doctors',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'specialization', 'active'],
  },
  access: { read: anyone, create: admins, update: admins, delete: admins },
  fields: [
    { name: 'name', type: 'text', required: true, index: true },
    { name: 'specialization', type: 'text', required: true, index: true },
    { name: 'qualifications', type: 'textarea' },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    { name: 'bio', type: 'textarea' },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: { description: 'Inactive doctors are hidden from the mobile application.' },
    },
  ],
}
