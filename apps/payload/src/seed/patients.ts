import type { Payload } from 'payload'

/** Demo patients a judge can sign in with from the mobile app. */
export const DEMO_PATIENTS = [
  {
    name: 'Ayesha Karim',
    email: 'ayesha.karim@careconnect.demo',
    password: 'Patient123!',
  },
  {
    name: 'Rahim Uddin',
    email: 'rahim.uddin@careconnect.demo',
    password: 'Patient123!',
  },
  {
    name: 'Maya Rahman',
    email: 'maya.rahman@careconnect.demo',
    password: 'Patient123!',
  },
] as const

export async function seedPatients(payload: Payload): Promise<void> {
  for (const patient of DEMO_PATIENTS) {
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: patient.email } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.totalDocs > 0) {
      payload.logger.info(`demo patient already seeded: ${patient.email}`)
      continue
    }

    await payload.create({
      collection: 'users',
      overrideAccess: true,
      context: { patientRegistration: true },
      data: {
        name: patient.name,
        email: patient.email,
        password: patient.password,
        role: 'patient',
      },
    })
    payload.logger.info(`seeded demo patient: ${patient.email}`)
  }
}
