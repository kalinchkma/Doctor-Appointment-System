import type { CollectionConfig } from 'payload'
import { admins, ownAppointments } from '../../access'
import { appointmentEndpoints } from '../../endpoints/appointments'

// Appointments are never created through the generic REST create route. Booking has to
// claim a slot atomically, which the collection API cannot express, so `create` is closed
// and POST /api/appointments/book is the only way in. That endpoint derives the patient
// from the authenticated session and writes with overrideAccess.
export const Appointments: CollectionConfig = {
  slug: 'appointments',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['patient', 'doctor', 'slot', 'status', 'createdAt'],
  },
  timestamps: true,
  endpoints: appointmentEndpoints,
  access: {
    read: ownAppointments,
    create: () => false,
    update: admins,
    delete: admins,
  },
  fields: [
    { name: 'patient', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'doctor', type: 'relationship', relationTo: 'doctors', required: true, index: true },
    {
      name: 'slot',
      type: 'relationship',
      relationTo: 'appointment-slots',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'booked',
      index: true,
      options: ['booked', 'cancelled'],
    },
    { name: 'bookedAt', type: 'date', required: true },
    { name: 'cancelledAt', type: 'date' },
    {
      name: 'patientNote',
      type: 'textarea',
      maxLength: 500,
      admin: {
        description:
          'Special request / comment from the patient. Patients set this when booking or from appointment details.',
      },
    },
    {
      name: 'doctorComment',
      type: 'textarea',
      maxLength: 1000,
      admin: {
        description:
          'Visible to the patient on their appointment details. Use for prep instructions, reminders, or notes from the clinic.',
      },
    },
  ],
}
