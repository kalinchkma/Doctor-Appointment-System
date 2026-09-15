import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import type { Payload } from 'payload'

type DoctorSeed = {
  name: string
  specialization: string
  qualifications: string
  bio: string
  address: string
  latitude: number
  longitude: number
  colour: { r: number; g: number; b: number }
}

const DOCTORS: DoctorSeed[] = [
  {
    name: 'Dr Amara Osei',
    specialization: 'Obstetrics & Gynaecology',
    qualifications: 'MBBS, MRCOG — 14 years in maternal medicine',
    bio: 'Amara looks after pregnancy care from the first trimester through to postnatal recovery, with a particular interest in nutrition during pregnancy.',
    address: 'United Hospital, Gulshan, Dhaka',
    latitude: 23.8041,
    longitude: 90.4152,
    colour: { r: 122, g: 90, b: 248 },
  },
  {
    name: 'Dr Idris Rahman',
    specialization: 'Paediatrics',
    qualifications: 'MBBS, MD (Paediatrics), MRCPCH',
    bio: 'Idris treats infants and children up to sixteen, and runs a weekly clinic on childhood growth and feeding.',
    address: 'Square Hospitals, Panthapath, Dhaka',
    latitude: 23.7516,
    longitude: 90.3783,
    colour: { r: 32, g: 164, b: 143 },
  },
  {
    name: 'Dr Wei Lin Tan',
    specialization: 'General Medicine',
    qualifications: 'MBBS, MRCP (UK), Diploma in Family Medicine',
    bio: 'Wei Lin handles general consultations, long-term condition reviews, and referrals into specialist care.',
    address: 'Apollo Hospitals Dhaka, Bashundhara R/A',
    latitude: 23.8131,
    longitude: 90.4236,
    colour: { r: 226, g: 118, b: 62 },
  },
]

/** Generates a flat-colour avatar so the seeded doctors have a real uploaded photo. */
async function createAvatar(seed: DoctorSeed, directory: string): Promise<string> {
  const filePath = path.join(directory, `${seed.name.replace(/\W+/g, '-').toLowerCase()}.png`)

  const image = await sharp({
    create: { width: 512, height: 512, channels: 3, background: seed.colour },
  })
    .png()
    .toBuffer()

  await writeFile(filePath, image)
  return filePath
}

export async function seedDoctors(payload: Payload): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'doctor-seed-'))

  for (const seed of DOCTORS) {
    const existing = await payload.find({
      collection: 'doctors',
      where: { name: { equals: seed.name } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.totalDocs > 0) {
      const doctor = existing.docs[0]
      if (doctor.latitude == null || doctor.longitude == null) {
        await payload.update({
          collection: 'doctors',
          id: doctor.id,
          overrideAccess: true,
          data: {
            address: seed.address,
            latitude: seed.latitude,
            longitude: seed.longitude,
          },
        })
        payload.logger.info(`updated doctor location: ${seed.name}`)
      } else {
        payload.logger.info(`doctor already seeded: ${seed.name}`)
      }
      continue
    }

    const photo = await payload.create({
      collection: 'media',
      overrideAccess: true,
      data: { alt: `Portrait of ${seed.name}` },
      filePath: await createAvatar(seed, directory),
    })

    await payload.create({
      collection: 'doctors',
      overrideAccess: true,
      data: {
        name: seed.name,
        specialization: seed.specialization,
        qualifications: seed.qualifications,
        bio: seed.bio,
        address: seed.address,
        latitude: seed.latitude,
        longitude: seed.longitude,
        photo: photo.id,
        active: true,
      },
    })

    payload.logger.info(`seeded doctor: ${seed.name}`)
  }
}
