import { useEffect, useState } from 'react'
import type { Doctor } from '../types'
import { fetchMediaObjectUrl } from '../services/api/client'

type Props = { doctor: Doctor; large?: boolean }

export function DoctorAvatar({ doctor, large }: Props) {
  const [source, setSource] = useState<string | undefined>()
  const className = large ? 'avatar large' : 'avatar'
  const photoKey =
    typeof doctor.photo === 'object' && doctor.photo !== null
      ? doctor.photo.id
      : String(doctor.photo ?? '')

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | undefined

    setSource(undefined)

    if (!doctor.photo || typeof doctor.photo === 'string') {
      return
    }

    void fetchMediaObjectUrl(doctor.photo)
      .then((url) => {
        if (cancelled || !url) return
        objectUrl = url
        setSource(url)
      })
      .catch(() => {
        if (!cancelled) setSource(undefined)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoKey, doctor.photo])

  if (source) {
    return <img className={className} src={source} alt={`Portrait of ${doctor.name}`} />
  }

  // Doctors without an uploaded photo (or while the image loads) fall back to an initial.
  return <div className={className}>{doctor.name.replace(/^Dr\.?\s*/i, '').charAt(0)}</div>
}
