import type { CollectionConfig } from 'payload'
import { admins, ownAppointments } from '../../access'

export const Appointments: CollectionConfig = {
  slug: 'appointments', admin: { useAsTitle: 'id' }, timestamps: true,
  access: { read: ownAppointments, create: ({ req: { user } }) => Boolean(user), update: ownAppointments, delete: admins },
  fields: [
    { name: 'patient', type: 'relationship', relationTo: 'users', required: true, access: { create: () => false, update: () => false } },
    { name: 'doctor', type: 'relationship', relationTo: 'doctors', required: true },
    { name: 'slot', type: 'relationship', relationTo: 'appointment-slots', required: true },
    { name: 'status', type: 'select', required: true, defaultValue: 'booked', options: ['booked', 'cancelled'] },
  ],
}
