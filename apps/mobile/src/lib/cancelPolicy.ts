/** Patients must cancel at least this far ahead of the visit start. */
export const CANCEL_LEAD_MS = 60 * 60 * 1000

/** True when the patient may still cancel this visit in the app. */
export function canCancelAppointment(startsAt: string | Date, now = Date.now()): boolean {
  const start = new Date(startsAt).getTime()
  if (Number.isNaN(start)) return false
  return start - now >= CANCEL_LEAD_MS
}
