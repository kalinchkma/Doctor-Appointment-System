import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'
import { APIError } from 'payload'
import { randomUUID } from 'node:crypto'
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

function slotEndMs(doc: { startsAt?: unknown; endsAt?: unknown; durationMinutes?: unknown }): number {
  const startMs = new Date(String(doc.startsAt)).getTime()
  if (doc.endsAt) {
    const endMs = new Date(String(doc.endsAt)).getTime()
    if (!Number.isNaN(endMs)) return endMs
  }
  const duration = Number(doc.durationMinutes) || 30
  return startMs + duration * 60_000
}

/**
 * Application-layer guard: reject exact duplicates and time-range overlaps for the
 * same doctor. Uses an in-memory interval check so missing/stale endsAt values cannot
 * bypass overlap detection. The uniq_doctor_startsAt index remains the DB backstop.
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

  const candidates = await req.payload.find({
    collection: 'appointment-slots',
    where: {
      and: [
        { doctor: { equals: doctor } },
        { startsAt: { less_than: endsAt } },
        ...(excludeId ? [{ id: { not_equals: excludeId } }] : []),
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })

  for (const other of candidates.docs) {
    const otherStart = new Date(String(other.startsAt)).getTime()
    if (Number.isNaN(otherStart)) continue
    const otherEnd = slotEndMs(other)

    if (otherStart === startMs) {
      throw new APIError(
        'A slot for this doctor at this exact time already exists. Choose a different start time.',
        400,
        undefined,
        true,
      )
    }

    if (otherStart < endMs && otherEnd > startMs) {
      throw new APIError(
        `This slot overlaps an existing slot for this doctor (starts ${new Date(otherStart).toISOString()}, ${other.durationMinutes ?? '?'} minutes). Adjust the start time or duration.`,
        400,
        undefined,
        true,
      )
    }
  }

  data.endsAt = endsAt
  data.startsAt = startsAt
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

const ensureSeriesId: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (!data) return data
  const scheduleType = String(data.scheduleType ?? originalDoc?.scheduleType ?? 'once')
  if (scheduleType === 'once') {
    data.repeatUntil = null
    return data
  }
  if (operation === 'create' && !data.seriesId) {
    data.seriesId = randomUUID()
  }
  return data
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function sameUtcTime(onDay: Date, template: Date): Date {
  const stamp = new Date(onDay.getTime())
  stamp.setUTCHours(
    template.getUTCHours(),
    template.getUTCMinutes(),
    template.getUTCSeconds(),
    template.getUTCMilliseconds(),
  )
  return stamp
}

/**
 * Expand daily / weekday series into concrete slots so admins do not create each day by hand.
 * Sibling creates use skipSeriesExpand to avoid recursive expansion.
 */
const expandRecurringSeries: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
  context,
}) => {
  if (context.skipSeriesExpand) return doc
  if (operation !== 'create') return doc

  const scheduleType = String(doc.scheduleType || 'once')
  if (scheduleType === 'once') return doc

  const untilRaw = doc.repeatUntil
  if (!untilRaw) {
    req.payload.logger.warn({ id: doc.id }, 'recurring slot missing repeatUntil; skipping expansion')
    return doc
  }

  const templateStart = new Date(String(doc.startsAt))
  const until = new Date(String(untilRaw))
  until.setUTCHours(23, 59, 59, 999)

  if (Number.isNaN(templateStart.getTime()) || Number.isNaN(until.getTime())) {
    return doc
  }

  const durationMinutes = Number(doc.durationMinutes) || 30
  const doctor = doctorId(doc.doctor)
  const seriesId = String(doc.seriesId || doc.id)
  if (!doctor) return doc

  let created = 0
  let skipped = 0
  let cursor = addCalendarDays(templateStart, 1)

  while (cursor.getTime() <= until.getTime()) {
    const weekday = cursor.getUTCDay()
    const include =
      scheduleType === 'daily' || (scheduleType === 'weekdays' && weekday !== 0 && weekday !== 6)

    if (include) {
      const startsAt = sameUtcTime(cursor, templateStart)
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)
      try {
        await req.payload.create({
          collection: 'appointment-slots',
          overrideAccess: true,
          req,
          context: { skipSeriesExpand: true },
          data: {
            doctor,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            durationMinutes,
            status: 'available',
            scheduleType: 'once',
            seriesId,
            repeatUntil: null,
          },
        })
        created++
      } catch (error) {
        skipped++
        req.payload.logger.warn(
          { err: error, startsAt: startsAt.toISOString(), doctor },
          'skipped recurring slot (conflict or validation)',
        )
      }
    }

    cursor = addCalendarDays(cursor, 1)
  }

  req.payload.logger.info(
    { seriesId, created, skipped, scheduleType },
    'expanded recurring appointment slot series',
  )
  return doc
}

export const AppointmentSlots: CollectionConfig = {
  slug: 'appointment-slots',
  admin: {
    useAsTitle: 'startsAt',
    defaultColumns: ['doctor', 'startsAt', 'durationMinutes', 'status', 'scheduleType'],
    description:
      'Create a one-time slot, or a daily/weekday series that expands through the repeat-until date. Overlapping times for the same doctor are rejected.',
  },
  access: { read: anyone, create: admins, update: admins, delete: admins },
  hooks: {
    beforeValidate: [rejectConflictingSlots],
    beforeChange: [stampEndsAt, ensureSeriesId],
    afterChange: [expandRecurringSeries],
  },
  fields: [
    { name: 'doctor', type: 'relationship', relationTo: 'doctors', required: true, index: true },
    {
      name: 'startsAt',
      type: 'date',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'First occurrence for recurring slots; every generated day keeps this clock time.',
      },
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
    {
      name: 'scheduleType',
      type: 'select',
      required: true,
      defaultValue: 'once',
      index: true,
      options: [
        { label: 'One-time', value: 'once' },
        { label: 'Every day', value: 'daily' },
        { label: 'Weekdays (Mon–Fri)', value: 'weekdays' },
      ],
      admin: {
        description: 'Recurring choices create matching slots through the repeat-until date.',
      },
    },
    {
      name: 'repeatUntil',
      type: 'date',
      admin: {
        condition: (_data, siblingData) => {
          const scheduleType = (siblingData as { scheduleType?: string } | undefined)?.scheduleType
          return scheduleType === 'daily' || scheduleType === 'weekdays'
        },
        date: { pickerAppearance: 'dayOnly' },
        description: 'Inclusive end date for the series (required for daily/weekday schedules).',
      },
      validate: (value: unknown, { siblingData }: { siblingData?: Record<string, unknown> }) => {
        const scheduleType = siblingData?.scheduleType
        if (scheduleType === 'daily' || scheduleType === 'weekdays') {
          if (!value) return 'Repeat until is required for recurring slots.'
        }
        return true
      },
    },
    {
      name: 'seriesId',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description: 'Shared id for slots generated from one recurring create.',
      },
    },
  ],
}
