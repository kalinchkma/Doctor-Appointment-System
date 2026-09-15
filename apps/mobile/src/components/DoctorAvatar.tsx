import type { Doctor } from '../types'
import { mediaURL } from '../services/api/client'

type Props = { doctor: Doctor; large?: boolean }

export function DoctorAvatar({ doctor, large }: Props) {
  const source = mediaURL(doctor.photo)
  const className = large ? 'avatar large' : 'avatar'

  if (source) {
    return <img className={className} src={source} alt={`Portrait of ${doctor.name}`} />
  }
  // Doctors without an uploaded photo fall back to an initial rather than a broken image.
  return <div className={className}>{doctor.name.replace(/^Dr\.?\s*/i, '').charAt(0)}</div>
}
