import type { CollectionConfig } from 'payload'
import { admins, anyone } from '../../access'

export const AppointmentSlots: CollectionConfig = {
  slug: 'appointment-slots', admin: { useAsTitle: 'time' },
  access: { read: anyone, create: admins, update: admins, delete: admins },
  fields: [
    { name: 'doctor', type: 'relationship', relationTo: 'doctors', required: true },
    { name: 'date', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'time', type: 'text', required: true },
    { name: 'status', type: 'select', required: true, defaultValue: 'available', options: ['available', 'booked'] },
  ],
}
