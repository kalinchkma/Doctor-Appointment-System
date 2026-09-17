import { mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import type { Payload } from 'payload'

export type DoctorSeed = {
  name: string
  specialization: string
  qualifications: string
  bio: string
  experienceYears: number
  address: string
  latitude: number
  longitude: number
  /** Stable Unsplash portrait (free Unsplash License). */
  portraitUrl: string
  /** Used only if the portrait download fails. */
  accent: { r: number; g: number; b: number }
  /** Skip open slots for the local calendar day so the app can demo "Unavailable today". */
  unavailableToday?: boolean
}

const dirname = path.dirname(fileURLToPath(import.meta.url))
const portraitCacheDir = path.resolve(dirname, 'assets/portraits')

/**
 * Seed roster for the assignment demo — Dhaka clinics, varied specialties,
 * and copy that reads like a real care-booking product.
 */
export const DOCTORS: DoctorSeed[] = [
  {
    name: 'Dr Amara Osei',
    specialization: 'Obstetrics & Gynaecology',
    qualifications: 'MBBS (Dhaka Medical), MRCOG (UK)',
    bio: 'Dr Osei provides antenatal care from the first trimester through delivery and postnatal recovery. Patients often see her for high-risk pregnancy monitoring, gestational diabetes support, and practical nutrition guidance during pregnancy. She works closely with midwifery teams at United Hospital and keeps appointments unhurried so families can ask questions.',
    experienceYears: 14,
    address: 'United Hospital, Plot 15 Rd 71, Gulshan, Dhaka 1212',
    latitude: 23.8041,
    longitude: 90.4152,
    portraitUrl:
      'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=640&h=640&q=80',
    accent: { r: 45, g: 122, b: 110 },
  },
  {
    name: 'Dr Idris Rahman',
    specialization: 'Paediatrics',
    qualifications: 'MBBS, MD (Paediatrics), MRCPCH',
    bio: 'Dr Rahman looks after infants and children through adolescence, with clinics for fever, asthma, growth concerns, and feeding difficulties. Parents value his calm explanations and clear home-care plans. He runs a weekly child nutrition and growth review session at Square Hospitals.',
    experienceYears: 12,
    address: 'Square Hospitals, 18/F Bir Uttam Qazi Nuruzzaman Rd, Panthapath, Dhaka 1205',
    latitude: 23.7516,
    longitude: 90.3783,
    portraitUrl:
      'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=640&h=640&q=80',
    accent: { r: 32, g: 128, b: 148 },
  },
  {
    name: 'Dr Wei Lin Tan',
    specialization: 'Family Medicine',
    qualifications: 'MBBS, MRCP (UK), Diploma in Family Medicine',
    bio: 'Dr Tan is a general practitioner for everyday illness, long-term conditions such as hypertension and diabetes, and timely specialist referrals. She focuses on prevention, medication reviews, and follow-up plans that fit busy family schedules at Apollo Hospitals Dhaka.',
    experienceYears: 10,
    address: 'Apollo Hospitals Dhaka, Plot 81, Block E, Bashundhara R/A, Dhaka 1229',
    latitude: 23.8131,
    longitude: 90.4236,
    portraitUrl:
      'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=640&h=640&q=80',
    accent: { r: 180, g: 110, b: 70 },
  },
  {
    name: 'Dr Nadia Chowdhury',
    specialization: 'Cardiology',
    qualifications: 'MBBS, MD (Cardiology), FACC',
    bio: 'Dr Chowdhury assesses chest pain, palpitations, and blood-pressure concerns, and manages patients after cardiac events. Her consultations cover ECG interpretation, lifestyle risk reduction, and when further imaging or hospital care is needed. She practises at Evercare Hospital Dhaka.',
    experienceYears: 16,
    address: 'Evercare Hospital Dhaka, Plot 81, Block E, Bashundhara R/A, Dhaka 1229',
    latitude: 23.8103,
    longitude: 90.4245,
    portraitUrl:
      'https://images.unsplash.com/photo-1651008376811-b90baee62c0f?auto=format&fit=crop&w=640&h=640&q=80',
    accent: { r: 150, g: 60, b: 80 },
    unavailableToday: true,
  },
  {
    name: 'Dr Farhan Ahmed',
    specialization: 'Orthopaedics',
    qualifications: 'MBBS, MS (Orthopaedics), AO Trauma Fellow',
    bio: 'Dr Ahmed treats sports injuries, back and knee pain, and fracture follow-up. He emphasises accurate diagnosis before imaging, practical physiotherapy advice, and clear expectations about recovery time. Clinic days are at Labaid Specialized Hospital in Dhanmondi.',
    experienceYears: 11,
    address: 'Labaid Specialized Hospital, House 6, Rd 4, Dhanmondi, Dhaka 1205',
    latitude: 23.7461,
    longitude: 90.3742,
    portraitUrl:
      'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=640&h=640&q=80',
    accent: { r: 70, g: 95, b: 140 },
  },
  {
    name: 'Dr Sabina Yasmin',
    specialization: 'Dermatology',
    qualifications: 'MBBS, DDV, MD (Dermatology)',
    bio: 'Dr Yasmin sees patients for acne, eczema, pigmentation, hair loss, and suspicious skin lesions. She prefers stepwise treatment plans and explains which products or prescriptions are evidence-based. Consultations are available at Ibn Sina Diagnostic & Consultation Center in Bailey Road.',
    experienceYears: 9,
    address: 'Ibn Sina Diagnostic Center, House 48, Rd 9/A, Dhanmondi, Dhaka 1209',
    latitude: 23.7455,
    longitude: 90.3762,
    portraitUrl:
      'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=640&h=640&q=80',
    accent: { r: 120, g: 90, b: 140 },
  },
]

function slugName(name: string): string {
  return name.replace(/\W+/g, '-').toLowerCase()
}

/** Soft professional fallback portrait when Unsplash is unreachable. */
async function createFallbackPortrait(seed: DoctorSeed, filePath: string): Promise<void> {
  const svg = `
    <svg width="640" height="640" viewBox="0 0 640 640" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgb(${seed.accent.r},${seed.accent.g},${seed.accent.b})"/>
          <stop offset="100%" stop-color="rgb(${Math.max(20, seed.accent.r - 40)},${Math.max(20, seed.accent.g - 30)},${Math.max(20, seed.accent.b - 20)})"/>
        </linearGradient>
      </defs>
      <rect width="640" height="640" fill="url(#bg)"/>
      <circle cx="320" cy="248" r="118" fill="rgba(255,255,255,0.94)"/>
      <ellipse cx="320" cy="540" rx="210" ry="180" fill="rgba(255,255,255,0.9)"/>
      <rect x="250" y="400" width="140" height="18" rx="9" fill="rgba(${seed.accent.r},${seed.accent.g},${seed.accent.b},0.35)"/>
    </svg>
  `

  await sharp(Buffer.from(svg)).png().toFile(filePath)
}

async function resolvePortraitFile(seed: DoctorSeed): Promise<string> {
  await mkdir(portraitCacheDir, { recursive: true })
  const cached = path.join(portraitCacheDir, `${slugName(seed.name)}.jpg`)

  try {
    await access(cached)
    return cached
  } catch {
    // download below
  }

  try {
    const response = await fetch(seed.portraitUrl, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'CareConnect-Seed/1.0 (assignment demo)' },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await sharp(buffer)
      .resize(640, 640, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 88 })
      .toFile(cached)
    return cached
  } catch {
    const fallback = path.join(portraitCacheDir, `${slugName(seed.name)}-fallback.png`)
    await createFallbackPortrait(seed, fallback)
    return fallback
  }
}

function relationId(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id)
  }
  return null
}

async function upsertPhoto(payload: Payload, seed: DoctorSeed, existingPhotoId?: string | null) {
  const filePath = await resolvePortraitFile(seed)
  const photo = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: `Portrait of ${seed.name}` },
    filePath,
  })

  if (existingPhotoId) {
    await payload
      .delete({ collection: 'media', id: existingPhotoId, overrideAccess: true })
      .catch(() => undefined)
  }

  return photo.id
}

export async function seedDoctors(payload: Payload): Promise<void> {
  for (const seed of DOCTORS) {
    const existing = await payload.find({
      collection: 'doctors',
      where: { name: { equals: seed.name } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    })

    const photoId = await upsertPhoto(payload, seed, relationId(existing.docs[0]?.photo))

    const data = {
      name: seed.name,
      specialization: seed.specialization,
      qualifications: seed.qualifications,
      bio: seed.bio,
      experienceYears: seed.experienceYears,
      address: seed.address,
      latitude: seed.latitude,
      longitude: seed.longitude,
      photo: photoId,
      active: true,
      ratingAverage: existing.docs[0]?.ratingAverage ?? 0,
      reviewCount: existing.docs[0]?.reviewCount ?? 0,
    }

    if (existing.totalDocs > 0) {
      await payload.update({
        collection: 'doctors',
        id: existing.docs[0].id,
        overrideAccess: true,
        data,
      })
      payload.logger.info(`updated doctor profile: ${seed.name}`)
      continue
    }

    await payload.create({
      collection: 'doctors',
      overrideAccess: true,
      data,
    })
    payload.logger.info(`seeded doctor: ${seed.name}`)
  }
}
