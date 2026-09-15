import type { CollectionConfig } from 'payload'
import { admins, anyone } from '../../access'

// startsAt is a single UTC instant rather than a date plus a free-text time. Text times
// cannot be sorted or compared, and they make the uniq_doctor_startsAt index unreliable.
// The client formats the instant for display.
export const AppointmentSlots: CollectionConfig = {
  slug: 'appointment-slots',
  admin: {
    useAsTitle: 'startsAt',
    defaultColumns: ['doctor', 'startsAt', 'status'],
  },
  // Slots are created and released by the booking endpoint, so status is not writable
  // by patients. Reads are public so the mobile app can show availability before login.
  access: { read: anyone, create: admins, update: admins, delete: admins },
  fields: [
    { name: 'doctor', type: 'relationship', relationTo: 'doctors', required: true, index: true },
    {
      name: 'startsAt',
      type: 'date',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'durationMinutes', type: 'number', required: true, defaultValue: 30, min: 5, max: 240 },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'available',
      index: true,
      options: ['available', 'booked'],
    },
  ],
}
