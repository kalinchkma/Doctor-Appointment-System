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
  colour: { r: number; g: number; b: number }
}

const DOCTORS: DoctorSeed[] = [
  {
    name: 'Dr Amara Osei',
    specialization: 'Obstetrics & Gynaecology',
    qualifications: 'MBBS, MRCOG — 14 years in maternal medicine',
    bio: 'Amara looks after pregnancy care from the first trimester through to postnatal recovery, with a particular interest in nutrition during pregnancy.',
    colour: { r: 122, g: 90, b: 248 },
  },
  {
    name: 'Dr Idris Rahman',
    specialization: 'Paediatrics',
    qualifications: 'MBBS, MD (Paediatrics), MRCPCH',
    bio: 'Idris treats infants and children up to sixteen, and runs a weekly clinic on childhood growth and feeding.',
    colour: { r: 32, g: 164, b: 143 },
  },
  {
    name: 'Dr Wei Lin Tan',
    specialization: 'General Medicine',
    qualifications: 'MBBS, MRCP (UK), Diploma in Family Medicine',
    bio: 'Wei Lin handles general consultations, long-term condition reviews, and referrals into specialist care.',
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
      payload.logger.info(`doctor already seeded: ${seed.name}`)
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
        photo: photo.id,
        active: true,
      },
    })

    payload.logger.info(`seeded doctor: ${seed.name}`)
  }
}
