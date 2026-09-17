import type { Payload } from 'payload'

// Stable machine-readable codes so the mobile app can branch on the outcome without
// parsing prose. Every message here is safe to show a user directly.
export const ErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_INPUT: 'INVALID_INPUT',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  SLOT_EXPIRED: 'SLOT_EXPIRED',
  SLOT_OVERLAP: 'SLOT_OVERLAP',
  SLOT_DUPLICATE: 'SLOT_DUPLICATE',
  BOOKING_LIMIT: 'BOOKING_LIMIT',
  ALREADY_BOOKED_WITH_DOCTOR: 'ALREADY_BOOKED_WITH_DOCTOR',
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
  ALREADY_CANCELLED: 'ALREADY_CANCELLED',
  CANCEL_TOO_LATE: 'CANCEL_TOO_LATE',
  ALREADY_REVIEWED: 'ALREADY_REVIEWED',
  REVIEW_NOT_ELIGIBLE: 'REVIEW_NOT_ELIGIBLE',
  ASSISTANT_UNAVAILABLE: 'ASSISTANT_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCodeValue,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const errors = {
  unauthenticated: () =>
    new ApiError(ErrorCode.UNAUTHENTICATED, 401, 'You need to sign in to continue.'),
  forbidden: () =>
    new ApiError(ErrorCode.FORBIDDEN, 403, 'You do not have access to this resource.'),
  invalidInput: (message: string) => new ApiError(ErrorCode.INVALID_INPUT, 400, message),
  slotNotFound: () =>
    new ApiError(ErrorCode.SLOT_NOT_FOUND, 404, 'That appointment slot could not be found.'),
  slotUnavailable: () =>
    new ApiError(ErrorCode.SLOT_UNAVAILABLE, 409, 'This appointment slot is no longer available.'),
  slotExpired: () =>
    new ApiError(ErrorCode.SLOT_EXPIRED, 400, 'That appointment slot is in the past.'),
  slotOverlap: (message?: string) =>
    new ApiError(
      ErrorCode.SLOT_OVERLAP,
      400,
      message ||
        'This slot overlaps an existing slot for this doctor. Adjust the start time or duration.',
    ),
  slotDuplicate: () =>
    new ApiError(
      ErrorCode.SLOT_DUPLICATE,
      409,
      'A slot for this doctor at this exact time already exists. Choose a different start time.',
    ),
  bookingLimit: (max: number) =>
    new ApiError(
      ErrorCode.BOOKING_LIMIT,
      409,
      `You already have ${max} upcoming appointment${max === 1 ? '' : 's'}. Cancel one before booking another.`,
    ),
  alreadyBookedWithDoctor: () =>
    new ApiError(
      ErrorCode.ALREADY_BOOKED_WITH_DOCTOR,
      409,
      'You already have an upcoming appointment with this doctor. Cancel it before booking another time.',
    ),
  appointmentNotFound: () =>
    new ApiError(ErrorCode.APPOINTMENT_NOT_FOUND, 404, 'That appointment could not be found.'),
  alreadyCancelled: () =>
    new ApiError(ErrorCode.ALREADY_CANCELLED, 409, 'That appointment is already cancelled.'),
  cancelTooLate: () =>
    new ApiError(
      ErrorCode.CANCEL_TOO_LATE,
      409,
      'Cancellations need to be made at least 1 hour before the appointment. Please contact the clinic if you need help.',
    ),
  alreadyReviewed: () =>
    new ApiError(
      ErrorCode.ALREADY_REVIEWED,
      409,
      'You have already reviewed this doctor. Thank you for your feedback.',
    ),
  reviewNotEligible: () =>
    new ApiError(
      ErrorCode.REVIEW_NOT_ELIGIBLE,
      403,
      'You can review a doctor after a past appointment with them.',
    ),
}

export const json = (body: unknown, status = 200) => Response.json(body, { status })

/**
 * Converts anything thrown inside an endpoint into a safe response. Unrecognised errors
 * become a generic 500: the detail is logged server-side, never returned, so stack traces
 * and connection strings cannot leak to a client.
 */
export function toErrorResponse(error: unknown, payload: Payload, context: string): Response {
  if (error instanceof ApiError) {
    return json({ code: error.code, message: error.message }, error.status)
  }

  payload.logger.error({ err: error, context }, 'unhandled endpoint error')

  return json(
    {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong on our side. Please try again.',
    },
    500,
  )
}

const mongoErrorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

/** MongoDB duplicate-key error, raised by the uniq_active_slot index. */
export function isDuplicateKeyError(error: unknown): boolean {
  return mongoErrorCode(error) === 11000
}

/**
 * MongoDB write conflict (code 112).
 *
 * Only occurs when the booking runs inside a transaction. Under snapshot isolation two
 * transactions cannot update the same slot document, so the loser is aborted with this
 * error instead of simply seeing zero matched documents. Outside a transaction the same
 * race surfaces as a null result from findOneAndUpdate.
 *
 * MongoDB labels this retryable, but retrying here would only re-read the slot as already
 * booked and produce the same conflict response, so it is mapped straight to 409.
 */
export function isWriteConflictError(error: unknown): boolean {
  if (mongoErrorCode(error) === 112) {
    return true
  }
  const labels =
    typeof error === 'object' && error !== null && 'errorLabels' in error
      ? error.errorLabels
      : undefined

  return Array.isArray(labels) && labels.includes('TransientTransactionError')
}
