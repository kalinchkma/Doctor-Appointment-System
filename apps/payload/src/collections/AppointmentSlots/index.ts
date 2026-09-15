import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'
import { APIError } from 'payload'
import { admins, anyone } from '../../access'

function doctorId(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id)
  }
  return null
}

function interval(startsAt: string, durationMinutes: number) {
  const startMs = new Date(startsAt).getTime()
  if (Number.isNaN(startMs)) {
    throw new APIError('A valid start time is required.', 400, undefined, true)
  }
  const endMs = startMs + durationMinutes * 60_000
  return {
    startMs,
    endMs,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
  }
}

/**
 * Application-layer guard: reject exact duplicates and time-range overlaps for the
 * same doctor. The uniq_doctor_startsAt index remains the database backstop for races.
 */
const rejectConflictingSlots: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  if (!data) return data

  const doctor = doctorId(data.doctor ?? originalDoc?.doctor)
  const startsAtRaw = (data.startsAt ?? originalDoc?.startsAt) as string | undefined
  const durationMinutes = Number(data.durationMinutes ?? originalDoc?.durationMinutes ?? 30)

  if (!doctor || !startsAtRaw || !Number.isFinite(durationMinutes)) {
    return data
  }

  const { startMs, endMs, startsAt, endsAt } = interval(startsAtRaw, durationMinutes)
  const excludeId =
    operation === 'update' && originalDoc?.id != null ? String(originalDoc.id) : null

  const exact = await req.payload.find({
    collection: 'appointment-slots',
    where: {
      and: [
        { doctor: { equals: doctor } },
        { startsAt: { equals: startsAt } },
        ...(excludeId ? [{ id: { not_equals: excludeId } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (exact.totalDocs > 0) {
    throw new APIError(
      'A slot for this doctor at this exact time already exists. Choose a different start time.',
      400,
      undefined,
      true,
    )
  }

  // Overlap: existing.startsAt < newEnd AND existing.endsAt > newStart
  const overlapping = await req.payload.find({
    collection: 'appointment-slots',
    where: {
      and: [
        { doctor: { equals: doctor } },
        { startsAt: { less_than: endsAt } },
        { endsAt: { greater_than: startsAt } },
        ...(excludeId ? [{ id: { not_equals: excludeId } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (overlapping.totalDocs > 0) {
    const other = overlapping.docs[0]
    const otherStart = other?.startsAt
      ? new Date(String(other.startsAt)).toISOString()
      : 'another time'
    throw new APIError(
      `This slot overlaps an existing slot for this doctor (starts ${otherStart}, ${other?.durationMinutes ?? '?'} minutes). Adjust the start time or duration.`,
      400,
      undefined,
      true,
    )
  }

  data.endsAt = new Date(endMs).toISOString()
  data.startsAt = new Date(startMs).toISOString()
  return data
}

const stampEndsAt: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const startsAt = (data?.startsAt ?? originalDoc?.startsAt) as string | undefined
  const durationMinutes = Number(data?.durationMinutes ?? originalDoc?.durationMinutes ?? 30)
  if (!startsAt || !Number.isFinite(durationMinutes)) return data
  const startMs = new Date(startsAt).getTime()
  if (Number.isNaN(startMs)) return data
  return {
    ...data,
    endsAt: new Date(startMs + durationMinutes * 60_000).toISOString(),
  }
}

// startsAt is a single UTC instant rather than a date plus a free-text time. Text times
// cannot be sorted or compared, and they make the uniq_doctor_startsAt index unreliable.
// The client formats the instant for display.
export const AppointmentSlots: CollectionConfig = {
  slug: 'appointment-slots',
  admin: {
    useAsTitle: 'startsAt',
    defaultColumns: ['doctor', 'startsAt', 'durationMinutes', 'status'],
  },
  // Slots are created and released by the booking endpoint, so status is not writable
  // by patients. Reads are public so the mobile app can show availability before login.
  access: { read: anyone, create: admins, update: admins, delete: admins },
  hooks: {
    beforeValidate: [rejectConflictingSlots],
    beforeChange: [stampEndsAt],
  },
  fields: [
    { name: 'doctor', type: 'relationship', relationTo: 'doctors', required: true, index: true },
    {
      name: 'startsAt',
      type: 'date',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'endsAt',
      type: 'date',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Computed from start time + duration. Used for overlap checks.',
      },
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
