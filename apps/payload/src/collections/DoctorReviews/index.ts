import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
} from 'payload'
import { admins, anyone, ownReviews } from '../../access'
import { doctorReviewEndpoints } from '../../endpoints/doctorReviews'
import { recalculateDoctorRating } from '../../lib/doctorRatings'

const syncDoctorRatingAfterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  const doctorId =
    typeof doc.doctor === 'object' && doc.doctor !== null && 'id' in doc.doctor
      ? String((doc.doctor as { id: string }).id)
      : String(doc.doctor)
  if (doctorId) {
    await recalculateDoctorRating(req.payload, doctorId)
  }
  return doc
}

const syncDoctorRatingAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const doctorId =
    typeof doc.doctor === 'object' && doc.doctor !== null && 'id' in doc.doctor
      ? String((doc.doctor as { id: string }).id)
      : String(doc.doctor)
  if (doctorId) {
    await recalculateDoctorRating(req.payload, doctorId)
  }
}

export const DoctorReviews: CollectionConfig = {
  slug: 'doctor-reviews',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['doctor', 'patient', 'rating', 'createdAt'],
    description: 'Patient ratings and comments for doctors after a visit.',
  },
  timestamps: true,
  endpoints: doctorReviewEndpoints,
  access: {
    read: anyone,
    create: () => false,
    update: admins,
    delete: ownReviews,
  },
  hooks: {
    afterChange: [syncDoctorRatingAfterChange],
    afterDelete: [syncDoctorRatingAfterDelete],
  },
  fields: [
    {
      name: 'patient',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'patientName',
      type: 'text',
      required: true,
      admin: {
        description: 'Display name captured at submit time so reviews stay readable publicly.',
      },
    },
    {
      name: 'doctor',
      type: 'relationship',
      relationTo: 'doctors',
      required: true,
      index: true,
    },
    {
      name: 'appointment',
      type: 'relationship',
      relationTo: 'appointments',
      admin: {
        description: 'The past visit this review is tied to, when available.',
      },
    },
    {
      name: 'rating',
      type: 'number',
      required: true,
      min: 1,
      max: 5,
      index: true,
      admin: { description: '1 (poor) to 5 (excellent).' },
    },
    {
      name: 'comment',
      type: 'textarea',
      maxLength: 1000,
      admin: { description: 'Optional written feedback from the patient.' },
    },
  ],
}
