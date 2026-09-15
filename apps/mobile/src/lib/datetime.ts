// Slots are stored as UTC instants and formatted in the device's locale and timezone.
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

export const formatDay = (iso: string) => dayFormat.format(new Date(iso))
export const formatTime = (iso: string) => timeFormat.format(new Date(iso))
export const formatDateTime = (iso: string) => `${formatDay(iso)} at ${formatTime(iso)}`

/** Groups slots by calendar day so the picker does not render one long undifferentiated list. */
export function groupByDay<T extends { startsAt: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const key = formatDay(item.startsAt)
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }
  return [...groups.entries()]
}
