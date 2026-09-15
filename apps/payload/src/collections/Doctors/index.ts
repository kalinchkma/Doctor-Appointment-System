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
      name: 'locationMap',
      type: 'ui',
      admin: {
        components: {
          Field: '/components/LocationMapField#LocationMapField',
        },
      },
    },
    {
      name: 'address',
      type: 'textarea',
      admin: {
        description: 'Clinic address shown to patients. Auto-filled when you pick a map pin.',
      },
    },
    {
      name: 'latitude',
      type: 'number',
      admin: {
        step: 0.000001,
        description: 'Set by clicking the map above (or enter manually).',
      },
    },
    {
      name: 'longitude',
      type: 'number',
      admin: {
        step: 0.000001,
        description: 'Set by clicking the map above (or enter manually).',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: { description: 'Inactive doctors are hidden from the mobile application.' },
    },
  ],
}
