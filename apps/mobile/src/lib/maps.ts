import type { Doctor } from '../types'

export function hasDoctorLocation(
  doctor: Pick<Doctor, 'latitude' | 'longitude'>,
): doctor is Doctor & { latitude: number; longitude: number } {
  return typeof doctor.latitude === 'number' && typeof doctor.longitude === 'number'
}

/** Opens turn-by-turn / place view in the Google Maps app or website. */
export function googleMapsUrl(lat: number, lng: number, address?: string | null): string {
  const query = address?.trim()
    ? encodeURIComponent(address.trim())
    : `${lat},${lng}`
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}
